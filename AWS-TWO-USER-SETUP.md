# 🔐 AWS Two-User Security Setup (Read-Only + Read-Write)

This guide sets up **two separate IAM users** with different permission levels:

1. **Read-Only User**: For public pages (can only read data)
2. **Read-Write User**: For admin/authenticated pages (can create/update/delete)

## 🎯 Benefits

✅ **Better Security**: If read-only credentials leak, attackers **cannot modify** your data  
✅ **Least Privilege**: Each user has only the permissions it needs  
✅ **Damage Limitation**: Compromised read-only credentials = view-only access  
✅ **Clear Separation**: Easy to audit what each credential set can do

---

## 📋 Overview

### Read-Only User (`football-tournaments-readonly-user`)
**Used for:**
- Public tournament pages
- Public team/player/match pages
- Home page (browsing tournaments)
- Any page that doesn't require authentication

**Permissions:**
- ✅ Read from DynamoDB tables (GetItem, Query, Scan)
- ✅ Read from S3 bucket (GetObject, ListBucket)
- ❌ Cannot write/update/delete anything

### Read-Write User (`football-tournaments-write-user`)
**Used for:**
- Admin pages (creating/editing tournaments, teams, matches)
- Authenticated operations (login, session management)
- Image uploads
- Any data modifications

**Permissions:**
- ✅ Full CRUD on DynamoDB tables
- ✅ Upload/delete images in S3
- ✅ Read access (needed for updates)

---

## 🚀 Setup Instructions

### Step 1: Create Read-Only IAM Policy

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Policies** → **Create policy**
3. Click **JSON** tab
4. Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBReadOnlyAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
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
      "Sid": "S3ReadOnlyAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
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
6. Policy name: `FootballTournamentsReadOnlyPolicy`
7. Description: `Read-only access for public pages - DynamoDB and S3 read access only`
8. Click **Create policy**

---

### Step 2: Create Read-Write IAM Policy

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Policies** → **Create policy**
3. Click **JSON** tab
4. Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBFullAccess",
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
      "Sid": "S3FullAccess",
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
6. Policy name: `FootballTournamentsWritePolicy`
7. Description: `Full access for admin pages - DynamoDB and S3 read/write access`
8. Click **Create policy**

---

### Step 3: Create Read-Only IAM User

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user**
3. Username: `football-tournaments-readonly-user`
4. **DO NOT** enable console access
5. Click **Next**
6. Click **Attach policies directly**
7. Search for `FootballTournamentsReadOnlyPolicy`
8. Select it → **Next** → **Create user**

---

### Step 4: Create Read-Write IAM User

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user**
3. Username: `football-tournaments-write-user`
4. **DO NOT** enable console access
5. Click **Next**
6. Click **Attach policies directly**
7. Search for `FootballTournamentsWritePolicy`
8. Select it → **Next** → **Create user**

---

### Step 5: Create Access Keys for Both Users

#### Read-Only User Access Key

1. Go to **Users** → `football-tournaments-readonly-user`
2. Click **Security credentials** tab
3. Click **Create access key**
4. Use case: **"Application running outside AWS"**
5. Click **Next** → Check warning checkbox
6. Description: `Football Tournaments - Read-Only (Public Pages)`
7. Click **Create access key**
8. **Download CSV** and save securely

#### Read-Write User Access Key

1. Go to **Users** → `football-tournaments-write-user`
2. Click **Security credentials** tab
3. Click **Create access key**
4. Use case: **"Application running outside AWS"**
5. Click **Next** → Check warning checkbox
6. Description: `Football Tournaments - Read-Write (Admin Pages)`
7. Click **Create access key**
8. **Download CSV** and save securely

---

### Step 6: Configure Environment Variables

Update your `.env` file or environment variables in your hosting platform:

```env
# AWS Region
VITE_AWS_REGION=us-east-1

# Read-Only Credentials (for public pages)
VITE_AWS_READONLY_ACCESS_KEY_ID=<readonly-access-key-id>
VITE_AWS_READONLY_SECRET_ACCESS_KEY=<readonly-secret-access-key>

# Read-Write Credentials (for admin pages)
VITE_AWS_WRITE_ACCESS_KEY_ID=<write-access-key-id>
VITE_AWS_WRITE_SECRET_ACCESS_KEY=<write-secret-access-key>

# S3 Bucket
VITE_S3_BUCKET_NAME=football-tournaments-images
```

**If using AWS Amplify:**

1. Go to your Amplify app
2. **App settings** → **Environment variables**
3. Add all the variables above
4. **Redeploy** your app

---

### Step 7: Update Application Code

The application code needs to be updated to use the appropriate credentials. See the code changes in the updated `aws-config.ts` file.

**Quick summary:**
- Public pages → Use read-only credentials
- Admin/authenticated pages → Use read-write credentials
- The code automatically selects credentials based on whether user is authenticated

---

## 🧪 Testing

### Test Read-Only Credentials

```bash
# Set environment variables
export AWS_ACCESS_KEY_ID=<readonly-access-key-id>
export AWS_SECRET_ACCESS_KEY=<readonly-secret-access-key>
export AWS_REGION=us-east-1

# Test DynamoDB read (should work)
aws dynamodb scan --table-name football-tournaments-tournaments --region us-east-1

# Test DynamoDB write (should FAIL)
aws dynamodb put-item --table-name football-tournaments-tournaments \
  --item '{"id":{"S":"test"}}' --region us-east-1
# Expected: AccessDeniedException

# Test S3 read (should work)
aws s3 ls s3://football-tournaments-images/

# Test S3 write (should FAIL)
echo "test" | aws s3 cp - s3://football-tournaments-images/test.txt
# Expected: AccessDeniedException
```

### Test Read-Write Credentials

```bash
# Set environment variables
export AWS_ACCESS_KEY_ID=<write-access-key-id>
export AWS_SECRET_ACCESS_KEY=<write-secret-access-key>
export AWS_REGION=us-east-1

# Test DynamoDB read (should work)
aws dynamodb scan --table-name football-tournaments-tournaments --region us-east-1

# Test DynamoDB write (should work)
aws dynamodb put-item --table-name football-tournaments-tournaments \
  --item '{"id":{"S":"test"}}' --region us-east-1

# Clean up test item
aws dynamodb delete-item --table-name football-tournaments-tournaments \
  --key '{"id":{"S":"test"}}' --region us-east-1

# Test S3 read and write (should work)
aws s3 ls s3://football-tournaments-images/
echo "test" | aws s3 cp - s3://football-tournaments-images/test.txt
aws s3 rm s3://football-tournaments-images/test.txt
```

---

## 📊 Permission Comparison

| Operation | Read-Only User | Read-Write User |
|-----------|---------------|-----------------|
| **DynamoDB** |
| GetItem | ✅ | ✅ |
| Query | ✅ | ✅ |
| Scan | ✅ | ✅ |
| PutItem | ❌ | ✅ |
| UpdateItem | ❌ | ✅ |
| DeleteItem | ❌ | ✅ |
| **S3** |
| GetObject | ✅ | ✅ |
| ListBucket | ✅ | ✅ |
| PutObject | ❌ | ✅ |
| DeleteObject | ❌ | ✅ |

---

## 🔄 Migration from Single User

If you already have a single user setup:

1. **Keep the old user active** temporarily
2. Create both new users as described above
3. Update environment variables with new credentials
4. Test thoroughly
5. **Delete old user** once confirmed working

---

## 🚨 Security Best Practices

1. ✅ **Never commit credentials** to git
2. ✅ **Use password manager** to store access keys
3. ✅ **Rotate keys regularly** (every 90 days)
4. ✅ **Monitor CloudTrail** for unusual activity
5. ✅ **Enable MFA** on your root/admin AWS account
6. ✅ **Delete unused access keys** immediately

---

## 📝 Checklist

- [ ] Read-only IAM policy created
- [ ] Read-write IAM policy created
- [ ] Read-only IAM user created
- [ ] Read-write IAM user created
- [ ] Policies attached to respective users
- [ ] Access keys created for both users
- [ ] Credentials saved securely (password manager)
- [ ] Environment variables updated
- [ ] Application code updated (if needed)
- [ ] Read-only credentials tested
- [ ] Read-write credentials tested
- [ ] Application tested end-to-end

---

## 🆘 Troubleshooting

### "Access Denied" errors

- Check that correct credentials are being used
- Verify policy is attached to the user
- Check resource ARNs match your actual table/bucket names
- Verify region matches

### Public pages can't load data

- Check read-only credentials are set correctly
- Verify read-only policy allows GetItem/Query/Scan
- Check CloudTrail for specific denied actions

### Admin pages can't save data

- Check read-write credentials are set correctly
- Verify read-write policy allows PutItem/UpdateItem/DeleteItem
- Check CloudTrail for specific denied actions

---

## 📖 Related Documentation

- [AWS-SECURITY-GUIDE.md](./AWS-SECURITY-GUIDE.md) - General security best practices
- [AWS-KEY-ROTATION-QUICK-START.md](./AWS-KEY-ROTATION-QUICK-START.md) - Quick key rotation guide
- [AWS-SETUP.md](./AWS-SETUP.md) - Initial AWS setup guide

