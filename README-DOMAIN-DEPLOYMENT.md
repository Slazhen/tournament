# 🌐 Domain Deployment Guide for Football Tournaments App

This guide will help you deploy your Football Tournaments app with custom domains:
- **Production**: `myfootballtournament.com`
- **Development**: `dev.myfootballtournament.com`

## 📋 Prerequisites

1. **AWS Account** with billing enabled
2. **Domain registered** at `myfootballtournament.com`
3. **AWS CLI** installed and configured
4. **Docker** installed locally
5. **jq** installed (for JSON processing)

## 🚀 Step 1: Set Up Domain Infrastructure

Run the domain deployment script to create all AWS resources:

```bash
# Make the script executable
chmod +x deploy-domain.sh

# Run the domain deployment script
./deploy-domain.sh
```

This script will:
- ✅ Create Route 53 hosted zone for your domain
- ✅ Create separate DynamoDB tables for prod and dev
- ✅ Create separate S3 buckets for prod and dev
- ✅ Build Docker images for both environments
- ✅ Create environment-specific configurations
- ✅ Request SSL certificates

## 🖥️ Step 2: Launch EC2 Instances

### Option A: Production and Development on Separate Instances

**Launch Production Instance:**
```bash
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t3.micro \
    --key-name YOUR_KEY_PAIR \
    --security-groups football-tournaments-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments-prod}]'
```

**Launch Development Instance:**
```bash
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t3.micro \
    --key-name YOUR_KEY_PAIR \
    --security-groups football-tournaments-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments-dev}]'
```

### Option B: Both Environments on Single Instance

```bash
aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --count 1 \
    --instance-type t3.small \
    --key-name YOUR_KEY_PAIR \
    --security-groups football-tournaments-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=football-tournaments}]'
```

## 📦 Step 3: Deploy to EC2

### Method 1: Using the EC2 Domain Setup Script

1. **SSH into your EC2 instance**:
```bash
ssh -i your-key.pem ec2-user@your-ec2-public-ip
```

2. **Copy and run the EC2 domain setup script**:
```bash
# Copy the script to EC2
scp -i your-key.pem ec2-domain-deploy.sh ec2-user@your-ec2-public-ip:~/

# SSH into EC2 and run the script
ssh -i your-key.pem ec2-user@your-ec2-public-ip
chmod +x ec2-domain-deploy.sh
./ec2-domain-deploy.sh
```

### Method 2: Manual Deployment

1. **Install required software on EC2**:
```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Certbot
sudo yum install -y certbot python3-certbot-nginx
```

2. **Copy your Docker images to EC2**:
```bash
# Save images locally
docker save football-tournaments-prod > football-tournaments-prod.tar
docker save football-tournaments-dev > football-tournaments-dev.tar

# Copy to EC2
scp -i your-key.pem football-tournaments-prod.tar ec2-user@your-ec2-public-ip:~/
scp -i your-key.pem football-tournaments-dev.tar ec2-user@your-ec2-public-ip:~/

# Load images on EC2
ssh -i your-key.pem ec2-user@your-ec2-public-ip
docker load < football-tournaments-prod.tar
docker load < football-tournaments-dev.tar
```

## 🌐 Step 4: Set Up DNS Records

Run the Route 53 setup script:

```bash
# Make the script executable
chmod +x setup-route53.sh

# Run the DNS setup script
./setup-route53.sh
```

This script will:
- ✅ Create A records for your domains
- ✅ Set up SSL certificate validation
- ✅ Check DNS propagation
- ✅ Test domain accessibility

## 🔒 Step 5: Get SSL Certificates

On your EC2 instance, get SSL certificates:

```bash
# For production domain
sudo certbot --nginx -d myfootballtournament.com -d www.myfootballtournament.com

# For development domain
sudo certbot --nginx -d dev.myfootballtournament.com
```

## 🚀 Step 6: Deploy Applications

Deploy your applications using the generated Docker Compose files:

```bash
# Deploy production
cd /home/ec2-user/football-tournaments-prod
./deploy.sh

# Deploy development
cd /home/ec2-user/football-tournaments-dev
./deploy.sh
```

## 🌐 Step 7: Access Your Applications

Your applications will be available at:
- **Production**: https://myfootballtournament.com
- **Development**: https://dev.myfootballtournament.com

## 🔧 Environment Configuration

### Production Environment
- **Domain**: `myfootballtournament.com`
- **Port**: 3001
- **DynamoDB Tables**: `football-*` (no suffix)
- **S3 Bucket**: `football-tournaments-prod-*`
- **Docker Image**: `football-tournaments-prod`

### Development Environment
- **Domain**: `dev.myfootballtournament.com`
- **Port**: 3002
- **DynamoDB Tables**: `football-*-dev`
- **S3 Bucket**: `football-tournaments-dev-*`
- **Docker Image**: `football-tournaments-dev`

## 📊 Monitoring and Maintenance

### Check Application Status
```bash
# Check running containers
docker ps

# View application logs
docker logs football-tournaments-prod
docker logs football-tournaments-dev

# Check Nginx status
sudo systemctl status nginx
```

### Update Applications
```bash
# Build new images locally
docker build -t football-tournaments-prod .
docker build -t football-tournaments-dev .

# Copy to EC2 and restart
# (Follow the same process as initial deployment)
```

### Renew SSL Certificates
```bash
# Automatic renewal (set up cron job)
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet

# Manual renewal
sudo certbot renew --nginx
```

## 🆘 Troubleshooting

### Common Issues

1. **Domain not resolving**:
   - Check Route 53 DNS records
   - Verify domain registrar name servers
   - Wait for DNS propagation (5-10 minutes)

2. **SSL certificate issues**:
   - Check certificate validation in AWS Certificate Manager
   - Verify DNS validation records
   - Ensure domain is accessible via HTTP

3. **Application not accessible**:
   - Check security group settings
   - Verify Nginx configuration
   - Check Docker container status

4. **Environment mixing**:
   - Verify environment variables
   - Check DynamoDB table names
   - Ensure correct Docker images are running

### Useful Commands

```bash
# Check DNS resolution
nslookup myfootballtournament.com
nslookup dev.myfootballtournament.com

# Test SSL certificates
curl -I https://myfootballtournament.com
curl -I https://dev.myfootballtournament.com

# Check Route 53 records
aws route53 list-resource-record-sets --hosted-zone-id YOUR_HOSTED_ZONE_ID

# View Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

## 💰 Cost Estimation

- **EC2 t3.micro (2 instances)**: ~$17/month
- **DynamoDB**: ~$2-10/month (depending on usage)
- **S3**: ~$2-6/month (depending on storage)
- **Route 53**: ~$0.50/month per hosted zone
- **SSL Certificates**: Free (Let's Encrypt)
- **Total**: ~$20-35/month

## 🎉 Success!

Once deployed, your Football Tournaments app will be:
- ✅ Running on custom domains
- ✅ Secured with SSL certificates
- ✅ Using separate environments for prod and dev
- ✅ Scalable and reliable
- ✅ Professionally hosted

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review AWS CloudWatch logs
3. Check Docker container logs
4. Verify AWS service status
5. Check Nginx configuration and logs

Happy deploying with your custom domain! 🚀⚽🏆🌐
