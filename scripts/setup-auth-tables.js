const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, CreateTableCommand } = require('@aws-sdk/lib-dynamodb')

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

const dynamoDB = DynamoDBDocumentClient.from(dynamoDBClient)

async function createAuthTables() {
  try {
    console.log('Creating authentication tables...')

    // Create AUTH_USERS table
    await dynamoDB.send(new CreateTableCommand({
      TableName: 'football-tournaments-auth-users',
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'username', AttributeType: 'S' },
        { AttributeName: 'role', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'username-index',
          KeySchema: [
            { AttributeName: 'username', KeyType: 'HASH' }
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        },
        {
          IndexName: 'role-index',
          KeySchema: [
            { AttributeName: 'role', KeyType: 'HASH' }
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }))
    console.log('✅ AUTH_USERS table created successfully')

    // Create AUTH_SESSIONS table
    await dynamoDB.send(new CreateTableCommand({
      TableName: 'football-tournaments-auth-sessions',
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'token', AttributeType: 'S' },
        { AttributeName: 'userId', AttributeType: 'S' },
        { AttributeName: 'expiresAt', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'token-index',
          KeySchema: [
            { AttributeName: 'token', KeyType: 'HASH' }
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        },
        {
          IndexName: 'user-sessions-index',
          KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
            { AttributeName: 'expiresAt', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }))
    console.log('✅ AUTH_SESSIONS table created successfully')

    console.log('🎉 All authentication tables created successfully!')
    console.log('\nNext steps:')
    console.log('1. Run the application')
    console.log('2. The super admin account will be automatically created')
    console.log('3. Login with: Slazhen / qweRTY1')

  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('⚠️  Tables already exist, skipping creation')
    } else {
      console.error('❌ Error creating tables:', error)
      process.exit(1)
    }
  }
}

createAuthTables()
