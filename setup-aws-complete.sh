#!/bin/bash

# Complete AWS Setup Script for Football Tournaments App
# This script sets up everything from scratch: IAM, Security Groups, DynamoDB, S3, EC2, Route 53

set -e

# Configuration
AWS_REGION="us-east-1"
DOMAIN_NAME="myfootballtournament.com"
DEV_DOMAIN="dev.$DOMAIN_NAME"
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

# Function to check if AWS CLI is configured
check_aws_cli() {
    print_info "Checking AWS CLI configuration..."
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first:"
        echo "  macOS: brew install awscli"
        echo "  Linux: sudo apt-get install awscli"
        echo "  Windows: Download from https://aws.amazon.com/cli/"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured. Please run: aws configure"
        exit 1
    fi
    
    print_status "AWS CLI is configured and working"
}

# Function to create IAM user and policies
create_iam_setup() {
    print_info "Setting up IAM user and policies..."
    
    # Create IAM user
    aws iam create-user --user-name football-tournaments-deployer 2>/dev/null || print_warning "IAM user already exists"
    
    # Attach policies
    aws iam attach-user-policy --user-name football-tournaments-deployer --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess
    aws iam attach-user-policy --user-name football-tournaments-deployer --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
    aws iam attach-user-policy --user-name football-tournaments-deployer --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
    aws iam attach-user-policy --user-name football-tournaments-deployer --policy-arn arn:aws:iam::aws:policy/AmazonRoute53FullAccess
    aws iam attach-user-policy --user-name football-tournaments-deployer --policy-arn arn:aws:iam::aws:policy/AmazonECRFullAccess
    
    print_status "IAM user and policies created"
    print_warning "IMPORTANT: Create access keys for the user 'football-tournaments-deployer' in AWS Console"
    print_warning "Then run: aws configure (with the new credentials)"
}

# Function to create security groups
create_security_groups() {
    print_info "Creating security groups..."
    
    # Get current IP
    CURRENT_IP=$(curl -s ifconfig.me)
    print_info "Your current IP: $CURRENT_IP"
    
    # Create security group
    aws ec2 create-security-group \
        --group-name football-tournaments-web \
        --description "Security group for football tournaments web traffic" \
        2>/dev/null || print_warning "Security group already exists"
    
    # Allow HTTP
    aws ec2 authorize-security-group-ingress \
        --group-name football-tournaments-web \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        2>/dev/null || print_warning "HTTP rule already exists"
    
    # Allow HTTPS
    aws ec2 authorize-security-group-ingress \
        --group-name football-tournaments-web \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        2>/dev/null || print_warning "HTTPS rule already exists"
    
    # Allow SSH from current IP
    aws ec2 authorize-security-group-ingress \
        --group-name football-tournaments-web \
        --protocol tcp \
        --port 22 \
        --cidr $CURRENT_IP/32 \
        2>/dev/null || print_warning "SSH rule already exists"
    
    print_status "Security groups created"
}

# Function to create key pair
create_key_pair() {
    print_info "Creating EC2 key pair..."
    
    # Check if key pair exists in AWS
    if aws ec2 describe-key-pairs --key-names football-tournaments-key &> /dev/null; then
        print_warning "Key pair 'football-tournaments-key' already exists in AWS"
        
        # Check if we have the local .pem file
        if [ ! -f "football-tournaments-key.pem" ]; then
            print_error "Key pair exists in AWS but local .pem file is missing!"
            print_info "You need to either:"
            print_info "1. Find your existing .pem file, or"
            print_info "2. Delete the key pair from AWS and recreate it"
            print_info ""
            print_info "To delete existing key pair:"
            print_info "aws ec2 delete-key-pair --key-name football-tournaments-key"
            print_info ""
            print_info "To list existing key pairs:"
            print_info "aws ec2 describe-key-pairs"
            return 1
        else
            print_status "Using existing key pair: football-tournaments-key.pem"
        fi
    else
        # Create new key pair
        print_info "Creating new key pair: football-tournaments-key"
        aws ec2 create-key-pair \
            --key-name football-tournaments-key \
            --query 'KeyMaterial' \
            --output text > football-tournaments-key.pem
        
        chmod 400 football-tournaments-key.pem
        print_status "Key pair created: football-tournaments-key.pem"
    fi
}

# Function to create DynamoDB tables
create_dynamodb_tables() {
    print_info "Creating DynamoDB tables..."
    
    # Production tables
    create_table "football-tournaments" "id" "organizerId"
    create_table "football-teams" "id" "organizerId"
    create_table "football-players" "id" "teamId"
    create_table "football-matches" "id" "tournamentId"
    create_table "football-organizers" "id" ""
    
    # Development tables
    create_table "football-tournaments-dev" "id" "organizerId"
    create_table "football-teams-dev" "id" "organizerId"
    create_table "football-players-dev" "id" "teamId"
    create_table "football-matches-dev" "id" "tournamentId"
    create_table "football-organizers-dev" "id" ""
    
    print_status "DynamoDB tables created"
}

# Helper function to create a single table
create_table() {
    local table_name=$1
    local hash_key=$2
    local gsi_key=$3
    
    print_info "Creating table: $table_name"
    
    if [ -n "$gsi_key" ]; then
        aws dynamodb create-table \
            --table-name "$table_name" \
            --attribute-definitions \
                AttributeName=$hash_key,AttributeType=S \
                AttributeName=$gsi_key,AttributeType=S \
            --key-schema \
                AttributeName=$hash_key,KeyType=HASH \
            --global-secondary-indexes \
                IndexName=${gsi_key}-index,KeySchema=[{AttributeName=$gsi_key,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
            --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
            --region $AWS_REGION \
            2>/dev/null || print_warning "Table $table_name might already exist"
    else
        aws dynamodb create-table \
            --table-name "$table_name" \
            --attribute-definitions \
                AttributeName=$hash_key,AttributeType=S \
            --key-schema \
                AttributeName=$hash_key,KeyType=HASH \
            --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
            --region $AWS_REGION \
            2>/dev/null || print_warning "Table $table_name might already exist"
    fi
}

# Function to create S3 buckets
create_s3_buckets() {
    print_info "Creating S3 buckets..."
    
    # Production bucket
    PROD_BUCKET="football-tournaments-prod-images-$(date +%s)"
    aws s3 mb "s3://$PROD_BUCKET" --region $AWS_REGION
    
    # Disable block public access for production bucket
    aws s3api delete-public-access-block --bucket "$PROD_BUCKET"
    
    # Set public read policy for production bucket
    aws s3api put-bucket-policy --bucket "$PROD_BUCKET" --policy '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "PublicReadGetObject",
          "Effect": "Allow",
          "Principal": "*",
          "Action": "s3:GetObject",
          "Resource": "arn:aws:s3:::'"$PROD_BUCKET"'/*"
        }
      ]
    }'
    
    # Development bucket
    DEV_BUCKET="football-tournaments-dev-images-$(date +%s)"
    aws s3 mb "s3://$DEV_BUCKET" --region $AWS_REGION
    
    # Disable block public access for development bucket
    aws s3api delete-public-access-block --bucket "$DEV_BUCKET"
    
    # Set public read policy for development bucket
    aws s3api put-bucket-policy --bucket "$DEV_BUCKET" --policy '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "PublicReadGetObject",
          "Effect": "Allow",
          "Principal": "*",
          "Action": "s3:GetObject",
          "Resource": "arn:aws:s3:::'"$DEV_BUCKET"'/*"
        }
      ]
    }'
    
    print_status "S3 buckets created:"
    print_info "Production: $PROD_BUCKET"
    print_info "Development: $DEV_BUCKET"
}

# Function to create Route 53 hosted zone
create_route53() {
    print_info "Creating Route 53 hosted zone..."
    
    # Check if hosted zone already exists
    HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN_NAME." --query "HostedZones[0].Id" --output text 2>/dev/null | awk -F'/' '{print $3}')
    
    if [ "$HOSTED_ZONE_ID" == "None" ] || [ -z "$HOSTED_ZONE_ID" ]; then
        CREATE_HZ_OUTPUT=$(aws route53 create-hosted-zone --name "$DOMAIN_NAME" --caller-reference "$(date +%s)" --query "HostedZone.Id" --output text)
        HOSTED_ZONE_ID=$(echo "$CREATE_HZ_OUTPUT" | awk -F'/' '{print $3}')
        print_status "Hosted zone created: $HOSTED_ZONE_ID"
        
        print_warning "IMPORTANT: Update your domain registrar with these name servers:"
        aws route53 get-hosted-zone --id "$HOSTED_ZONE_ID" --query "DelegationSet.NameServers" --output text
    else
        print_warning "Hosted zone already exists: $HOSTED_ZONE_ID"
    fi
}

# Function to launch EC2 instances
launch_ec2_instances() {
    print_info "Launching EC2 instances..."
    
    # Get latest Amazon Linux 2 AMI
    AMI_ID=$(aws ec2 describe-images \
        --owners amazon \
        --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text)
    
    print_info "Using AMI: $AMI_ID"
    
    # Launch production instance
    PROD_INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --count 1 \
        --instance-type t3.micro \
        --key-name football-tournaments-key \
        --security-groups football-tournaments-web \
        --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments-prod}]' \
        --user-data '#!/bin/bash
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user' \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    # Launch development instance
    DEV_INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --count 1 \
        --instance-type t3.micro \
        --key-name football-tournaments-key \
        --security-groups football-tournaments-web \
        --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments-dev}]' \
        --user-data '#!/bin/bash
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user' \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    print_status "EC2 instances launched:"
    print_info "Production: $PROD_INSTANCE_ID"
    print_info "Development: $DEV_INSTANCE_ID"
    
    # Wait for instances to be running
    print_info "Waiting for instances to be running..."
    aws ec2 wait instance-running --instance-ids $PROD_INSTANCE_ID
    aws ec2 wait instance-running --instance-ids $DEV_INSTANCE_ID
    
    # Get public IPs
    PROD_IP=$(aws ec2 describe-instances --instance-ids $PROD_INSTANCE_ID --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
    DEV_IP=$(aws ec2 describe-instances --instance-ids $DEV_INSTANCE_ID --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
    
    print_status "Instance IPs:"
    print_info "Production: $PROD_IP"
    print_info "Development: $DEV_IP"
}

# Function to create environment files
create_env_files() {
    print_info "Creating environment configuration files..."
    
    # Production .env
    cat > .env.prod << EOF
REACT_APP_AWS_REGION=$AWS_REGION
REACT_APP_TOURNAMENTS_TABLE=football-tournaments
REACT_APP_TEAMS_TABLE=football-teams
REACT_APP_PLAYERS_TABLE=football-players
REACT_APP_MATCHES_TABLE=football-matches
REACT_APP_ORGANIZERS_TABLE=football-organizers
REACT_APP_S3_BUCKET=$PROD_BUCKET
EOF
    
    # Development .env
    cat > .env.dev << EOF
REACT_APP_AWS_REGION=$AWS_REGION
REACT_APP_TOURNAMENTS_TABLE=football-tournaments-dev
REACT_APP_TEAMS_TABLE=football-teams-dev
REACT_APP_PLAYERS_TABLE=football-players-dev
REACT_APP_MATCHES_TABLE=football-matches-dev
REACT_APP_ORGANIZERS_TABLE=football-organizers-dev
REACT_APP_S3_BUCKET=$DEV_BUCKET
EOF
    
    print_status "Environment files created: .env.prod and .env.dev"
}

# Main function
main() {
    echo "🚀 Complete AWS Setup for Football Tournaments App"
    echo "=================================================="
    echo "Domain: $DOMAIN_NAME"
    echo "Dev Domain: $DEV_DOMAIN"
    echo "Region: $AWS_REGION"
    echo ""
    
    # Check prerequisites
    check_aws_cli
    
    # Ask what to do
    echo "What would you like to do?"
    echo "1) Complete setup (everything)"
    echo "2) IAM setup only"
    echo "3) Infrastructure only (DynamoDB, S3, Route 53)"
    echo "4) EC2 instances only"
    read -p "Enter your choice (1-4): " choice
    
    case $choice in
        1)
            create_iam_setup
            create_security_groups
            create_key_pair
            create_dynamodb_tables
            create_s3_buckets
            create_route53
            launch_ec2_instances
            create_env_files
            ;;
        2)
            create_iam_setup
            ;;
        3)
            create_dynamodb_tables
            create_s3_buckets
            create_route53
            ;;
        4)
            create_security_groups
            create_key_pair
            launch_ec2_instances
            ;;
        *)
            print_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
    
    echo ""
    echo "🎉 AWS setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Update your domain registrar with Route 53 name servers"
    echo "2. Deploy your application to EC2 instances"
    echo "3. Get SSL certificates"
    echo "4. Test your applications"
    echo ""
    echo "🌐 Your applications will be available at:"
    echo "- Production: https://$DOMAIN_NAME"
    echo "- Development: https://$DEV_DOMAIN"
}

# Run main function
main "$@"
