# 🚀 Manual EC2 Deployment Guide

## 📋 Current Setup

You now have **2 EC2 instances**:
- **Production**: `i-03a2402ec98975a44` (IP: 54.81.249.95)
- **Development**: `i-0ed8af072c464ddf7` (IP: 18.212.116.211)

## 🔧 Step 1: Connect to Your EC2 Instances

### Option A: AWS Console (Recommended)
1. Go to [AWS EC2 Console](https://console.aws.amazon.com/ec2/)
2. Find your instances:
   - Production: `football-tournaments-prod`
   - Development: `football-tournaments-dev`
3. Select an instance → **Connect** → **EC2 Instance Connect**
4. Click **Connect**

### Option B: SSH (if you have the key)
```bash
ssh -i football-tournaments-key.pem ec2-user@54.81.249.95  # Production
ssh -i football-tournaments-key.pem ec2-user@18.212.116.211  # Development
```

## 🛠️ Step 2: Install Nginx and Dependencies

Run these commands **on both instances**:

```bash
# Update system
sudo yum update -y

# Install Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Node.js 18 (remove old versions first)
sudo yum remove -y nodejs npm || true
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify Node.js version (should be 18+)
node --version
npm --version

# Install Git
sudo yum install -y git

# Configure firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Test Nginx
curl http://localhost
```

## 📦 Step 3: Deploy Your Application

Run these commands **on both instances**:

```bash
# Clone your repository
git clone https://github.com/Slazhen/tournament.git /home/ec2-user/football-tournaments
cd /home/ec2-user/football-tournaments

# Install dependencies (with compatibility flags)
npm ci --legacy-peer-deps

# Set Node.js compatibility options
export NODE_OPTIONS="--openssl-legacy-provider"

# Build the application
npm run build

# Configure Nginx for React app
sudo tee /etc/nginx/conf.d/football-tournaments.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    root /home/ec2-user/football-tournaments/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

# Set proper permissions
sudo chown -R ec2-user:ec2-user /home/ec2-user/football-tournaments
sudo chmod -R 755 /home/ec2-user/football-tournaments

# Restart Nginx
sudo systemctl restart nginx

# Test the deployment
curl http://localhost
```

## 🔒 Step 4: Set Up SSL Certificates

Run these commands **on both instances**:

```bash
# Install Certbot
sudo yum install -y certbot python3-certbot-nginx

# For Production (myfootballtournament.com)
sudo certbot --nginx -d myfootballtournament.com --non-interactive --agree-tos --email admin@myfootballtournament.com

# For Development (dev.myfootballtournament.com)
sudo certbot --nginx -d dev.myfootballtournament.com --non-interactive --agree-tos --email admin@myfootballtournament.com
```

## 🌐 Step 5: Update DNS Records (if needed)

If you want to use the new IPs, update your DNS records:

```bash
# Update DNS A records
aws route53 change-resource-record-sets \
    --hosted-zone-id YOUR_HOSTED_ZONE_ID \
    --change-batch '{
        "Comment": "Update A records",
        "Changes": [
            {
                "Action": "UPSERT",
                "ResourceRecordSet": {
                    "Name": "myfootballtournament.com",
                    "Type": "A",
                    "TTL": 300,
                    "ResourceRecords": [{"Value": "54.81.249.95"}]
                }
            },
            {
                "Action": "UPSERT",
                "ResourceRecordSet": {
                    "Name": "dev.myfootballtournament.com",
                    "Type": "A",
                    "TTL": 300,
                    "ResourceRecords": [{"Value": "18.212.116.211"}]
                }
            }
        ]
    }'
```

## 🔄 Step 6: Set Up Auto-Deployment from GitHub

Create a deployment script on each instance:

```bash
# Create deployment script
sudo tee /home/ec2-user/deploy.sh > /dev/null << 'EOF'
#!/bin/bash
cd /home/ec2-user/football-tournaments
git pull origin main
npm ci
npm run build
sudo systemctl restart nginx
echo "Deployment completed at $(date)"
EOF

# Make it executable
chmod +x /home/ec2-user/deploy.sh

# Test the deployment script
/home/ec2-user/deploy.sh
```

## 🎯 Step 7: Test Your Sites

After completing all steps, test your sites:

- **Production**: http://54.81.249.95 or https://myfootballtournament.com
- **Development**: http://18.212.116.211 or https://dev.myfootballtournament.com

## 📝 Quick Commands Reference

### Check Nginx Status
```bash
sudo systemctl status nginx
```

### View Nginx Logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Restart Nginx
```bash
sudo systemctl restart nginx
```

### Check SSL Certificate
```bash
sudo certbot certificates
```

### Renew SSL Certificate
```bash
sudo certbot renew
```

## 🚨 Troubleshooting

### If you get "crypto.getRandomValues is not a function" error:
```bash
# Set Node.js compatibility options
export NODE_OPTIONS="--openssl-legacy-provider"

# Clean and rebuild
rm -rf node_modules package-lock.json dist
npm cache clean --force
npm ci --legacy-peer-deps
npm run build
```

### If Nginx won't start:
```bash
sudo nginx -t  # Test configuration
sudo systemctl status nginx  # Check status
```

### If build fails:
```bash
node --version  # Should be v18+
npm --version   # Should be v9+

# If Node.js is too old, reinstall:
sudo yum remove -y nodejs npm
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### If SSL fails:
```bash
sudo certbot --nginx -d your-domain.com --dry-run  # Test without applying
```

## ✅ Success Checklist

- [ ] Nginx is running and accessible
- [ ] React app builds successfully
- [ ] Application is accessible via IP
- [ ] SSL certificates are installed
- [ ] Domains are working
- [ ] Auto-deployment script works

## 🎉 You're Done!

Your MFTournament application should now be live and accessible!
