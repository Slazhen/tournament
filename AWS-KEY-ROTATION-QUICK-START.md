# 🚨 AWS Access Key Rotation - Quick Start

## Immediate Action Required

Your access key ending with `****U5CC` was exposed and deleted. Here's what to do **RIGHT NOW**:

> 💡 **Want Better Security?** Consider using a **two-user setup** (read-only + read-write) for enhanced security. See [AWS-TWO-USER-SETUP.md](./AWS-TWO-USER-SETUP.md) for details.

---

## ✅ Step 1: Verify Old Key is Deleted

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Users** → Find your user
3. Click **Security credentials** tab
4. Verify the old key shows "Deleted" or is removed
5. ✅ **If still active, delete it immediately!**

---

## 🔑 Step 2: Create New Access Key (5 minutes)

### A. Create IAM Policy (Minimal Permissions)

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Policies** → **Create policy**
3. Click **JSON** tab
4. Copy-paste this policy:

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
    }
  ]
}
```

5. Click **Next**
6. Policy name: `FootballTournamentsAppPolicy`
7. Click **Create policy**

### B. Create IAM User

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user**
3. Username: `football-tournaments-app-user`
4. **DO NOT** enable console access
5. Click **Next**
6. Click **Attach policies directly**
7. Search for `FootballTournamentsAppPolicy`
8. Select it → **Next** → **Create user**

### C. Create Access Key

1. Click on your new user
2. Click **Security credentials** tab
3. Click **Create access key**
4. Use case: **"Application running outside AWS"**
5. Click **Next** → Check the warning checkbox
6. Description: `Football Tournaments App`
7. Click **Create access key**

### D. Save Credentials (IMPORTANT!)

**⚠️ YOU WILL ONLY SEE THE SECRET KEY ONCE!**

1. **Download CSV** immediately
2. **Copy both values**:
   - Access Key ID: `AKIA...`
   - Secret Access Key: `...`
3. **Store securely**:
   - ✅ Password manager (1Password, LastPass, Bitwarden)
   - ✅ Never commit to git
   - ❌ Never email or share

---

## 🔄 Step 3: Update Environment Variables

### If using AWS Amplify:

1. Go to: https://console.aws.amazon.com/amplify/
2. Select your app
3. **App settings** → **Environment variables**
4. Update:
   - `VITE_AWS_ACCESS_KEY_ID` = new Access Key ID
   - `VITE_AWS_SECRET_ACCESS_KEY` = new Secret Access Key
5. **Redeploy** your app

### If using local `.env` file:

1. Edit `.env` file (do NOT commit to git!)
2. Update:
   ```env
   VITE_AWS_ACCESS_KEY_ID=<NEW_ACCESS_KEY_ID>
   VITE_AWS_SECRET_ACCESS_KEY=<NEW_SECRET_ACCESS_KEY>
   ```
3. Restart your dev server

---

## 🧪 Step 4: Test New Credentials

Test that everything works:

```bash
# Test DynamoDB
aws dynamodb list-tables --region us-east-1

# Test S3
aws s3 ls s3://football-tournaments-images

# Test your app
npm run dev
```

---

## 📋 What This Policy Allows

✅ **Can do:**
- Read/Write to your 6 DynamoDB tables
- Upload/Download/Delete images in your S3 bucket
- Query tables using indexes

❌ **Cannot do:**
- Access other AWS resources
- Create/delete tables or buckets
- Access other DynamoDB tables or S3 buckets
- Modify IAM permissions

This is **much more secure** than the old full-access approach!

---

## 🔒 Additional Security Steps (Recommended)

1. **Enable MFA** on your root AWS account
2. **Enable CloudTrail** for audit logging
3. **Set calendar reminder** to rotate keys every 90 days

---

## 📖 Full Documentation

For complete details, see: **[AWS-SECURITY-GUIDE.md](./AWS-SECURITY-GUIDE.md)**

---

## ✅ Quick Checklist

- [ ] Old access key deleted
- [ ] New IAM policy created
- [ ] New IAM user created
- [ ] Policy attached to user
- [ ] New access key created
- [ ] Credentials saved securely
- [ ] Environment variables updated
- [ ] App tested with new credentials

**Total time: ~10 minutes**

