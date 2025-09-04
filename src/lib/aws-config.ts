import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'

// AWS Configuration
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1'
const AWS_ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY

// DynamoDB Configuration
const dynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined, // Use IAM roles if credentials not provided
})

export const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

// S3 Configuration
export const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined, // Use IAM roles if credentials not provided
})

// S3 Bucket Configuration
export const S3_BUCKET_NAME = import.meta.env.VITE_S3_BUCKET_NAME || 'football-tournaments-images'
export const S3_BUCKET_URL = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`

// DynamoDB Table Names
export const TABLES = {
  ORGANIZERS: 'football-tournaments-organizers',
  TEAMS: 'football-tournaments-teams',
  TOURNAMENTS: 'football-tournaments-tournaments',
  MATCHES: 'football-tournaments-matches',
} as const

// Helper function to generate S3 URLs
export const getS3Url = (key: string): string => {
  return `${S3_BUCKET_URL}/${key}`
}

// Helper function to extract S3 key from URL
export const getS3Key = (url: string): string => {
  return url.replace(`${S3_BUCKET_URL}/`, '')
}
