#!/bin/bash

# AWS Deployment Script for Football Tournaments App
# Run this script after setting up your AWS credentials

set -e  # Exit on any error

echo "🚀 Starting AWS deployment for Football Tournaments App..."

# Configuration
AWS_REGION="us-east-1"
APP_NAME="football-tournaments"
S3_BUCKET="football-tournaments-images-$(date +%s)"  # Unique bucket name

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

print_status "AWS CLI and Docker are ready"

# Step 1: Create DynamoDB Tables
echo "📊 Creating DynamoDB tables..."

# Create Tournaments table
aws dynamodb create-table \
    --table-name football-tournaments \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=organizerId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=organizerId-index,KeySchema=[{AttributeName=organizerId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION || print_warning "Tournaments table might already exist"

# Create Teams table
aws dynamodb create-table \
    --table-name football-teams \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=organizerId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=organizerId-index,KeySchema=[{AttributeName=organizerId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION || print_warning "Teams table might already exist"

# Create Players table
aws dynamodb create-table \
    --table-name football-players \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=teamId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=teamId-index,KeySchema=[{AttributeName=teamId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION || print_warning "Players table might already exist"

# Create Matches table
aws dynamodb create-table \
    --table-name football-matches \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=tournamentId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=tournamentId-index,KeySchema=[{AttributeName=tournamentId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION || print_warning "Matches table might already exist"

# Create Organizers table
aws dynamodb create-table \
    --table-name football-organizers \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $AWS_REGION || print_warning "Organizers table might already exist"

print_status "DynamoDB tables created"

# Step 2: Create S3 Bucket
echo "🪣 Creating S3 bucket for images..."

aws s3 mb s3://$S3_BUCKET --region $AWS_REGION || print_warning "S3 bucket might already exist"

# Set bucket policy for public read access to images
aws s3api put-bucket-policy --bucket $S3_BUCKET --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Sid\": \"PublicReadGetObject\",
      \"Effect\": \"Allow\",
      \"Principal\": \"*\",
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::$S3_BUCKET/*\"
    }
  ]
}" || print_warning "Could not set bucket policy"

print_status "S3 bucket created: $S3_BUCKET"

# Step 3: Build Docker Image
echo "🐳 Building Docker image..."

docker build -t $APP_NAME .

print_status "Docker image built"

# Step 4: Create environment file
echo "📝 Creating environment configuration..."

cat > .env.production << EOF
REACT_APP_AWS_REGION=$AWS_REGION
REACT_APP_TOURNAMENTS_TABLE=football-tournaments
REACT_APP_TEAMS_TABLE=football-teams
REACT_APP_PLAYERS_TABLE=football-players
REACT_APP_MATCHES_TABLE=football-matches
REACT_APP_ORGANIZERS_TABLE=football-organizers
REACT_APP_S3_BUCKET=$S3_BUCKET
NODE_ENV=production
EOF

print_status "Environment configuration created"

# Step 5: Test Docker container locally
echo "🧪 Testing Docker container locally..."

# Stop any existing container
docker stop $APP_NAME 2>/dev/null || true
docker rm $APP_NAME 2>/dev/null || true

# Run container
docker run -d -p 3000:3000 --name $APP_NAME --env-file .env.production $APP_NAME

# Wait a moment for container to start
sleep 5

# Check if container is running
if docker ps | grep -q $APP_NAME; then
    print_status "Docker container is running locally on port 3000"
    print_warning "You can test it at: http://localhost:3000"
else
    print_error "Docker container failed to start"
    docker logs $APP_NAME
    exit 1
fi

echo ""
echo "🎉 AWS infrastructure setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Test your app locally: http://localhost:3000"
echo "2. Launch an EC2 instance"
echo "3. Copy your Docker image to EC2"
echo "4. Run the container on EC2"
echo ""
echo "📊 Created resources:"
echo "- DynamoDB tables: football-tournaments, football-teams, football-players, football-matches, football-organizers"
echo "- S3 bucket: $S3_BUCKET"
echo "- Docker image: $APP_NAME"
echo ""
echo "💡 To stop the local container: docker stop $APP_NAME"
echo "💡 To view logs: docker logs $APP_NAME"
