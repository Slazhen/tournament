# AWS Console IAM Fix Instructions

## Problem
The IAM user `football-tournaments-deployer` lacks permissions to create SSL certificates.

## Solution: Add Required Policies via AWS Console

### Step 1: Access AWS Console
1. Go to [AWS Console](https://console.aws.amazon.com)
2. Navigate to **IAM** service
3. Click **Users** in the left sidebar

### Step 2: Find Your User
1. Search for `football-tournaments-deployer`
2. Click on the username

### Step 3: Add Permissions
1. Click **"Add permissions"** button
2. Select **"Attach policies directly"**
3. Click **"Next"**

### Step 4: Attach Required Policies
Search for and select these policies:

#### For SSL Certificates:
- **`AmazonCertificateManagerFullAccess`**
  - Allows creating, managing, and deleting SSL certificates

#### For DNS Management:
- **`AmazonRoute53FullAccess`**
  - Allows managing DNS records for domain validation

### Step 5: Review and Attach
1. Review the selected policies
2. Click **"Add permissions"**

### Step 6: Verify Permissions
The user should now have these permissions:
- `acm:RequestCertificate` - Create SSL certificates
- `acm:DescribeCertificate` - Check certificate status
- `route53:ChangeResourceRecordSets` - Create DNS validation records
- `route53:GetChange` - Check DNS propagation

### Step 7: Test the Fix
After adding the policies, retry your deployment:
```bash
./deploy-domain.sh
```

## Alternative: Use AWS CLI with Admin Credentials
If you have admin access, you can run:
```bash
# Switch to admin credentials
aws configure --profile admin

# Run the fix script with admin profile
AWS_PROFILE=admin ./fix-iam-permissions.sh
```

## What This Fixes
- ✅ SSL certificate creation (`acm:RequestCertificate`)
- ✅ Certificate management and validation
- ✅ DNS record creation for domain validation
- ✅ Route 53 DNS management

After applying these permissions, your deployment should proceed successfully with SSL certificate creation!
