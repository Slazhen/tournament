# 🚨 EC2 Cleanup Guide - Stop Unnecessary Charges

## ⚠️ Problem Identified

You're being charged **$62/month for EC2** even though you're using **AWS Amplify** for hosting. This is because you have **2 EC2 instances** running that are no longer needed:

- **Production**: `i-03a2402ec98975a44` (IP: 54.81.249.95)
- **Development**: `i-0ed8af072c464ddf7` (IP: 18.212.116.211)

## ✅ Solution: Terminate EC2 Instances

Since you're using AWS Amplify, you don't need these EC2 instances. Here's how to clean them up:

## 🔍 Step 1: Verify You're Using Amplify

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Check if you have apps deployed:
   - Look for apps like `mftournament-prod` or `mftournament-dev`
   - If you see deployed apps, you're using Amplify ✅
   - If not, you might still be using EC2

## 🗑️ Step 2: Terminate EC2 Instances (IMPORTANT: Backup First!)

### Option A: Using AWS Console (Recommended)

1. **Go to EC2 Console**: https://console.aws.amazon.com/ec2/
2. **Click "Instances"** in the left sidebar
3. **Find your instances**:
   - Look for instances with names: `football-tournaments-prod` and `football-tournaments-dev`
   - Or search by instance IDs: `i-03a2402ec98975a44` and `i-0ed8af072c464ddf7`
4. **Select both instances** (hold Ctrl/Cmd to select multiple)
5. **Click "Instance state" → "Terminate instance"**
6. **Confirm termination** (this action cannot be undone!)

### Option B: Using AWS CLI

```bash
# List all running instances
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,InstanceType,PublicIpAddress]' --output table

# Terminate specific instances (REPLACE with your instance IDs)
aws ec2 terminate-instances --instance-ids i-03a2402ec98975a44 i-0ed8af072c464ddf7

# Verify termination
aws ec2 describe-instances --instance-ids i-03a2402ec98975a44 i-0ed8af072c464ddf7 --query 'Reservations[*].Instances[*].State.Name'
```

## 💰 Step 3: Check Your Costs

After terminating the instances, check your AWS billing:

1. **Go to AWS Billing Console**: https://console.aws.amazon.com/billing/
2. **Click "Cost Explorer"**
3. **Filter by service**: Select "EC2 - Elastic Compute Cloud"
4. **Check November charges**: Should show $62 (or similar)
5. **After termination**: December charges should be $0 for EC2

## 📊 Step 4: Verify What Services You're Actually Using

Run this command to see all your AWS resources:

```bash
# Check EC2 instances
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,InstanceType,Tags[?Key==`Name`].Value|[0]]' --output table

# Check Amplify apps
aws amplify list-apps --query 'apps[*].[name,defaultDomain]' --output table

# Check S3 buckets (you should keep these)
aws s3 ls

# Check DynamoDB tables (you should keep these)
aws dynamodb list-tables
```

## ⚠️ Important Notes

### What to KEEP:
- ✅ **S3 Buckets** (for image storage) - `football-tournaments-images`
- ✅ **DynamoDB Tables** (for database) - `football-tournaments-*`
- ✅ **Amplify Apps** (for hosting)
- ✅ **Route53 DNS** (if you're using it)

### What to TERMINATE:
- ❌ **EC2 Instances** (if you're using Amplify)
- ❌ **Elastic IPs** (if not attached to anything)
- ❌ **Load Balancers** (if not using EC2)
- ❌ **Security Groups** (for EC2 instances)

## 🔄 Step 5: Clean Up Related Resources

After terminating EC2 instances, also clean up:

### 1. Elastic IPs (if any)
```bash
# List Elastic IPs
aws ec2 describe-addresses --query 'Addresses[*].[PublicIp,AssociationId,InstanceId]' --output table

# Release unassociated Elastic IPs
aws ec2 release-address --allocation-id <allocation-id>
```

### 2. Security Groups (for EC2)
```bash
# List security groups
aws ec2 describe-security-groups --query 'SecurityGroups[*].[GroupId,GroupName,Description]' --output table

# Delete unused security groups (be careful!)
aws ec2 delete-security-group --group-id <group-id>
```

### 3. Key Pairs (if not needed)
```bash
# List key pairs
aws ec2 describe-key-pairs --query 'KeyPairs[*].KeyName' --output table

# Delete key pairs (optional, keep if you might need them)
aws ec2 delete-key-pair --key-name <key-name>
```

## 📈 Expected Cost Savings

**Before cleanup:**
- EC2: ~$62/month (2 instances running 24/7)
- Amplify: ~$0-15/month (depending on traffic)
- **Total: ~$62-77/month**

**After cleanup:**
- EC2: $0/month ✅
- Amplify: ~$0-15/month
- **Total: ~$0-15/month**

**Savings: ~$47-62/month = $564-744/year!** 💰

## 🎯 Quick Action Checklist

- [ ] Verify Amplify apps are running and working
- [ ] Check EC2 console for running instances
- [ ] Backup any data from EC2 (if needed)
- [ ] Terminate EC2 instances
- [ ] Release Elastic IPs (if any)
- [ ] Delete unused security groups
- [ ] Verify billing shows $0 for EC2 next month
- [ ] Keep S3 and DynamoDB (they're needed)

## 🚨 If You Still Need EC2

If you discover you DO need EC2 instances:

1. **Stop them instead of terminating** (you can restart later)
2. **Use smaller instance types** (t2.micro is free tier eligible)
3. **Stop instances when not in use** (saves money)
4. **Consider switching to Amplify** (cheaper and easier)

## 📞 Need Help?

If you're unsure about anything:
1. Check your Amplify console first
2. Verify your website is accessible via Amplify domain
3. Only terminate EC2 if you're 100% sure you're using Amplify

---

**Remember**: Terminating instances is permanent! Make sure you're using Amplify before terminating.

