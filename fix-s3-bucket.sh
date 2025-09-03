#!/bin/bash

# Fix S3 Bucket Public Access Script
# This script fixes the "Block Public Access" issue for existing S3 buckets

set -e

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

# Function to fix a single bucket
fix_bucket() {
    local bucket_name=$1
    
    print_info "Fixing bucket: $bucket_name"
    
    # Check if bucket exists
    if ! aws s3 ls "s3://$bucket_name" &> /dev/null; then
        print_error "Bucket $bucket_name does not exist"
        return 1
    fi
    
    # Disable block public access
    print_info "Disabling block public access for $bucket_name..."
    aws s3api delete-public-access-block --bucket "$bucket_name"
    
    # Set public read policy
    print_info "Setting public read policy for $bucket_name..."
    aws s3api put-bucket-policy --bucket "$bucket_name" --policy "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [
        {
          \"Sid\": \"PublicReadGetObject\",
          \"Effect\": \"Allow\",
          \"Principal\": \"*\",
          \"Action\": \"s3:GetObject\",
          \"Resource\": \"arn:aws:s3:::$bucket_name/*\"
        }
      ]
    }"
    
    print_status "Bucket $bucket_name fixed successfully!"
}

# Main function
main() {
    echo "🔧 S3 Bucket Public Access Fix"
    echo "=============================="
    echo ""
    
    # Check if AWS CLI is configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured. Please run: aws configure"
        exit 1
    fi
    
    # Ask for bucket name
    echo "Enter the S3 bucket name that needs to be fixed:"
    echo "Example: football-tournaments-prod-images-1756898731"
    read -p "Bucket name: " bucket_name
    
    if [ -z "$bucket_name" ]; then
        print_error "Bucket name cannot be empty"
        exit 1
    fi
    
    # Fix the bucket
    fix_bucket "$bucket_name"
    
    echo ""
    echo "🎉 S3 bucket fixed!"
    echo ""
    echo "📋 What was done:"
    echo "1. Disabled 'Block Public Access' settings"
    echo "2. Set public read policy for images"
    echo ""
    echo "🌐 Your bucket is now publicly readable for images"
    echo "URL format: https://$bucket_name.s3.amazonaws.com/your-image.jpg"
}

# Run main function
main "$@"
