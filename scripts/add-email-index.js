import { DynamoDBClient, UpdateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'

// AWS Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY

const dynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined,
})

async function addEmailIndex() {
  try {
    console.log('Checking table billing mode...')
    
    // First, check the table's billing mode
    const describeResult = await dynamoDBClient.send(new DescribeTableCommand({
      TableName: 'football-tournaments-auth-users'
    }))
    
    const billingMode = describeResult.Table?.BillingModeSummary?.BillingMode || 
                       (describeResult.Table?.ProvisionedThroughput ? 'PROVISIONED' : 'PAY_PER_REQUEST')
    
    console.log(`Table billing mode: ${billingMode}`)
    console.log('Adding email-index GSI to auth-users table...')
    
    // Check if email-index already exists
    const existingIndexes = describeResult.Table?.GlobalSecondaryIndexes?.map(idx => idx.IndexName) || []
    if (existingIndexes.includes('email-index')) {
      console.log('⚠️  Email index already exists')
      return
    }
    
    // Prepare the index creation command
    const indexCreate = {
      IndexName: 'email-index',
      KeySchema: [
        { AttributeName: 'email', KeyType: 'HASH' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
    
    // Add ProvisionedThroughput only if table uses PROVISIONED billing
    if (billingMode === 'PROVISIONED') {
      indexCreate.ProvisionedThroughput = {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }
    
    await dynamoDBClient.send(new UpdateTableCommand({
      TableName: 'football-tournaments-auth-users',
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'email', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: indexCreate
        }
      ]
    }))
    
    console.log('✅ Email index creation initiated. This may take a few minutes...')
    console.log('⚠️  Note: The index will be ready once the table status is ACTIVE')
    
  } catch (error) {
    if (error.name === 'ValidationException') {
      if (error.message.includes('already exists')) {
        console.log('⚠️  Email index already exists')
      } else {
        console.error('❌ Validation error:', error.message)
        throw error
      }
    } else if (error.name === 'ResourceNotFoundException') {
      console.error('❌ Table not found. Please create the auth tables first.')
      console.error('   Run: node scripts/setup-auth-tables.js')
    } else {
      console.error('❌ Error adding email index:', error)
      throw error
    }
  }
}

addEmailIndex()

