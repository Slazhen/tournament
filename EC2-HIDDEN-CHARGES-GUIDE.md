# 🚨 EC2 Hidden Charges Guide - Why You're Being Charged $44

## ⚠️ The Problem

You're seeing **$44 in EC2 charges** even though you have **0 running EC2 instances** and you're using **AWS Amplify** for hosting.

**This is VERY common!** EC2 billing includes many hidden resources that continue to charge even when instances are stopped or deleted.

---

## 🔍 What Could Be Causing Your $44 Bill?

### 1. **EBS Volumes (Most Common Culprit!)** 💾
**Cost:** ~$0.08-0.10 per GB per month

**The Problem:**
- EBS volumes **still charge** even when:
  - ✅ Detached from instances
  - ✅ Attached to **stopped** instances
  - ✅ Not being used at all

**How to Check:**
```bash
aws ec2 describe-volumes --query 'Volumes[*].[VolumeId,State,Size,VolumeType,Attachments[0].InstanceId]' --output table
```

**Example:**
- 2 volumes × 20GB each = 40GB
- 40GB × $0.10/GB = **$4/month**
- If you have larger volumes, this adds up quickly!

**How to Fix:**
1. Go to EC2 Console → **Volumes**
2. Find volumes with state: **"available"** (detached) or attached to stopped instances
3. Select them → **Actions** → **Delete volume**
4. ⚠️ **Warning:** This is permanent! Make sure you don't need the data.

---

### 2. **Elastic IPs (Unattached)** 🌐
**Cost:** ~$0.005/hour = **~$3.65/month per IP**

**The Problem:**
- Elastic IPs cost money if:
  - ✅ Not attached to a **running** instance
  - ✅ Attached to a **stopped** instance
  - ✅ Just sitting there unused

**How to Check:**
```bash
aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,AllocationId,InstanceId]' --output table
```

**Example:**
- 2 unattached Elastic IPs = **$7.30/month**

**How to Fix:**
1. Go to EC2 Console → **Elastic IPs**
2. Find IPs with **"Instance"** column showing **"-"** or a stopped instance
3. Select them → **Actions** → **Release Elastic IP addresses**
4. ⚠️ **Warning:** You'll lose these IPs permanently!

---

### 3. **EBS Snapshots** 📸
**Cost:** ~$0.05 per GB per month

**The Problem:**
- Snapshots are backups of your EBS volumes
- They **continue to charge** even after volumes are deleted
- Old snapshots accumulate over time

**How to Check:**
```bash
aws ec2 describe-snapshots --owner-ids self --query 'Snapshots[*].[SnapshotId,VolumeSize,StartTime]' --output table
```

**Example:**
- 10 snapshots × 20GB each = 200GB
- 200GB × $0.05/GB = **$10/month**

**How to Fix:**
1. Go to EC2 Console → **Snapshots**
2. Find old/unused snapshots
3. Select them → **Actions** → **Delete snapshot**
4. ⚠️ **Warning:** You'll lose these backups!

---

### 4. **Load Balancers** ⚖️
**Cost:** ~$16-20/month + data transfer

**The Problem:**
- Application Load Balancers (ALB) and Network Load Balancers (NLB) charge even when not in use
- Classic Load Balancers also charge

**How to Check:**
```bash
# Application/Network Load Balancers
aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,State.Code,Type]' --output table

# Classic Load Balancers
aws elb describe-load-balancers --query 'LoadBalancerDescriptions[*].LoadBalancerName' --output table
```

**How to Fix:**
1. Go to EC2 Console → **Load Balancers**
2. If you're using Amplify, you don't need these
3. Select them → **Actions** → **Delete**
4. ⚠️ **Warning:** This will break any traffic going through the load balancer!

---

### 5. **NAT Gateways** 🚪
**Cost:** ~$32/month + $0.045/GB data transfer

**The Problem:**
- NAT Gateways are expensive!
- They charge even when not actively used
- Often left behind after EC2 cleanup

**How to Check:**
```bash
aws ec2 describe-nat-gateways --query 'NatGateways[*].[NatGatewayId,State,SubnetId]' --output table
```

**How to Fix:**
1. Go to VPC Console → **NAT Gateways**
2. If you're using Amplify, you don't need these
3. Select them → **Actions** → **Delete NAT Gateway**
4. ⚠️ **Warning:** This will break private subnet internet access!

---

### 6. **Stopped EC2 Instances** 🖥️
**Cost:** $0 for the instance, but EBS volumes still charge!

**The Problem:**
- Stopped instances don't charge for compute
- But attached EBS volumes **still charge**
- You need to **terminate** (not just stop) to avoid volume charges

**How to Check:**
```bash
aws ec2 describe-instances --filters "Name=instance-state-name,Values=stopped" --query 'Reservations[*].Instances[*].[InstanceId,State.Name,InstanceType]' --output table
```

**How to Fix:**
1. Go to EC2 Console → **Instances**
2. Filter by **"Stopped"** state
3. If you're using Amplify, terminate them:
   - Select → **Instance state** → **Terminate instance**
4. ⚠️ **Warning:** This is permanent! Make sure you don't need them.

---

## 🔧 Quick Diagnostic Script

Run this script to find ALL EC2-related charges:

```bash
./scripts/find-ec2-charges.sh
```

Or use the existing script:
```bash
./scripts/check-aws-resources.sh
```

---

## 💰 How to Check Your Actual Billing

### Step 1: Check Cost Explorer
1. Go to: https://console.aws.amazon.com/billing/
2. Click **"Cost Explorer"**
3. Filter by service: **"EC2 - Elastic Compute Cloud"**
4. Group by: **"Usage Type"** to see exactly what's charging

### Step 2: Check Usage Types
Common EC2 usage types that charge:
- `EBS:VolumeUsage` - EBS volumes
- `EBS:SnapshotUsage` - EBS snapshots
- `ElasticIP:Address` - Elastic IPs
- `DataTransfer-Out-Bytes` - Data transfer
- `NatGateway-Hours` - NAT Gateway hours
- `LoadBalancerUsage` - Load balancer hours

### Step 3: Check by Resource
1. In Cost Explorer, click **"Group by"** → **"Resource"**
2. This shows which specific resources are costing money
3. Look for:
   - Volume IDs (vol-xxxxx)
   - Elastic IP addresses
   - Snapshot IDs (snap-xxxxx)
   - Load balancer ARNs
   - NAT Gateway IDs

---

## 🎯 Action Plan to Reduce Your $44 Bill

### Priority 1: Check EBS Volumes (Most Likely Culprit)
```bash
# List all volumes
aws ec2 describe-volumes --query 'Volumes[*].[VolumeId,State,Size,VolumeType,Attachments[0].InstanceId]' --output table

# Delete detached volumes (CAREFUL!)
aws ec2 delete-volume --volume-id vol-xxxxx
```

### Priority 2: Check Elastic IPs
```bash
# List all Elastic IPs
aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,AllocationId,InstanceId]' --output table

# Release unattached IPs (CAREFUL!)
aws ec2 release-address --allocation-id eipalloc-xxxxx
```

### Priority 3: Check Snapshots
```bash
# List all snapshots
aws ec2 describe-snapshots --owner-ids self --query 'Snapshots[*].[SnapshotId,VolumeSize,StartTime]' --output table

# Delete old snapshots (CAREFUL!)
aws ec2 delete-snapshot --snapshot-id snap-xxxxx
```

### Priority 4: Check Load Balancers
```bash
# List load balancers
aws elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName,State.Code]' --output table

# Delete if not needed (CAREFUL!)
aws elbv2 delete-load-balancer --load-balancer-arn <arn>
```

### Priority 5: Check NAT Gateways
```bash
# List NAT Gateways
aws ec2 describe-nat-gateways --query 'NatGateways[*].[NatGatewayId,State]' --output table

# Delete if not needed (CAREFUL!)
aws ec2 delete-nat-gateway --nat-gateway-id nat-xxxxx
```

---

## 📊 Expected Cost Breakdown for $44

Here's what $44/month could be:

| Resource | Quantity | Cost |
|----------|----------|------|
| EBS Volumes (40GB) | 2 volumes × 20GB | $4/month |
| Elastic IPs | 2 unattached | $7.30/month |
| EBS Snapshots (200GB) | 10 snapshots × 20GB | $10/month |
| Load Balancer | 1 ALB | $18/month |
| Data Transfer | ~50GB | $4.50/month |
| **Total** | | **~$43.80/month** |

---

## ✅ Verification Checklist

After cleanup, verify:

- [ ] No detached EBS volumes
- [ ] No unattached Elastic IPs
- [ ] Old snapshots deleted (keep recent ones if needed)
- [ ] Load balancers deleted (if using Amplify)
- [ ] NAT Gateways deleted (if using Amplify)
- [ ] Stopped instances terminated (if not needed)
- [ ] Cost Explorer shows reduced EC2 charges next month

---

## 🆘 Still Seeing Charges?

If you've cleaned up everything and still see charges:

1. **Check Cost Explorer by Usage Type** - This shows exactly what's charging
2. **Check all AWS regions** - Resources might be in different regions
3. **Check for pending charges** - Some charges appear with a delay
4. **Contact AWS Support** - They can help identify hidden charges

---

## 📝 Important Notes

### What to KEEP:
- ✅ **S3 Buckets** - These are cheap and needed
- ✅ **DynamoDB Tables** - These are pay-per-use and needed
- ✅ **Amplify Apps** - These are your hosting
- ✅ **Recent Snapshots** - If you need backups

### What to DELETE:
- ❌ **Detached EBS volumes** - Not needed if using Amplify
- ❌ **Unattached Elastic IPs** - Not needed if using Amplify
- ❌ **Old snapshots** - Unless you need them for backups
- ❌ **Load balancers** - Not needed if using Amplify
- ❌ **NAT Gateways** - Not needed if using Amplify
- ❌ **Stopped EC2 instances** - Not needed if using Amplify

---

## 🔗 Related Guides

- [EC2-CLEANUP-GUIDE.md](./EC2-CLEANUP-GUIDE.md) - General EC2 cleanup
- [scripts/find-ec2-charges.sh](./scripts/find-ec2-charges.sh) - Diagnostic script
- [scripts/check-aws-resources.sh](./scripts/check-aws-resources.sh) - Resource checker

---

**Remember:** Always verify you're using Amplify before deleting EC2 resources. Once deleted, they're gone forever!
