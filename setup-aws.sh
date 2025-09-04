#!/bin/bash

# AWS Setup Script for Football Tournaments
echo "🚀 Setting up AWS infrastructure for Football Tournaments..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run:"
    echo "   aws configure"
    exit 1
fi

echo "✅ AWS CLI is configured"

# Set variables
REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME="football-tournaments-images"

echo "📍 Using region: $REGION"

# Create DynamoDB Tables
echo "📊 Creating DynamoDB tables..."

# Organizers Table
echo "Creating organizers table..."
aws dynamodb create-table \
    --table-name football-tournaments-organizers \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION

# Teams Table
echo "Creating teams table..."
aws dynamodb create-table \
    --table-name football-tournaments-teams \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=organizerId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=organizerId-index,KeySchema='[{AttributeName=organizerId,KeyType=HASH}]',Projection='{ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION

# Tournaments Table
echo "Creating tournaments table..."
aws dynamodb create-table \
    --table-name football-tournaments-tournaments \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=organizerId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=organizerId-index,KeySchema='[{AttributeName=organizerId,KeyType=HASH}]',Projection='{ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION

# Matches Table
echo "Creating matches table..."
aws dynamodb create-table \
    --table-name football-tournaments-matches \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=tournamentId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=tournamentId-index,KeySchema='[{AttributeName=tournamentId,KeyType=HASH}]',Projection='{ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION

# Create S3 Bucket
echo "🪣 Creating S3 bucket..."
aws s3 mb s3://$BUCKET_NAME --region $REGION

# Configure S3 CORS
echo "Configuring S3 CORS..."
aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": []
    }
  ]
}' --region $REGION

# Set S3 bucket policy for public read access
echo "Setting S3 bucket policy..."
aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"PublicReadGetObject\",
      \"Effect\": \"Allow\",
      \"Principal\": \"*\",
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::$BUCKET_NAME/*\"
    }
  ]
}" --region $REGION

echo "✅ AWS infrastructure setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Create a .env file with your AWS credentials:"
echo "   VITE_AWS_REGION=$REGION"
echo "   VITE_AWS_ACCESS_KEY_ID=your-access-key-id"
echo "   VITE_AWS_SECRET_ACCESS_KEY=your-secret-access-key"
echo "   VITE_S3_BUCKET_NAME=$BUCKET_NAME"
echo ""
echo "2. Run the app: npm run dev"
echo "3. Test creating an organizer and uploading images"
echo ""
echo "🎉 Your Football Tournaments app is ready for AWS!"
