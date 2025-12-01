#!/bin/bash

# 🔍 AWS Resource Checker Script
# This script helps you identify what AWS resources are running and costing money

echo "🔍 Checking AWS Resources..."
echo "================================"
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

# Get AWS account info
echo "📋 AWS Account Information:"
echo "----------------------------"
aws sts get-caller-identity --query '[Account,UserId,Arn]' --output table
echo ""

# Check EC2 Instances
echo "🖥️  EC2 Instances (These cost money!):"
echo "--------------------------------------"
EC2_INSTANCES=$(aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,InstanceType,PublicIpAddress,Tags[?Key==`Name`].Value|[0]]' --output table)
if [ -z "$EC2_INSTANCES" ] || [ "$EC2_INSTANCES" = "None" ]; then
    echo "✅ No EC2 instances found (Good if you're using Amplify!)"
else
    echo "$EC2_INSTANCES"
    echo ""
    echo "⚠️  WARNING: You have EC2 instances running!"
    echo "   These cost approximately $30-35/month each when running 24/7"
    echo "   If you're using Amplify, you can terminate these to save money."
fi
echo ""

# Check Elastic IPs
echo "🌐 Elastic IPs:"
echo "---------------"
EIPS=$(aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,AssociationId,InstanceId]' --output table)
if [ -z "$EIPS" ] || [ "$EIPS" = "None" ]; then
    echo "✅ No Elastic IPs found"
else
    echo "$EIPS"
    echo ""
    echo "⚠️  Note: Elastic IPs cost money if not attached to a running instance"
fi
echo ""

# Check Amplify Apps
echo "🚀 AWS Amplify Apps:"
echo "--------------------"
AMPLIFY_APPS=$(aws amplify list-apps --query 'apps[*].[name,defaultDomain,platform]' --output table 2>/dev/null)
if [ $? -eq 0 ] && [ ! -z "$AMPLIFY_APPS" ]; then
    echo "$AMPLIFY_APPS"
    echo ""
    echo "✅ You have Amplify apps deployed"
else
    echo "⚠️  No Amplify apps found (or Amplify API not available)"
    echo "   Check manually at: https://console.aws.amazon.com/amplify/"
fi
echo ""

# Check S3 Buckets
echo "🪣 S3 Buckets:"
echo "--------------"
S3_BUCKETS=$(aws s3 ls 2>/dev/null)
if [ -z "$S3_BUCKETS" ]; then
    echo "✅ No S3 buckets found"
else
    echo "$S3_BUCKETS"
    echo ""
    echo "ℹ️  S3 buckets are cheap (~$0.023/GB/month)"
    echo "   Keep these if you're storing images/data"
fi
echo ""

# Check DynamoDB Tables
echo "💾 DynamoDB Tables:"
echo "-------------------"
DYNAMO_TABLES=$(aws dynamodb list-tables --query 'TableNames' --output table 2>/dev/null)
if [ $? -eq 0 ] && [ ! -z "$DYNAMO_TABLES" ]; then
    echo "$DYNAMO_TABLES"
    echo ""
    echo "ℹ️  DynamoDB is pay-per-use (very cheap for small apps)"
    echo "   Keep these - they're your database"
else
    echo "✅ No DynamoDB tables found"
fi
echo ""

# Check Load Balancers
echo "⚖️  Load Balancers:"
echo "-------------------"
LB=$(aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,State.Code,Type]' --output table 2>/dev/null)
if [ $? -eq 0 ] && [ ! -z "$LB" ] && [ "$LB" != "None" ]; then
    echo "$LB"
    echo ""
    echo "⚠️  Load balancers cost ~$16-20/month"
    echo "   Delete if not using EC2"
else
    echo "✅ No load balancers found"
fi
echo ""

# Summary
echo "================================"
echo "📊 Summary:"
echo "================================"
echo ""
echo "To check your costs:"
echo "1. Go to: https://console.aws.amazon.com/billing/"
echo "2. Click 'Cost Explorer'"
echo "3. Filter by service to see what's costing money"
echo ""
echo "💡 Tips to save money:"
echo "- If using Amplify, terminate EC2 instances"
echo "- Release unused Elastic IPs"
echo "- Delete unused load balancers"
echo "- Keep S3 and DynamoDB (they're cheap)"
echo ""
echo "For detailed cleanup instructions, see: EC2-CLEANUP-GUIDE.md"
echo ""

