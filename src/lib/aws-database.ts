import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { dynamoDB, s3Client, S3_BUCKET_NAME, getS3Url, getS3Key, TABLES } from './aws-config'
import type { Team, Tournament, Organizer, Match } from '../types'
import { cache, cacheKeys } from './cache'

// Helper function to upload image to S3
export const uploadImageToS3 = async (file: File, key: string): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: uint8Array,
    ContentType: file.type,
    // ACL removed - bucket should be configured with public read policy
  }))
  
  return getS3Url(key)
}

// Helper function to delete image from S3
export const deleteImageFromS3 = async (url: string): Promise<void> => {
  const key = getS3Key(url)
  await s3Client.send(new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  }))
}

// Organizer operations
export const organizerService = {
  async getAll(): Promise<Organizer[]> {
    const cached = cache.get<Organizer[]>(cacheKeys.organizers.all)
    if (cached) {
      return cached
    }

    try {
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.ORGANIZERS,
      }))
      
      const organizers = result.Items?.map(item => ({
        id: item.id,
        name: item.name,
        email: item.email,
        createdAtISO: item.createdAtISO,
        logo: item.logo,
        description: item.description,
      })) || []

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
      
      await dynamoDB.send(new PutCommand({
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
      
      await dynamoDB.send(new UpdateCommand({
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
      await dynamoDB.send(new DeleteCommand({
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
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.TEAMS,
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
      const result = await dynamoDB.send(new QueryCommand({
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
      
      await dynamoDB.send(new PutCommand({
        TableName: TABLES.TEAMS,
        Item: newTeam,
      }))
      
      cache.clearPattern('^teams:')
      return newTeam
    } catch (error) {
      console.error('Error creating team:', error)
      return null
    }
  },

  async update(id: string, updates: Partial<Team>): Promise<boolean> {
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
      
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }))
      
      cache.clearPattern('^teams:')
      return true
    } catch (error) {
      console.error('Error updating team:', error)
      return false
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await dynamoDB.send(new DeleteCommand({
        TableName: TABLES.TEAMS,
        Key: { id },
      }))
      
      cache.clearPattern('^teams:')
      return true
    } catch (error) {
      console.error('Error deleting team:', error)
      return false
    }
  }
}

// Tournament operations
export const tournamentService = {
  async getAll(): Promise<Tournament[]> {
    const cached = cache.get<Tournament[]>(cacheKeys.tournaments.all)
    if (cached) {
      return cached
    }

    try {
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.TOURNAMENTS,
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
      })) || []

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
      const result = await dynamoDB.send(new QueryCommand({
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
      
      await dynamoDB.send(new PutCommand({
        TableName: TABLES.TOURNAMENTS,
        Item: newTournament,
      }))
      
      cache.clearPattern('^tournaments:')
      console.log('AWS: Tournament created successfully in DynamoDB:', newTournament.id)
      return newTournament
    } catch (error) {
      console.error('AWS: Error creating tournament in DynamoDB:', error)
      return null
    }
  },

  async update(id: string, updates: Partial<Tournament>): Promise<boolean> {
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
      
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }))
      
      cache.clearPattern('^tournaments:')
      return true
    } catch (error) {
      console.error('Error updating tournament:', error)
      return false
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await dynamoDB.send(new DeleteCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id },
      }))
      
      cache.clearPattern('^tournaments:')
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
      // Get the tournament first
      const tournamentResult = await dynamoDB.send(new GetCommand({
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
      
      // Update the tournament with the new matches
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.TOURNAMENTS,
        Key: { id: tournamentId },
        UpdateExpression: 'SET matches = :matches',
        ExpressionAttributeValues: {
          ':matches': updatedMatches,
        },
      }))
      
      cache.clearPattern('^tournaments:')
      return true
    } catch (error) {
      console.error('Error updating match in tournament:', error)
      return false
    }
  }
}
