# 🚀 AWS Deployment Guide for Football Tournaments App

This guide will help you deploy your Football Tournaments app to AWS using EC2, DynamoDB, and S3.

## 📋 Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured
3. **Docker** installed locally
4. **Git** installed

## 🔧 Step 1: Set Up AWS Credentials

```bash
# Install AWS CLI (if not already installed)
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
# Enter your Access Key ID, Secret Access Key, and region (us-east-1)
```

## 🚀 Step 2: Deploy Infrastructure

Run the automated deployment script:

```bash
# Make the script executable
chmod +x deploy-aws.sh

# Run the deployment script
./deploy-aws.sh
```

This script will:
- ✅ Create all DynamoDB tables
- ✅ Create S3 bucket for images
- ✅ Build Docker image
- ✅ Test container locally
- ✅ Create environment configuration

## 🖥️ Step 3: Launch EC2 Instance

### Option A: Using AWS Console
1. Go to **EC2 Dashboard**
2. Click **"Launch Instance"**
3. Choose **Amazon Linux 2** or **Ubuntu 20.04 LTS**
4. Select **t3.micro** (free tier) or **t3.small**
5. Configure security group:
   - **SSH (22)** - Your IP
   - **HTTP (80)** - Anywhere (0.0.0.0/0)
   - **HTTPS (443)** - Anywhere (0.0.0.0/0)
6. Create or select a key pair
7. Launch instance

### Option B: Using AWS CLI
```bash
# Create security group
aws ec2 create-security-group \
    --group-name football-tournaments-sg \
    --description "Security group for Football Tournaments app"

# Allow HTTP traffic
aws ec2 authorize-security-group-ingress \
    --group-name football-tournaments-sg \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

# Allow HTTPS traffic
aws ec2 authorize-security-group-ingress \
    --group-name football-tournaments-sg \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Allow SSH (replace with your IP)
aws ec2 authorize-security-group-ingress \
    --group-name football-tournaments-sg \
    --protocol tcp \
    --port 22 \
    --cidr YOUR_IP/32

# Launch instance
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t3.micro \
    --key-name YOUR_KEY_PAIR \
    --security-groups football-tournaments-sg
```

## 📦 Step 4: Deploy to EC2

### Method 1: Using the EC2 Setup Script

1. **SSH into your EC2 instance**:
```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

2. **Copy and run the EC2 setup script**:
```bash
# Copy the script to EC2 (from your local machine)
scp -i your-key.pem ec2-deploy.sh ec2-user@your-ec2-public-ip:~/

# SSH into EC2 and run the script
ssh -i your-key.pem ec2-user@your-ec2-public-ip
chmod +x ec2-deploy.sh
./ec2-deploy.sh
```

### Method 2: Manual Deployment

1. **Install Docker on EC2**:
```bash
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user
```

2. **Copy your Docker image to EC2**:
```bash
# Save image locally
docker save football-tournaments > football-tournaments.tar

# Copy to EC2
scp -i your-key.pem football-tournaments.tar ec2-user@your-ec2-public-ip:~/

# Load image on EC2
ssh -i your-key.pem ec2-user@your-ec2-public-ip
docker load < football-tournaments.tar
```

3. **Run the container**:
```bash
docker run -d -p 80:3000 --name football-tournaments football-tournaments
```

## 🌐 Step 5: Access Your App

Your app will be available at:
```
http://your-ec2-public-ip
```

## 🔧 Step 6: Set Up Domain (Optional)

1. **Buy a domain** from Route 53 or any domain registrar
2. **Create Route 53 hosted zone**
3. **Point domain to your EC2 instance**
4. **Set up SSL certificate** using AWS Certificate Manager

## 📊 Monitoring and Maintenance

### Check App Status
```bash
# On EC2 instance
docker ps
docker logs football-tournaments
```

### Update App
```bash
# Build new image locally
docker build -t football-tournaments .

# Copy to EC2 and restart
# (Follow the same process as initial deployment)
```

### View Logs
```bash
docker logs football-tournaments
docker logs -f football-tournaments  # Follow logs in real-time
```

## 💰 Cost Estimation

- **EC2 t3.micro**: ~$8.50/month (free tier eligible)
- **DynamoDB**: ~$1-5/month (depending on usage)
- **S3**: ~$1-3/month (depending on storage)
- **Route 53**: ~$0.50/month per hosted zone
- **Total**: ~$10-20/month

## 🆘 Troubleshooting

### Common Issues

1. **Container won't start**:
   ```bash
   docker logs football-tournaments
   ```

2. **Can't access app**:
   - Check security group settings
   - Verify container is running: `docker ps`
   - Check if port 80 is open

3. **AWS permissions error**:
   - Verify AWS credentials: `aws sts get-caller-identity`
   - Check IAM permissions

4. **DynamoDB connection issues**:
   - Verify table names in environment variables
   - Check AWS region settings

### Useful Commands

```bash
# Check AWS configuration
aws sts get-caller-identity

# List DynamoDB tables
aws dynamodb list-tables

# Check S3 bucket
aws s3 ls

# View EC2 instances
aws ec2 describe-instances
```

## 🎉 Success!

Once deployed, your Football Tournaments app will be:
- ✅ Running on AWS EC2
- ✅ Using DynamoDB for data storage
- ✅ Using S3 for image storage
- ✅ Accessible from anywhere on the internet
- ✅ Scalable and reliable

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review AWS CloudWatch logs
3. Check Docker container logs
4. Verify AWS service status

Happy deploying! 🚀⚽🏆
