#!/bin/bash

# Fix S3 ACL Issue Script
echo "🔧 Fixing S3 ACL configuration..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run: aws configure"
    exit 1
fi

# Set variables
REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME="football-tournaments-images"

echo "📍 Using region: $REGION"
echo "🪣 Fixing bucket: $BUCKET_NAME"

# Check if bucket exists
if ! aws s3api head-bucket --bucket $BUCKET_NAME --region $REGION 2>/dev/null; then
    echo "❌ Bucket $BUCKET_NAME does not exist or you don't have access to it."
    exit 1
fi

echo "✅ Bucket exists, proceeding with fixes..."

# Disable ACLs on the bucket
echo "🔧 Disabling ACLs on S3 bucket..."
aws s3api put-bucket-ownership-controls --bucket $BUCKET_NAME --ownership-controls '{
  "Rules": [
    {
      "ObjectOwnership": "BucketOwnerPreferred"
    }
  ]
}' --region $REGION

# Block public ACLs but allow public read via bucket policy
echo "🔧 Configuring public access block..."
aws s3api put-public-access-block --bucket $BUCKET_NAME --public-access-block-configuration '{
  "BlockPublicAcls": true,
  "IgnorePublicAcls": true,
  "BlockPublicPolicy": false,
  "RestrictPublicBuckets": false
}' --region $REGION

# Ensure bucket policy allows public read
echo "🔧 Setting bucket policy for public read access..."
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

echo "✅ S3 bucket configuration fixed!"
echo ""
echo "🎉 Your S3 bucket is now configured to work without ACLs."
echo "   Images will be publicly readable via bucket policy instead."
echo ""
echo "📋 Next steps:"
echo "1. Deploy the updated code to your app"
echo "2. Test photo uploads - they should work now!"
