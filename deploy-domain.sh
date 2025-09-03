#!/bin/bash

# Domain Deployment Script for Football Tournaments App
# Supports both production (myfootballtournament.com) and development (dev.myfootballtournament.com)

set -e

# Configuration
DOMAIN="myfootballtournament.com"
DEV_DOMAIN="dev.myfootballtournament.com"
AWS_REGION="us-east-1"
APP_NAME="football-tournaments"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to deploy environment
deploy_environment() {
    local ENV=$1
    local DOMAIN_NAME=$2
    local S3_BUCKET_SUFFIX=$3
    
    echo ""
    echo "🚀 Deploying $ENV environment for $DOMAIN_NAME"
    echo "=================================================="
    
    # Create environment-specific S3 bucket
    local S3_BUCKET="football-tournaments-${S3_BUCKET_SUFFIX}-$(date +%s)"
    
    print_info "Creating S3 bucket: $S3_BUCKET"
    aws s3 mb s3://$S3_BUCKET --region $AWS_REGION || print_warning "S3 bucket might already exist"
    
    # Disable block public access
    aws s3api delete-public-access-block --bucket $S3_BUCKET || print_warning "Could not disable block public access"
    
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
    
    # Create environment-specific DynamoDB tables
    local TABLE_SUFFIX=$([ "$ENV" = "prod" ] && echo "" || echo "-dev")
    
    print_info "Creating DynamoDB tables for $ENV environment..."
    
    # Create Tournaments table
    aws dynamodb create-table \
        --table-name "football-tournaments${TABLE_SUFFIX}" \
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
        --table-name "football-teams${TABLE_SUFFIX}" \
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
        --table-name "football-players${TABLE_SUFFIX}" \
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
        --table-name "football-matches${TABLE_SUFFIX}" \
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
        --table-name "football-organizers${TABLE_SUFFIX}" \
        --attribute-definitions \
            AttributeName=id,AttributeType=S \
        --key-schema \
            AttributeName=id,KeyType=HASH \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region $AWS_REGION || print_warning "Organizers table might already exist"
    
    # Create environment-specific configuration
    print_info "Creating environment configuration for $ENV..."
    cat > ".env.${ENV}" << EOF
REACT_APP_AWS_REGION=$AWS_REGION
REACT_APP_TOURNAMENTS_TABLE=football-tournaments${TABLE_SUFFIX}
REACT_APP_TEAMS_TABLE=football-teams${TABLE_SUFFIX}
REACT_APP_PLAYERS_TABLE=football-players${TABLE_SUFFIX}
REACT_APP_MATCHES_TABLE=football-matches${TABLE_SUFFIX}
REACT_APP_ORGANIZERS_TABLE=football-organizers${TABLE_SUFFIX}
REACT_APP_S3_BUCKET=$S3_BUCKET
REACT_APP_ENVIRONMENT=$ENV
REACT_APP_DOMAIN=$DOMAIN_NAME
NODE_ENV=production
EOF
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        print_warning "Docker is not installed locally. Skipping Docker image build."
        print_info "Docker images will be built on EC2 instances during deployment."
        print_info "To install Docker locally:"
        print_info "  macOS: brew install docker"
        print_info "  Linux: sudo apt-get install docker.io"
        print_info "  Windows: Download from https://www.docker.com/products/docker-desktop"
    elif ! docker info &> /dev/null; then
        print_warning "Docker is installed but daemon is not running. Skipping Docker image build."
        print_info "Docker images will be built on EC2 instances during deployment."
        print_info "To start Docker:"
        print_info "  macOS: Start Docker Desktop from Applications"
        print_info "  Linux: sudo systemctl start docker"
        print_info "  Windows: Start Docker Desktop"
    else
        # Build Docker image with environment tag using buildx
        print_info "Building Docker image for $ENV environment..."
        if docker buildx version &> /dev/null; then
            # Use buildx for modern builds
            docker buildx build -t "${APP_NAME}-${ENV}" --load .
        else
            # Fallback to legacy build
            docker build -t "${APP_NAME}-${ENV}" .
        fi
        print_status "Docker image built: ${APP_NAME}-${ENV}"
    fi
    
    # Create environment-specific Docker Compose file
    print_info "Creating Docker Compose configuration for $ENV..."
    cat > "docker-compose.${ENV}.yml" << EOF
version: '3.8'

services:
  football-tournaments-${ENV}:
    image: ${APP_NAME}-${ENV}:latest
    container_name: ${APP_NAME}-${ENV}
    ports:
      - "${ENV == "prod" && "80" || "8080"}:3000"
    environment:
      - REACT_APP_AWS_REGION=$AWS_REGION
      - REACT_APP_TOURNAMENTS_TABLE=football-tournaments${TABLE_SUFFIX}
      - REACT_APP_TEAMS_TABLE=football-teams${TABLE_SUFFIX}
      - REACT_APP_PLAYERS_TABLE=football-players${TABLE_SUFFIX}
      - REACT_APP_MATCHES_TABLE=football-matches${TABLE_SUFFIX}
      - REACT_APP_ORGANIZERS_TABLE=football-organizers${TABLE_SUFFIX}
      - REACT_APP_S3_BUCKET=$S3_BUCKET
      - REACT_APP_ENVIRONMENT=$ENV
      - REACT_APP_DOMAIN=$DOMAIN_NAME
      - NODE_ENV=production
    restart: unless-stopped
    volumes:
      - /home/ec2-user/.aws:/root/.aws:ro
EOF
    
    print_status "$ENV environment setup complete!"
    print_info "S3 Bucket: $S3_BUCKET"
    print_info "DynamoDB Tables: football-*-${ENV}"
    print_info "Docker Image: ${APP_NAME}-${ENV}"
    print_info "Domain: $DOMAIN_NAME"
}

# Function to setup Route 53
setup_route53() {
    echo ""
    echo "🌐 Setting up Route 53 for $DOMAIN"
    echo "=================================="
    
    # Check if hosted zone exists
    if aws route53 list-hosted-zones --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text | grep -q "hostedzone"; then
        print_warning "Hosted zone for $DOMAIN already exists"
    else
        print_info "Creating hosted zone for $DOMAIN..."
        aws route53 create-hosted-zone \
            --name $DOMAIN \
            --caller-reference "football-tournaments-$(date +%s)" \
            --hosted-zone-config Comment="Football Tournaments App"
    fi
    
    # Get hosted zone ID
    HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text | cut -d'/' -f3)
    print_info "Hosted Zone ID: $HOSTED_ZONE_ID"
    
    # Get name servers
    NAME_SERVERS=$(aws route53 get-hosted-zone --id $HOSTED_ZONE_ID --query "DelegationSet.NameServers" --output text)
    print_info "Name servers for $DOMAIN:"
    echo "$NAME_SERVERS"
    
    print_warning "IMPORTANT: Update your domain registrar with these name servers!"
    print_warning "This is required for your domain to work with AWS Route 53."
}

# Function to create SSL certificate
create_ssl_certificate() {
    local DOMAIN_NAME=$1
    local CERT_DOMAIN=$2
    
    echo ""
    echo "🔒 Creating SSL certificate for $DOMAIN_NAME"
    echo "============================================="
    
    # Request SSL certificate
    print_info "Requesting SSL certificate for $CERT_DOMAIN..."
    CERT_ARN=$(aws acm request-certificate \
        --domain-name $CERT_DOMAIN \
        --validation-method DNS \
        --region $AWS_REGION \
        --query "CertificateArn" \
        --output text)
    
    print_info "Certificate ARN: $CERT_ARN"
    print_warning "Certificate validation required! Check AWS Certificate Manager console."
    print_warning "You'll need to add DNS validation records to your hosted zone."
    
    echo "$CERT_ARN" > "certificate-${CERT_DOMAIN}.arn"
}

# Main deployment function
main() {
    echo "🚀 Football Tournaments Domain Deployment"
    echo "=========================================="
    echo "Production Domain: $DOMAIN"
    echo "Development Domain: $DEV_DOMAIN"
    echo ""
    
    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_status "Prerequisites check passed"
    
    # Setup Route 53
    setup_route53
    
    # Deploy production environment
    deploy_environment "prod" $DOMAIN "prod"
    
    # Deploy development environment
    deploy_environment "dev" $DEV_DOMAIN "dev"
    
    # Create SSL certificates
    create_ssl_certificate "Production" $DOMAIN
    create_ssl_certificate "Development" $DEV_DOMAIN
    
    echo ""
    echo "🎉 Domain deployment setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Update your domain registrar with the Route 53 name servers"
    echo "2. Validate SSL certificates in AWS Certificate Manager"
    echo "3. Launch EC2 instances for prod and dev"
    echo "4. Deploy applications using the generated Docker Compose files"
    echo ""
    echo "🔧 Deployment commands:"
    echo "Production:  docker-compose -f docker-compose.prod.yml up -d"
    echo "Development: docker-compose -f docker-compose.dev.yml up -d"
    echo ""
    echo "📊 Created resources:"
    echo "- Route 53 hosted zone for $DOMAIN"
    echo "- SSL certificates for both domains"
    echo "- Separate DynamoDB tables for prod and dev"
    echo "- Separate S3 buckets for prod and dev"
    echo "- Environment-specific Docker images and configurations"
}

# Run main function
main "$@"
