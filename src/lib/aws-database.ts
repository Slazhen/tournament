import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { 
  readOnlyDynamoDB, 
  writeDynamoDB, 
  writeS3Client, 
  S3_BUCKET_NAME, 
  getS3Url, 
  getS3Key, 
  TABLES,
} from './aws-config'
import type { Team, Tournament, Organizer, Match } from '../types'
import { cache, cacheKeys } from './cache'

// Helper function to upload image to S3 (requires write permissions)
export const uploadImageToS3 = async (file: File, key: string): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  await writeS3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: uint8Array,
    ContentType: file.type,
    // ACL removed - bucket should be configured with public read policy
  }))
  
  return getS3Url(key)
}

// Helper function to delete image from S3 (requires write permissions)
export const deleteImageFromS3 = async (url: string): Promise<void> => {
  const key = getS3Key(url)
  await writeS3Client.send(new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  }))
}

// Helper function to perform paginated scan (more efficient than full scan)
async function paginatedScan<T>(
  tableName: string,
  client: typeof readOnlyDynamoDB,
  projectionExpression?: string,
  expressionAttributeNames?: Record<string, string>
): Promise<T[]> {
  const allItems: T[] = []
  let lastEvaluatedKey: Record<string, any> | undefined = undefined
  
  do {
    const scanParams: any = {
      TableName: tableName,
      Limit: 100, // Process in smaller chunks to reduce capacity consumption
    }
    
    if (projectionExpression) {
      scanParams.ProjectionExpression = projectionExpression
    }
    
    if (expressionAttributeNames) {
      scanParams.ExpressionAttributeNames = expressionAttributeNames
    }
    
    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey
    }
    
    const result = await client.send(new ScanCommand(scanParams))
    
    if (result.Items) {
      allItems.push(...(result.Items as T[]))
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey
  } while (lastEvaluatedKey)
  
  return allItems
}

// Organizer operations
export const organizerService = {
  async getAll(): Promise<Organizer[]> {
    const cached = cache.get<Organizer[]>(cacheKeys.organizers.all)
    if (cached) {
      return cached
    }

    try {
      // Use paginated scan with projection to reduce read capacity (fewer bytes = fewer RCUs)
      const items = await paginatedScan<any>(
        TABLES.ORGANIZERS,
        readOnlyDynamoDB,
        'id, #n, email, createdAtISO, logo, description',
        { '#n': 'name' }
      )
      
      const organizers = items.map(item => ({
        id: item.id,
        name: item.name,
        email: item.email,
        createdAtISO: item.createdAtISO,
        logo: item.logo,
        description: item.description,
      }))

      cache.set(cacheKeys.organizers.all, organizers)
      return organizers
    } catch (error) {
      console.error('Error fetching organizers:', error)
      return []
    }
  },

  async create(name: string, email: string): Promise<Organizer | null> {
    try {
      const organizer: Organizer = {
        id: `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        email,
        createdAtISO: new Date().toISOString(),
      }
      
      // Write operation - use write client
      await writeDynamoDB.send(new PutCommand({
        TableName: TABLES.ORGANIZERS,
        Item: organizer,
      }))
      
      cache.clear(cacheKeys.organizers.all)
      return organizer
    } catch (error) {
      console.error('Error creating organizer:', error)
      return null
    }
  },

  async update(id: string, updates: Partial<Organizer>): Promise<boolean> {
    try {
      const updateExpression: string[] = []
      const expressionAttributeNames: Record<string, string> = {}
      const expressionAttributeValues: Record<string, any> = {}
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpression.push(`#${key} = :${key}`)
          expressionAttributeNames[`#${key}`] = key
          expressionAttributeValues[`:${key}`] = value
        }
      })
      
      if (updateExpression.length === 0) return true
      
      // Write operation - use write client
      await writeDynamoDB.send(new UpdateCommand({
        TableName: TABLES.ORGANIZERS,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }))
      
      cache.clear(cacheKeys.organizers.all)
      return true
    } catch (error) {
      console.error('Error updating organizer:', error)
      return false
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      // Write operation - use write client
      await writeDynamoDB.send(new DeleteCommand({
        TableName: TABLES.ORGANIZERS,
        Key: { id },
      }))
      
      cache.clear(cacheKeys.organizers.all)
      return true
    } catch (error) {
      console.error('Error deleting organizer:', error)
      return false
    }
  }
}

// Team operations
export const teamService = {
  async getAll(): Promise<Team[]> {
    const cached = cache.get<Team[]>(cacheKeys.teams.all)
    if (cached) {
      return cached
    }

    try {
      // Use paginated scan with projection to reduce read capacity (fewer bytes = fewer RCUs)
      const items = await paginatedScan<any>(
        TABLES.TEAMS,
        readOnlyDynamoDB,
        'id, #n, colors, logo, photo, establishedDate, organizerId, createdAtISO, players, socialMedia',
        { '#n': 'name' }
      )
      
      const teams = items.map(item => ({
        id: item.id,
        name: item.name,
        colors: item.colors || [],
        logo: item.logo,
        photo: item.photo,
        establishedDate: item.establishedDate,
        organizerId: item.organizerId,
        createdAtISO: item.createdAtISO,
        players: item.players || [],
        socialMedia: item.socialMedia,
      }))

      cache.set(cacheKeys.teams.all, teams)
      return teams
    } catch (error) {
      console.error('Error fetching teams:', error)
      return []
    }
  },

  async getByOrganizer(organizerId: string): Promise<Team[]> {
    const cacheKey = cacheKeys.teams.byOrganizer(organizerId)
    const cached = cache.get<Team[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // Read operation - use read-only client
      const result = await readOnlyDynamoDB.send(new QueryCommand({
        TableName: TABLES.TEAMS,
        IndexName: 'organizerId-index',
        KeyConditionExpression: 'organizerId = :organizerId',
        ExpressionAttributeValues: {
          ':organizerId': organizerId,
        },
      }))
      
      const teams = result.Items?.map(item => ({
        id: item.id,
        name: item.name,
        colors: item.colors || [],
        logo: item.logo,
        photo: item.photo,
        establishedDate: item.establishedDate,
        organizerId: item.organizerId,
        createdAtISO: item.createdAtISO,
        players: item.players || [],
        socialMedia: item.socialMedia,
      })) || []

      cache.set(cacheKey, teams)
      return teams
    } catch (error) {
      console.error('Error fetching teams by organizer:', error)
      return []
    }
  },

  async create(team: Omit<Team, 'id' | 'createdAtISO'>): Promise<Team | null> {
    try {
      const newTeam: Team = {
        ...team,
        id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAtISO: new Date().toISOString(),
      }
      
      // Write operation - use write client
      await writeDynamoDB.send(new PutCommand({
        TableName: TABLES.TEAMS,
        Item: newTeam,
      }))
      
      // Targeted cache invalidation
      cache.clear(cacheKeys.teams.all)
      cache.clear(cacheKeys.teams.byOrganizer(newTeam.organizerId))
      return newTeam
    } catch (error) {
      console.error('Error creating team:', error)
      return null
    }
  },

  async update(id: string, updates: Partial<Team>): Promise<boolean> {
    try {
      // Get team to find organizerId for targeted cache clearing (read operation)
      const teamResult = await readOnlyDynamoDB.send(new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
      }))
      
      const organizerId = teamResult.Item?.organizerId
      const oldOrganizerId = organizerId
      const newOrganizerId = updates.organizerId
      
      const updateExpression: string[] = []
      const expressionAttributeNames: Record<string, string> = {}
      const expressionAttributeValues: Record<string, any> = {}
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpression.push(`#${key} = :${key}`)
          expressionAttributeNames[`#${key}`] = key
          expressionAttributeValues[`:${key}`] = value
        }
      })
      
      if (updateExpression.length === 0) return true
      
      // Write operation - use write client
      await writeDynamoDB.send(new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }))
      
      // Targeted cache invalidation
      cache.clear(cacheKeys.teams.byId(id))
      cache.clear(cacheKeys.teams.all)
      if (oldOrganizerId) {
        cache.clear(cacheKeys.teams.byOrganizer(oldOrganizerId))
      }
      if (newOrganizerId && newOrganizerId !== oldOrganizerId) {
        cache.clear(cacheKeys.teams.byOrganizer(newOrganizerId))
      }
      return true
    } catch (error) {
      console.error('Error updating team:', error)
      return false
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      // Get team to find organizerId for targeted cache clearing (read operation)
      const teamResult = await readOnlyDynamoDB.send(new GetCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
      }))
      
      const organizerId = teamResult.Item?.organizerId
      
      // Write operation - use write client
      await writeDynamoDB.send(new DeleteCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
      }))
      
      // Targeted cache invalidation
      cache.clear(cacheKeys.teams.byId(id))
      cache.clear(cacheKeys.teams.all)
      if (organizerId) {
        cache.clear(cacheKeys.teams.byOrganizer(organizerId))
      }
      return true
    } catch (error) {
      console.error('Error deleting team:', error)
      return false
    }
  }
}

// Batch operations for efficient loading
export const batchGetTeams = async (teamIds: string[]): Promise<Team[]> => {
  if (!teamIds || teamIds.length === 0) return []
  
  // Check cache first
  const cachedTeams: Team[] = []
  const uncachedIds: string[] = []
  
  for (const teamId of teamIds) {
    const cached = cache.get<Team>(cacheKeys.teams.byId(teamId))
    if (cached) {
      cachedTeams.push(cached)
    } else {
      uncachedIds.push(teamId)
    }
  }
  
  // If all teams are cached, return them
  if (uncachedIds.length === 0) {
    return cachedTeams
  }
  
  // Batch get uncached teams (DynamoDB allows up to 100 items per batch)
  const allTeams = [...cachedTeams]
  
  // Process in batches of 100 (DynamoDB limit)
  for (let i = 0; i < uncachedIds.length; i += 100) {
    const batch = uncachedIds.slice(i, i + 100)
    
    try {
      const result = await readOnlyDynamoDB.send(new BatchGetCommand({
        RequestItems: {
          [TABLES.TEAMS]: {
            Keys: batch.map(id => ({ id }))
          }
        }
      }))
      
      const batchTeams = (result.Responses?.[TABLES.TEAMS] || []).map(item => ({
        id: item.id,
        name: item.name,
        colors: item.colors || [],
        logo: item.logo,
        photo: item.photo,
        establishedDate: item.establishedDate,
        organizerId: item.organizerId,
        createdAtISO: item.createdAtISO,
        players: item.players || [],
        socialMedia: item.socialMedia,
      })) as Team[]
      
      // Cache each team individually
      batchTeams.forEach(team => {
        cache.set(cacheKeys.teams.byId(team.id), team)
      })
      
      allTeams.push(...batchTeams)
    } catch (error) {
      console.error('Error batch loading teams:', error)
    }
  }
  
  return allTeams
}

// Tournament operations
export const tournamentService = {
  async getAll(): Promise<Tournament[]> {
    const cached = cache.get<Tournament[]>(cacheKeys.tournaments.all)
    if (cached) {
      return cached
    }

    try {
      // Use paginated scan with projection to reduce read capacity (fewer bytes = fewer RCUs)
      const items = await paginatedScan<any>(
        TABLES.TOURNAMENTS,
        readOnlyDynamoDB,
        'id, #n, #fmt, teamIds, organizerId, createdAtISO, #mat, playoffBracket, #s, logo, backgroundImage, #loc, socialMedia, #vis',
        { '#n': 'name', '#s': 'settings', '#fmt': 'format', '#mat': 'matches', '#loc': 'location', '#vis': 'visibility' }
      )
      
      const tournaments = items.map(item => ({
        id: item.id,
        name: item.name,
        format: item.format,
        teamIds: item.teamIds || [],
        organizerId: item.organizerId,
        createdAtISO: item.createdAtISO,
        matches: item.matches || [],
        playoffBracket: item.playoffBracket,
        settings: item.settings,
        logo: item.logo,
        backgroundImage: item.backgroundImage,
        location: item.location,
        socialMedia: item.socialMedia,
        visibility: item.visibility,
      }))

      cache.set(cacheKeys.tournaments.all, tournaments)
      return tournaments
    } catch (error) {
      console.error('Error fetching tournaments:', error)
      return []
    }
  },

  async getByOrganizer(organizerId: string): Promise<Tournament[]> {
    const cacheKey = cacheKeys.tournaments.byOrganizer(organizerId)
    const cached = cache.get<Tournament[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // Read operation - use read-only client
      const result = await readOnlyDynamoDB.send(new QueryCommand({
        TableName: TABLES.TOURNAMENTS,
        IndexName: 'organizerId-index',
        KeyConditionExpression: 'organizerId = :organizerId',
        ExpressionAttributeValues: {
          ':organizerId': organizerId,
        },
      }))
      
      const tournaments = result.Items?.map(item => ({
        id: item.id,
        name: item.name,
        format: item.format,
        teamIds: item.teamIds || [],
        organizerId: item.organizerId,
        createdAtISO: item.createdAtISO,
        matches: item.matches || [],
        playoffBracket: item.playoffBracket,
        settings: item.settings,
        logo: item.logo,
        backgroundImage: item.backgroundImage,
        location: item.location,
        socialMedia: item.socialMedia,
        visibility: item.visibility,
      })) || []

      cache.set(cacheKey, tournaments)
      return tournaments
    } catch (error) {
      console.error('Error fetching tournaments by organizer:', error)
      return []
    }
  },

  async create(tournament: Omit<Tournament, 'id' | 'createdAtISO'>): Promise<Tournament | null> {
    try {
      const newTournament: Tournament = {
        ...tournament,
        id: `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAtISO: new Date().toISOString(),
      }
      
      console.log('AWS: Creating tournament in DynamoDB:', {
        tableName: TABLES.TOURNAMENTS,
        tournamentId: newTournament.id,
        tournamentName: newTournament.name,
        organizerId: newTournament.organizerId
      })
      
      // Write operation - use write client
      await writeDynamoDB.send(new PutCommand({
        TableName: TABLES.TOURNAMENTS,
        Item: newTournament,
      }))
      
      // Targeted cache invalidation - only clear relevant caches
      cache.clear(cacheKeys.tournaments.all)
      cache.clear(cacheKeys.tournaments.byOrganizer(newTournament.organizerId))
      console.log('AWS: Tournament created successfully in DynamoDB:', newTournament.id)
      return newTournament
    } catch (error) {
      console.error('AWS: Error creating tournament in DynamoDB:', error)
      return null
    }
  },

  async update(id: string, updates: Partial<Tournament>): Promise<boolean> {
    try {
      // Get tournament to find organizerId for targeted cache clearing (read operation)
      const tournamentResult = await readOnlyDynamoDB.send(new GetCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
      }))
      
      const organizerId = tournamentResult.Item?.organizerId
      
      const updateExpression: string[] = []
      const expressionAttributeNames: Record<string, string> = {}
      const expressionAttributeValues: Record<string, any> = {}
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpression.push(`#${key} = :${key}`)
          expressionAttributeNames[`#${key}`] = key
          expressionAttributeValues[`:${key}`] = value
        }
      })
      
      if (updateExpression.length === 0) return true
      
      // Write operation - use write client
      await writeDynamoDB.send(new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }))
      
      // Targeted cache invalidation
      cache.clear(cacheKeys.tournaments.byId(id))
      cache.clear(cacheKeys.tournaments.all)
      if (organizerId) {
        cache.clear(cacheKeys.tournaments.byOrganizer(organizerId))
      }
      return true
    } catch (error) {
      console.error('Error updating tournament:', error)
      return false
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      // Get tournament to find organizerId for targeted cache clearing (read operation)
      const tournamentResult = await readOnlyDynamoDB.send(new GetCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
      }))
      
      const organizerId = tournamentResult.Item?.organizerId
      
      // Write operation - use write client
      await writeDynamoDB.send(new DeleteCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
      }))
      
      // Targeted cache invalidation
      cache.clear(cacheKeys.tournaments.byId(id))
      cache.clear(cacheKeys.tournaments.all)
      if (organizerId) {
        cache.clear(cacheKeys.tournaments.byOrganizer(organizerId))
      }
      return true
    } catch (error) {
      console.error('Error deleting tournament:', error)
      return false
    }
  }
}

// Match operations (stored within tournaments)
export const matchService = {
  async updateMatchInTournament(tournamentId: string, matchId: string, updates: Partial<Match>): Promise<boolean> {
    try {
      // Get the tournament first (read operation)
      const tournamentResult = await readOnlyDynamoDB.send(new GetCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
      }))
      
      if (!tournamentResult.Item) {
        console.error('Tournament not found:', tournamentId)
        return false
      }
      
      const tournament = tournamentResult.Item as Tournament
      const matches = tournament.matches || []
      
      // Update the specific match
      const updatedMatches = matches.map(match => 
        match.id === matchId ? { ...match, ...updates } : match
      )
      
      // Update the tournament with the new matches (write operation)
      await writeDynamoDB.send(new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        UpdateExpression: 'SET matches = :matches',
        ExpressionAttributeValues: {
          ':matches': updatedMatches,
        },
      }))
      
      // Targeted cache invalidation - only clear relevant caches
      cache.clear(cacheKeys.tournaments.byId(tournamentId))
      cache.clear(cacheKeys.tournaments.all)
      cache.clear(cacheKeys.tournaments.byOrganizer(tournament.organizerId))
      return true
    } catch (error) {
      console.error('Error updating match in tournament:', error)
      return false
    }
  }
}
