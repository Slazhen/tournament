import { dynamoDB, TABLES } from '../lib/aws-config'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { compressImage, getCompressionOptions, formatFileSize } from './imageCompression'

export interface ImageProcessingStats {
  totalImages: number
  processedImages: number
  skippedImages: number
  failedImages: number
  totalOriginalSize: number
  totalCompressedSize: number
  totalSavings: number
  averageCompressionRatio: number
}

export interface ImageProcessingResult {
  id: string
  type: 'organizer' | 'tournament' | 'team' | 'player'
  name: string
  originalUrl: string
  compressedUrl?: string
  originalSize: number
  compressedSize?: number
  compressionRatio?: number
  status: 'success' | 'skipped' | 'failed'
  error?: string
}

/**
 * Download an image from URL and return as File object
 * @param url - Image URL
 * @param filename - Filename for the File object
 * @returns Promise<File> - The image as a File object
 */
async function downloadImageAsFile(url: string, filename: string): Promise<File> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type })
  } catch (error) {
    throw new Error(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Upload compressed image to S3 and return new URL
 * @param compressedFile - The compressed image file
 * @param originalUrl - Original image URL for path reference
 * @returns Promise<string> - New S3 URL
 */
async function uploadCompressedImage(compressedFile: File, originalUrl: string): Promise<string> {
  // This would integrate with your existing S3 upload logic
  // For now, we'll return a placeholder that indicates compression
  const timestamp = Date.now()
  const extension = compressedFile.name.split('.').pop() || 'jpg'
  const compressedFilename = `compressed_${timestamp}.${extension}`
  
  // TODO: Implement actual S3 upload logic here
  // This should use your existing uploadImageToS3 function
  console.log('Would upload compressed image:', {
    originalUrl,
    compressedFilename,
    compressedSize: formatFileSize(compressedFile.size)
  })
  
  // Placeholder return - replace with actual S3 URL
  return originalUrl.replace(/\.(jpg|jpeg|png|webp)$/i, `_compressed_${timestamp}.$1`)
}

/**
 * Process images for a specific entity type
 * @param entityType - Type of entity ('organizer', 'tournament', 'team', 'player')
 * @param tableName - DynamoDB table name
 * @param imageField - Field name containing the image URL
 * @param compressionType - Compression type to use
 * @returns Promise<ImageProcessingResult[]> - Processing results
 */
// Helper: paginated scan with optional projection to reduce read capacity (fewer attributes = fewer RCUs)
async function paginatedScan(
  tableName: string,
  client: typeof dynamoDB,
  projectionExpression?: string,
  expressionAttributeNames?: Record<string, string>
): Promise<any[]> {
  const allItems: any[] = []
  let lastEvaluatedKey: Record<string, any> | undefined = undefined

  do {
    const scanParams: any = {
      TableName: tableName,
      Limit: 100,
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
      allItems.push(...result.Items)
    }

    lastEvaluatedKey = result.LastEvaluatedKey
  } while (lastEvaluatedKey)

  return allItems
}

async function processEntityImages(
  entityType: 'organizer' | 'tournament' | 'team' | 'player',
  tableName: string,
  imageField: string,
  compressionType: 'logo' | 'profile' | 'tournament' | 'team' | 'general'
): Promise<ImageProcessingResult[]> {
  const results: ImageProcessingResult[] = []
  
  try {
    // Project only id, name, and image field to minimize read capacity (DynamoDB charges per KB read)
    const items = await paginatedScan(
      tableName,
      dynamoDB,
      `id, #n, ${imageField}`,
      { '#n': 'name' }
    )
    console.log(`Found ${items.length} ${entityType}s to process`)
    
    for (const item of items) {
      const imageUrl = item[imageField]
      const itemName = item.name || item.id || 'Unknown'
      
      if (!imageUrl || typeof imageUrl !== 'string') {
        results.push({
          id: item.id,
          type: entityType,
          name: itemName,
          originalUrl: '',
          originalSize: 0,
          status: 'skipped'
        })
        continue
      }
      
      try {
        console.log(`Processing ${entityType}: ${itemName}`)
        
        // Download the image
        const imageFile = await downloadImageAsFile(imageUrl, `${itemName}_${entityType}.jpg`)
        const originalSize = imageFile.size
        
        // Get compression options
        const compressionOptions = getCompressionOptions(compressionType)
        
        // Compress the image
        const compressionResult = await compressImage(imageFile, compressionOptions)
        
        // Upload compressed image
        const compressedUrl = await uploadCompressedImage(compressionResult.compressedFile, imageUrl)
        
        // Update the database record
        await dynamoDB.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: item.id },
          UpdateExpression: `SET ${imageField} = :compressedUrl`,
          ExpressionAttributeValues: {
            ':compressedUrl': compressedUrl
          }
        }))
        
        results.push({
          id: item.id,
          type: entityType,
          name: itemName,
          originalUrl: imageUrl,
          compressedUrl,
          originalSize,
          compressedSize: compressionResult.compressedSize,
          compressionRatio: compressionResult.compressionRatio,
          status: 'success'
        })
        
        console.log(`✓ Successfully processed ${entityType}: ${itemName} (${compressionResult.compressionRatio.toFixed(1)}% reduction)`)
        
      } catch (error) {
        console.error(`✗ Failed to process ${entityType}: ${itemName}`, error)
        results.push({
          id: item.id,
          type: entityType,
          name: itemName,
          originalUrl: imageUrl,
          originalSize: 0,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
  } catch (error) {
    console.error(`Error scanning ${entityType} table:`, error)
    throw error
  }
  
  return results
}

/**
 * Process all images in the database.
 * Uses full table scans — run sparingly (e.g. monthly) to avoid high DynamoDB read costs.
 *
 * @param options - Processing options
 * @returns Promise<ImageProcessingStats> - Overall processing statistics
 */
export async function processAllImages(options: {
  skipOrganizers?: boolean
  skipTournaments?: boolean
  skipTeams?: boolean
  skipPlayers?: boolean
  dryRun?: boolean
} = {}): Promise<ImageProcessingStats> {
  const stats: ImageProcessingStats = {
    totalImages: 0,
    processedImages: 0,
    skippedImages: 0,
    failedImages: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    totalSavings: 0,
    averageCompressionRatio: 0
  }
  
  const allResults: ImageProcessingResult[] = []
  
  try {
    console.log('Starting image processing...')
    console.log('Options:', options)
    
    // Process organizers
    if (!options.skipOrganizers) {
      console.log('\n=== Processing Organizers ===')
      const organizerResults = await processEntityImages('organizer', TABLES.ORGANIZERS, 'logo', 'logo')
      allResults.push(...organizerResults)
    }
    
    // Process tournaments
    if (!options.skipTournaments) {
      console.log('\n=== Processing Tournaments ===')
      const tournamentResults = await processEntityImages('tournament', TABLES.TOURNAMENTS, 'logo', 'tournament')
      allResults.push(...tournamentResults)
    }
    
    // Process teams
    if (!options.skipTeams) {
      console.log('\n=== Processing Teams ===')
      const teamResults = await processEntityImages('team', TABLES.TEAMS, 'logo', 'team')
      allResults.push(...teamResults)
    }
    
    // Process players (if you have a players table)
    // Note: PLAYERS table doesn't exist in current configuration
    // if (!options.skipPlayers && TABLES.PLAYERS) {
    //   console.log('\n=== Processing Players ===')
    //   const playerResults = await processEntityImages('player', TABLES.PLAYERS, 'photo', 'profile')
    //   allResults.push(...playerResults)
    // }
    
    // Calculate statistics
    stats.totalImages = allResults.length
    stats.processedImages = allResults.filter(r => r.status === 'success').length
    stats.skippedImages = allResults.filter(r => r.status === 'skipped').length
    stats.failedImages = allResults.filter(r => r.status === 'failed').length
    
    const successfulResults = allResults.filter(r => r.status === 'success' && r.compressedSize)
    stats.totalOriginalSize = successfulResults.reduce((sum, r) => sum + r.originalSize, 0)
    stats.totalCompressedSize = successfulResults.reduce((sum, r) => sum + (r.compressedSize || 0), 0)
    stats.totalSavings = stats.totalOriginalSize - stats.totalCompressedSize
    stats.averageCompressionRatio = successfulResults.length > 0 
      ? successfulResults.reduce((sum, r) => sum + (r.compressionRatio || 0), 0) / successfulResults.length
      : 0
    
    console.log('\n=== Processing Complete ===')
    console.log(`Total images: ${stats.totalImages}`)
    console.log(`Successfully processed: ${stats.processedImages}`)
    console.log(`Skipped: ${stats.skippedImages}`)
    console.log(`Failed: ${stats.failedImages}`)
    console.log(`Total original size: ${formatFileSize(stats.totalOriginalSize)}`)
    console.log(`Total compressed size: ${formatFileSize(stats.totalCompressedSize)}`)
    console.log(`Total savings: ${formatFileSize(stats.totalSavings)} (${((stats.totalSavings / stats.totalOriginalSize) * 100).toFixed(1)}%)`)
    console.log(`Average compression ratio: ${stats.averageCompressionRatio.toFixed(1)}%`)
    
  } catch (error) {
    console.error('Error during image processing:', error)
    throw error
  }
  
  return stats
}

/**
 * Get processing preview without actually processing images
 * @returns Promise<{entityType: string, count: number, totalSize: number}[]> - Preview data
 */
export async function getProcessingPreview(): Promise<{entityType: string, count: number, totalSize: number}[]> {
  const preview: {entityType: string, count: number, totalSize: number}[] = []
  
  try {
    // Helper function for paginated scan with projection
    async function paginatedScanWithProjection(
      tableName: string,
      projectionExpression: string,
      expressionAttributeNames: Record<string, string>
    ): Promise<any[]> {
      const allItems: any[] = []
      let lastEvaluatedKey: Record<string, any> | undefined = undefined
      
      do {
        const scanParams: any = {
          TableName: tableName,
          ProjectionExpression: projectionExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          Limit: 100, // Process in smaller chunks
        }
        
        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey
        }
        
        const result = await dynamoDB.send(new ScanCommand(scanParams))
        
        if (result.Items) {
          allItems.push(...result.Items)
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey
      } while (lastEvaluatedKey)
      
      return allItems
    }
    
    // Scan organizers with pagination
    const organizersItems = await paginatedScanWithProjection(
      TABLES.ORGANIZERS,
      'id, #name, logo',
      { '#name': 'name' }
    )
    const organizersWithImages = organizersItems.filter(item => item.logo) || []
    preview.push({
      entityType: 'Organizers',
      count: organizersWithImages.length,
      totalSize: 0 // Would need to fetch actual sizes
    })
    
    // Scan tournaments with pagination
    const tournamentsItems = await paginatedScanWithProjection(
      TABLES.TOURNAMENTS,
      'id, #name, logo',
      { '#name': 'name' }
    )
    const tournamentsWithImages = tournamentsItems.filter(item => item.logo) || []
    preview.push({
      entityType: 'Tournaments',
      count: tournamentsWithImages.length,
      totalSize: 0
    })
    
    // Scan teams with pagination
    const teamsItems = await paginatedScanWithProjection(
      TABLES.TEAMS,
      'id, #name, logo',
      { '#name': 'name' }
    )
    const teamsWithImages = teamsItems.filter(item => item.logo) || []
    preview.push({
      entityType: 'Teams',
      count: teamsWithImages.length,
      totalSize: 0
    })
    
  } catch (error) {
    console.error('Error getting processing preview:', error)
  }
  
  return preview
}
