#!/bin/bash

# AWS Compute Optimizer Disable Script
# This script helps disable AWS Compute Optimizer recommendations

echo "🔧 AWS Compute Optimizer Disable Script"
echo "========================================"
echo ""

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
echo ""

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📍 Account ID: $ACCOUNT_ID"
echo ""

echo "📋 Current Compute Optimizer Status:"
echo "-----------------------------------"

# Check EC2 recommendations status
echo "Checking EC2 instance recommendations..."
aws compute-optimizer get-recommendation-preferences \
  --resource-type Ec2Instance \
  --scope Name=AccountId,Value=$ACCOUNT_ID \
  2>/dev/null || echo "  ⚠️  EC2 recommendations not configured or disabled"

echo ""
echo "🔴 To disable Compute Optimizer:"
echo "--------------------------------"
echo ""
echo "1. Go to AWS Console: https://console.aws.amazon.com/compute-optimizer/"
echo "2. Click on 'Preferences' or 'Settings' in the left sidebar"
echo "3. Disable recommendations for:"
echo "   - EC2 instances"
echo "   - Lambda functions"
echo "   - EBS volumes"
echo "   - Auto Scaling groups"
echo ""
echo "OR use the AWS CLI commands shown in AWS-COMPUTE-OPTIMIZER-DISABLE.md"
echo ""
echo "📝 Note: Compute Optimizer is FREE - disabling won't save money."
echo "   If you're seeing charges, they're from other AWS services."
echo ""
