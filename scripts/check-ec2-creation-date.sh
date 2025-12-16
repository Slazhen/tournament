#!/bin/bash

# 🔍 Check EC2 Instance Creation Dates
# This script checks when EC2 instances were created

echo "🔍 Checking EC2 Instance Creation Dates..."
echo "=========================================="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   https://aws.amazon.com/cli/"
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

# Check EC2 instances with creation dates
echo "🖥️  EC2 Instances and Creation Dates:"
echo "-------------------------------------"
aws ec2 describe-instances \
  --query 'Reservations[*].Instances[*].[InstanceId,LaunchTime,State.Name,InstanceType,Tags[?Key==`Name`].Value|[0]]' \
  --output table 2>/dev/null

echo ""
echo "📅 To check specific instances:"
echo "--------------------------------"
echo ""
echo "Production (i-03a2402ec98975a44):"
aws ec2 describe-instances \
  --instance-ids i-03a2402ec98975a44 \
  --query 'Reservations[*].Instances[*].[InstanceId,LaunchTime,State.Name]' \
  --output table 2>/dev/null || echo "  Instance not found or terminated"

echo ""
echo "Development (i-0ed8af072c464ddf7):"
aws ec2 describe-instances \
  --instance-ids i-0ed8af072c464ddf7 \
  --query 'Reservations[*].Instances[*].[InstanceId,LaunchTime,State.Name]' \
  --output table 2>/dev/null || echo "  Instance not found or terminated"

echo ""
echo "📊 To check CloudTrail for creation events:"
echo "-------------------------------------------"
echo "Run this command to see when instances were created:"
echo ""
echo "aws cloudtrail lookup-events \\"
echo "  --lookup-attributes AttributeKey=ResourceName,AttributeValue=i-03a2402ec98975a44 \\"
echo "  --query 'Events[*].[EventTime,EventName]' \\"
echo "  --output table"
echo ""
