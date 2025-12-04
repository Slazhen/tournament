# AWS Database Setup Guide

## 1. Create AWS Account

1. Go to [https://aws.amazon.com](https://aws.amazon.com)
2. Sign up for a free AWS account
3. Complete the account verification process

## 2. Create IAM User

> ⚠️ **SECURITY ALERT**: If you've exposed an access key, see **[AWS-SECURITY-GUIDE.md](./AWS-SECURITY-GUIDE.md)** for proper remediation steps with minimal permissions.

### Option A: Secure Setup (Recommended - Minimal Permissions)

**Follow the detailed guide**: See **[AWS-SECURITY-GUIDE.md](./AWS-SECURITY-GUIDE.md)** for step-by-step instructions on creating a user with a custom policy that grants only the minimum required permissions.

**Quick summary:**
1. Create a custom IAM policy with minimal DynamoDB and S3 permissions
2. Create a new IAM user
3. Attach the custom policy
4. Create access key

### Option B: Quick Setup (Less Secure - Full Access)

> ⚠️ **WARNING**: This grants full access to all DynamoDB and S3 resources. Use only for development/testing.

1. Go to **IAM** → **Users** → **Create user**
2. Username: `football-tournaments-user`
3. Select **Programmatic access** (do NOT enable console access)
4. Attach policies:
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess`
5. Download the **Access Key ID** and **Secret Access Key**
6. **Store credentials securely** (password manager, never commit to git)

## 3. Create DynamoDB Tables

Run these commands in AWS CLI or use the AWS Console:

### Organizers Table
```bash
aws dynamodb create-table \
    --table-name football-tournaments-organizers \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
```

### Teams Table
```bash
aws dynamodb create-table \
    --table-name football-tournaments-teams \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=organizerId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=organizerId-index,KeySchema='[{AttributeName=organizerId,KeyType=HASH}]',Projection='{ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST
```

### Tournaments Table
```bash
aws dynamodb create-table \
    --table-name football-tournaments-tournaments \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=organizerId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=organizerId-index,KeySchema='[{AttributeName=organizerId,KeyType=HASH}]',Projection='{ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST
```

### Matches Table (for future use)
```bash
aws dynamodb create-table \
    --table-name football-tournaments-matches \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=tournamentId,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=tournamentId-index,KeySchema='[{AttributeName=tournamentId,KeyType=HASH}]',Projection='{ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST
```

## 4. Create S3 Bucket

```bash
aws s3 mb s3://football-tournaments-images
aws s3api put-bucket-cors --bucket football-tournaments-images --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": []
    }
  ]
}'
```

## 5. Environment Configuration

Create a `.env` file in your project root:

```env
# AWS Configuration
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your-access-key-id
VITE_AWS_SECRET_ACCESS_KEY=your-secret-access-key
VITE_S3_BUCKET_NAME=football-tournaments-images
```

## 6. Alternative: Use AWS Console

If you prefer using the AWS Console:

### DynamoDB Tables
1. Go to **DynamoDB** → **Tables** → **Create table**
2. For each table:
   - **Table name**: `football-tournaments-organizers` (or teams, tournaments, matches)
   - **Partition key**: `id` (String)
   - **Settings**: Use default settings
   - **Global secondary indexes**: Add `organizerId-index` for teams and tournaments tables

### S3 Bucket
1. Go to **S3** → **Create bucket**
2. **Bucket name**: `football-tournaments-images`
3. **Region**: Choose your preferred region
4. **Block public access**: Uncheck "Block all public access"
5. **Bucket policy**: Add the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::football-tournaments-images/*"
    }
  ]
}
```

## 7. Test the Setup

1. Update your `.env` file with the correct credentials
2. Run the app: `npm run dev`
3. Try creating an organizer - it should save to DynamoDB
4. Try uploading an image - it should save to S3
5. Check in AWS Console that data appears in the tables/bucket

## 8. Benefits

✅ **Scalable Database**: DynamoDB scales automatically
✅ **Fast Image Storage**: S3 with CDN capabilities
✅ **Cost Effective**: Pay only for what you use
✅ **Reliable**: AWS infrastructure with 99.99% uptime
✅ **Secure**: IAM roles and policies for access control
✅ **Global**: Available in multiple AWS regions

## 9. Cost Estimation

**Free Tier (12 months):**
- DynamoDB: 25 GB storage, 25 read/write capacity units
- S3: 5 GB storage, 20,000 GET requests, 2,000 PUT requests

**After Free Tier:**
- DynamoDB: ~$0.25 per GB per month
- S3: ~$0.023 per GB per month
- Very cost-effective for small to medium applications

## 10. Security Best Practices

> 📖 **For detailed security guidance, including access key rotation after exposure, see [AWS-SECURITY-GUIDE.md](./AWS-SECURITY-GUIDE.md)**

1. **Never commit credentials** to version control
2. **Use minimal permissions** - Create custom IAM policies instead of full access policies
3. **Use IAM roles** in production (EC2, Lambda, Amplify, etc.)
4. **Enable CloudTrail** for audit logging
5. **Regularly rotate access keys** (every 90 days recommended)
6. **Enable MFA** on your root/admin AWS account
7. **If access key is exposed**: Follow the remediation steps in [AWS-SECURITY-GUIDE.md](./AWS-SECURITY-GUIDE.md)

## 11. Migration from localStorage

Once AWS is set up, we'll update the store to use the AWS services instead of localStorage. This will solve the session isolation issue completely!
