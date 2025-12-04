# 🔐 AWS Security Guide - Access Key Rotation

## ⚠️ CRITICAL: Exposed Access Key Remediation

If your AWS access key ending with `****U5CC` was exposed, follow these steps immediately:

### 1. ✅ Verify the Old Key is Deleted
- Go to **IAM** → **Users** → Find your user
- Click on **Security credentials** tab
- Verify the old access key is deleted (status shows "Deleted" or removed)
- If still active, delete it immediately

### 2. 🔑 Create a New IAM User with Minimal Permissions

**DO NOT** reuse the old IAM user. Create a new one with proper security practices.

#### Step 1: Create a New IAM User

1. Go to **IAM Console**: https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user**
3. Username: `football-tournaments-app-user` (use a different name than before)
4. Select **"Provide user access to the AWS Management Console"** = **NO** (we only need programmatic access)
5. Click **Next**

#### Step 2: Create Custom Policy with Minimal Permissions

Instead of using `AmazonDynamoDBFullAccess` and `AmazonS3FullAccess`, we'll create a custom policy with **least-privilege** permissions.

1. Go to **IAM** → **Policies** → **Create policy**
2. Click **JSON** tab
3. Paste this policy (replace bucket name if different):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/football-tournaments-organizers",
        "arn:aws:dynamodb:*:*:table/football-tournaments-teams",
        "arn:aws:dynamodb:*:*:table/football-tournaments-tournaments",
        "arn:aws:dynamodb:*:*:table/football-tournaments-matches",
        "arn:aws:dynamodb:*:*:table/football-tournaments-auth-users",
        "arn:aws:dynamodb:*:*:table/football-tournaments-auth-sessions",
        "arn:aws:dynamodb:*:*:table/football-tournaments-organizers/index/*",
        "arn:aws:dynamodb:*:*:table/football-tournaments-teams/index/*",
        "arn:aws:dynamodb:*:*:table/football-tournaments-tournaments/index/*",
        "arn:aws:dynamodb:*:*:table/football-tournaments-matches/index/*",
        "arn:aws:dynamodb:*:*:table/football-tournaments-auth-users/index/*",
        "arn:aws:dynamodb:*:*:table/football-tournaments-auth-sessions/index/*"
      ]
    },
    {
      "Sid": "S3BucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::football-tournaments-images",
        "arn:aws:s3:::football-tournaments-images/*"
      ]
    },
    {
      "Sid": "S3BucketList",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::football-tournaments-images"
      ]
    }
  ]
}
```

4. Click **Next**
5. Policy name: `FootballTournamentsAppPolicy`
6. Description: `Minimal permissions for football tournaments application - DynamoDB and S3 access only`
7. Click **Create policy**

#### Step 3: Attach Policy to User

1. Go back to your user: **IAM** → **Users** → `football-tournaments-app-user`
2. Click **Add permissions** → **Attach policies directly**
3. Search for `FootballTournamentsAppPolicy`
4. Select it and click **Next** → **Add permissions**

#### Step 4: Create Access Key

1. Still in your user page, click **Security credentials** tab
2. Scroll to **Access keys** section
3. Click **Create access key**
4. Use case: Select **"Application running outside AWS"**
5. Click **Next**
6. **IMPORTANT**: 
   - Check **"I understand the recommendations above, and I want to proceed to create an access key"**
   - Description: `Football Tournaments App - Production`
7. Click **Create access key**

#### Step 5: Save Credentials Securely

**⚠️ CRITICAL: This is the ONLY time you'll see the secret key**

1. **Download the credentials** as CSV
2. **Copy both values**:
   - Access Key ID
   - Secret Access Key
3. **Store them securely**:
   - ✅ Use a password manager (1Password, LastPass, Bitwarden)
   - ✅ Never commit to git
   - ✅ Never share in plain text
   - ❌ Don't email them
   - ❌ Don't save in plain text files

### 3. 🔄 Update Your Environment Variables

Update your `.env` file (or environment variables in your hosting platform):

```env
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=<NEW_ACCESS_KEY_ID>
VITE_AWS_SECRET_ACCESS_KEY=<NEW_SECRET_ACCESS_KEY>
VITE_S3_BUCKET_NAME=football-tournaments-images
```

**If using AWS Amplify:**
- Go to your Amplify app
- **App settings** → **Environment variables**
- Update the values there

### 4. 🧪 Test the New Credentials

Test that everything works:

```bash
# Test DynamoDB access
aws dynamodb list-tables --region us-east-1

# Test S3 access
aws s3 ls s3://football-tournaments-images
```

### 5. 🔒 Additional Security Best Practices

#### Enable MFA on Your Root Account
1. Go to **IAM** → **Users** → Your root/admin user
2. Enable MFA (Multi-Factor Authentication)
3. Use an authenticator app (Google Authenticator, Authy)

#### Set Up CloudTrail (Audit Logging)
1. Go to **CloudTrail** console
2. Create a trail
3. Log all API calls for security monitoring

#### Enable Access Analyzer
1. Go to **IAM** → **Access Analyzer**
2. Enable it to detect unintended resource access

#### Rotate Keys Regularly
- **Best Practice**: Rotate access keys every 90 days
- Set a calendar reminder
- Create new key before deleting old one (for zero downtime)

#### Use IAM Roles When Possible
For AWS services (EC2, Lambda, Amplify), use IAM roles instead of access keys:
- More secure
- Automatic credential rotation
- No keys to manage

### 6. 📋 Permission Breakdown

The custom policy grants:

**DynamoDB Permissions:**
- ✅ Read/Write to specific tables only
- ✅ Query/Scan on specific tables
- ✅ Access to Global Secondary Indexes (GSIs)
- ❌ Cannot create/delete tables (admin-only operation)
- ❌ Cannot access other DynamoDB tables

**S3 Permissions:**
- ✅ Upload files (`PutObject`)
- ✅ Read files (`GetObject`)
- ✅ Delete files (`DeleteObject`)
- ✅ List bucket contents (`ListBucket`)
- ❌ Cannot delete bucket
- ❌ Cannot change bucket settings
- ❌ Cannot access other S3 buckets

### 7. 🚨 If Keys Are Compromised

If you suspect your new keys are compromised:

1. **Delete the access key immediately**
2. **Create a new access key** following this guide
3. **Review CloudTrail logs** to see what actions were taken
4. **Check for unauthorized resources** in your account
5. **Rotate any other credentials** that may have been exposed

### 8. 📝 Checklist

- [ ] Old access key deleted from IAM
- [ ] New IAM user created
- [ ] Custom policy created with minimal permissions
- [ ] Policy attached to new user
- [ ] New access key created
- [ ] Credentials saved securely (password manager)
- [ ] Environment variables updated
- [ ] Application tested with new credentials
- [ ] MFA enabled on root/admin account
- [ ] CloudTrail enabled (optional but recommended)
- [ ] Calendar reminder set for key rotation (90 days)

---

## 🎯 Quick Reference: Required Permissions Summary

Your application needs access to:

1. **DynamoDB Tables:**
   - `football-tournaments-organizers`
   - `football-tournaments-teams`
   - `football-tournaments-tournaments`
   - `football-tournaments-matches`
   - `football-tournaments-auth-users`
   - `football-tournaments-auth-sessions`

2. **S3 Bucket:**
   - `football-tournaments-images` (or your bucket name)

**Operations needed:**
- DynamoDB: PutItem, GetItem, UpdateItem, DeleteItem, Query, Scan
- S3: PutObject, GetObject, DeleteObject, ListBucket

**Operations NOT needed:**
- Creating/deleting tables
- Creating/deleting buckets
- Managing IAM policies
- Accessing other AWS services

---

## ✅ Security Posture After This Setup

After following this guide:
- ✅ **Principle of Least Privilege**: User can only access required resources
- ✅ **Resource Isolation**: Cannot access other tables/buckets
- ✅ **Audit Ready**: All actions can be logged via CloudTrail
- ✅ **Rotation Ready**: Easy to rotate keys without service disruption
- ✅ **Blast Radius Reduced**: If compromised, damage is limited to specific resources

