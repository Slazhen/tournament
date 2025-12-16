#!/bin/bash

# 🔍 Find EC2 Charges Script
# This script identifies ALL EC2-related resources that could be costing money
# Even if you see "0 EC2 instances", there are hidden resources that charge!

echo "🔍 Finding ALL EC2-Related Charges..."
echo "======================================"
echo ""
echo "⚠️  Even if you see 0 running instances, these resources can still cost money:"
echo "   - Stopped instances (EBS volumes still charge)"
echo "   - Detached EBS volumes"
echo "   - Unattached Elastic IPs"
echo "   - EBS snapshots"
echo "   - Load balancers"
echo "   - NAT Gateways"
echo "   - Data transfer"
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

# Get account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📍 Account ID: $ACCOUNT_ID"
echo ""

# ============================================
# 1. CHECK ALL EC2 INSTANCES (including stopped)
# ============================================
echo "🖥️  1. EC2 INSTANCES (All States):"
echo "-----------------------------------"
INSTANCES=$(aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,InstanceType,PublicIpAddress,Tags[?Key==`Name`].Value|[0]]' --output table 2>/dev/null)
if [ -z "$INSTANCES" ] || [ "$INSTANCES" = "None" ]; then
    echo "✅ No EC2 instances found (running or stopped)"
else
    echo "$INSTANCES"
    echo ""
    echo "⚠️  WARNING: Even STOPPED instances cost money for attached EBS volumes!"
    echo "   Terminate stopped instances if you don't need them."
fi
echo ""

# ============================================
# 2. CHECK EBS VOLUMES (This is often the culprit!)
# ============================================
echo "💾 2. EBS VOLUMES (These cost money even if detached!):"
echo "------------------------------------------------------"
VOLUMES=$(aws ec2 describe-volumes --query 'Volumes[*].[VolumeId,State,Size,VolumeType,Attachments[0].InstanceId,Tags[?Key==`Name`].Value|[0]]' --output table 2>/dev/null)
if [ -z "$VOLUMES" ] || [ "$VOLUMES" = "None" ]; then
    echo "✅ No EBS volumes found"
else
    echo "$VOLUMES"
    echo ""
    echo "⚠️  CRITICAL: EBS volumes cost money even when:"
    echo "   - Detached from instances (~$0.10/GB/month for gp3)"
    echo "   - Attached to STOPPED instances"
    echo "   - Not being used"
    echo ""
    echo "💡 To delete unused volumes:"
    echo "   aws ec2 delete-volume --volume-id <volume-id>"
    echo ""
    echo "📊 Calculate cost:"
    echo "   - gp3: ~$0.08/GB/month"
    echo "   - gp2: ~$0.10/GB/month"
    echo "   - io1/io2: ~$0.125/GB/month"
fi
echo ""

# ============================================
# 3. CHECK ELASTIC IPs (Cost if unattached!)
# ============================================
echo "🌐 3. ELASTIC IPs (Cost money if not attached to running instance!):"
echo "-------------------------------------------------------------------"
EIPS=$(aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,AllocationId,AssociationId,InstanceId,NetworkInterfaceId]' --output table 2>/dev/null)
if [ -z "$EIPS" ] || [ "$EIPS" = "None" ]; then
    echo "✅ No Elastic IPs found"
else
    echo "$EIPS"
    echo ""
    echo "⚠️  WARNING: Elastic IPs cost ~$0.005/hour (~$3.65/month) if:"
    echo "   - Not attached to a running instance"
    echo "   - Attached to a stopped instance"
    echo ""
    echo "💡 To release unused Elastic IPs:"
    echo "   aws ec2 release-address --allocation-id <allocation-id>"
fi
echo ""

# ============================================
# 4. CHECK EBS SNAPSHOTS
# ============================================
echo "📸 4. EBS SNAPSHOTS (These cost money!):"
echo "----------------------------------------"
SNAPSHOTS=$(aws ec2 describe-snapshots --owner-ids $ACCOUNT_ID --query 'Snapshots[*].[SnapshotId,VolumeSize,StartTime,Description]' --output table 2>/dev/null | head -20)
if [ -z "$SNAPSHOTS" ] || [ "$SNAPSHOTS" = "None" ]; then
    echo "✅ No EBS snapshots found"
else
    echo "$SNAPSHOTS"
    echo ""
    echo "⚠️  Note: Snapshots cost ~$0.05/GB/month"
    echo "   (Showing first 20 - there may be more)"
    echo ""
    echo "💡 To delete snapshots:"
    echo "   aws ec2 delete-snapshot --snapshot-id <snapshot-id>"
fi
echo ""

# ============================================
# 5. CHECK LOAD BALANCERS
# ============================================
echo "⚖️  5. LOAD BALANCERS (Can show as EC2 charges!):"
echo "-------------------------------------------------"
LBS=$(aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,State.Code,Type,Scheme]' --output table 2>/dev/null)
if [ -z "$LBS" ] || [ "$LBS" = "None" ]; then
    echo "✅ No load balancers found"
else
    echo "$LBS"
    echo ""
    echo "⚠️  Load balancers cost ~$16-20/month + data transfer"
    echo "   Delete if not using EC2 instances"
    echo ""
    echo "💡 To delete load balancers:"
    echo "   aws elbv2 delete-load-balancer --load-balancer-arn <arn>"
fi
echo ""

# ============================================
# 6. CHECK NAT GATEWAYS
# ============================================
echo "🚪 6. NAT GATEWAYS (Can show as EC2 charges!):"
echo "---------------------------------------------"
NAT_GWS=$(aws ec2 describe-nat-gateways --query 'NatGateways[*].[NatGatewayId,State,SubnetId,VpcId]' --output table 2>/dev/null)
if [ -z "$NAT_GWS" ] || [ "$NAT_GWS" = "None" ]; then
    echo "✅ No NAT Gateways found"
else
    echo "$NAT_GWS"
    echo ""
    echo "⚠️  NAT Gateways cost ~$32/month + data transfer (~$0.045/GB)"
    echo "   These are expensive! Delete if not needed."
    echo ""
    echo "💡 To delete NAT Gateways:"
    echo "   aws ec2 delete-nat-gateway --nat-gateway-id <nat-gateway-id>"
fi
echo ""

# ============================================
# 7. CHECK CLASSIC LOAD BALANCERS
# ============================================
echo "⚖️  7. CLASSIC LOAD BALANCERS:"
echo "-----------------------------"
CLASSIC_LBS=$(aws elb describe-load-balancers --query 'LoadBalancerDescriptions[*].[LoadBalancerName,CanonicalHostedZoneName]' --output table 2>/dev/null)
if [ -z "$CLASSIC_LBS" ] || [ "$CLASSIC_LBS" = "None" ]; then
    echo "✅ No classic load balancers found"
else
    echo "$CLASSIC_LBS"
    echo ""
    echo "⚠️  Classic load balancers also cost money"
fi
echo ""

# ============================================
# SUMMARY AND RECOMMENDATIONS
# ============================================
echo "======================================"
echo "📊 SUMMARY & ACTION ITEMS"
echo "======================================"
echo ""
echo "🔍 To see detailed billing breakdown:"
echo "   1. Go to: https://console.aws.amazon.com/billing/"
echo "   2. Click 'Cost Explorer'"
echo "   3. Filter by: 'EC2 - Elastic Compute Cloud'"
echo "   4. Group by: 'Usage Type' to see what's costing money"
echo ""
echo "💰 Most Common Hidden Charges:"
echo "   ✅ EBS volumes (detached or attached to stopped instances)"
echo "   ✅ Elastic IPs (unattached)"
echo "   ✅ EBS snapshots"
echo "   ✅ Load balancers"
echo "   ✅ NAT Gateways"
echo ""
echo "🎯 Quick Fixes:"
echo "   1. Delete detached EBS volumes"
echo "   2. Release unattached Elastic IPs"
echo "   3. Delete old/unused snapshots"
echo "   4. Terminate stopped EC2 instances (if not needed)"
echo "   5. Delete load balancers (if not using EC2)"
echo "   6. Delete NAT Gateways (if not using EC2)"
echo ""
echo "📝 For detailed cleanup instructions, see: EC2-CLEANUP-GUIDE.md"
echo ""
