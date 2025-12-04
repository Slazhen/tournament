import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'

// AWS Configuration
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1'

// Read-Only Credentials (for public pages)
const AWS_READONLY_ACCESS_KEY_ID = import.meta.env.VITE_AWS_READONLY_ACCESS_KEY_ID
const AWS_READONLY_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_READONLY_SECRET_ACCESS_KEY

// Read-Write Credentials (for admin/authenticated pages)
const AWS_WRITE_ACCESS_KEY_ID = import.meta.env.VITE_AWS_WRITE_ACCESS_KEY_ID
const AWS_WRITE_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_WRITE_SECRET_ACCESS_KEY

// Legacy single credential support (for backward compatibility)
const AWS_ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY

// Helper function to create credentials object
const createCredentials = (accessKeyId?: string, secretAccessKey?: string) => {
  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
    }
  }
  return undefined // Use IAM roles if credentials not provided
}

// Determine which credentials to use
// Priority: Write credentials > Read-only credentials > Legacy single credentials
const getWriteCredentials = () => {
  if (AWS_WRITE_ACCESS_KEY_ID && AWS_WRITE_SECRET_ACCESS_KEY) {
    return createCredentials(AWS_WRITE_ACCESS_KEY_ID, AWS_WRITE_SECRET_ACCESS_KEY)
  }
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    return createCredentials(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  }
  return undefined
}

const getReadOnlyCredentials = () => {
  if (AWS_READONLY_ACCESS_KEY_ID && AWS_READONLY_SECRET_ACCESS_KEY) {
    return createCredentials(AWS_READONLY_ACCESS_KEY_ID, AWS_READONLY_SECRET_ACCESS_KEY)
  }
  // Fallback to write credentials if read-only not provided
  return getWriteCredentials()
}

// Read-Only DynamoDB Client (for public pages)
const readOnlyDynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: getReadOnlyCredentials(),
})

export const readOnlyDynamoDB = DynamoDBDocumentClient.from(readOnlyDynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

// Read-Write DynamoDB Client (for admin/authenticated pages)
const writeDynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: getWriteCredentials(),
})

export const writeDynamoDB = DynamoDBDocumentClient.from(writeDynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

// Default DynamoDB client (uses read-only for security, or write if read-only not available)
// This maintains backward compatibility
export const dynamoDB = readOnlyDynamoDB

// Read-Only S3 Client (for public pages)
export const readOnlyS3Client = new S3Client({
  region: AWS_REGION,
  credentials: getReadOnlyCredentials(),
})

// Read-Write S3 Client (for admin/authenticated pages)
export const writeS3Client = new S3Client({
  region: AWS_REGION,
  credentials: getWriteCredentials(),
})

// Default S3 client (uses read-only for security, or write if read-only not available)
// This maintains backward compatibility
export const s3Client = readOnlyS3Client

// S3 Bucket Configuration
export const S3_BUCKET_NAME = import.meta.env.VITE_S3_BUCKET_NAME || 'football-tournaments-images'
export const S3_BUCKET_URL = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`

// DynamoDB Table Names
export const TABLES = {
  ORGANIZERS: 'football-tournaments-organizers',
  TEAMS: 'football-tournaments-teams',
  TOURNAMENTS: 'football-tournaments-tournaments',
  MATCHES: 'football-tournaments-matches',
  AUTH_USERS: 'football-tournaments-auth-users',
  AUTH_SESSIONS: 'football-tournaments-auth-sessions',
} as const

// Helper function to generate S3 URLs
export const getS3Url = (key: string): string => {
  return `${S3_BUCKET_URL}/${key}`
}

// Helper function to extract S3 key from URL
export const getS3Key = (url: string): string => {
  return url.replace(`${S3_BUCKET_URL}/`, '')
}
