#!/bin/bash

# Manual Deployment Script for MFTournament
# Run this script on your EC2 instance

echo "🚀 Starting MFTournament Deployment"
echo "=================================="

# Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Install Nginx
echo "🌐 Installing Nginx..."
sudo yum install -y nginx

# Start and enable Nginx
echo "▶️ Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Node.js and npm
echo "📦 Installing Node.js..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Git
echo "📦 Installing Git..."
sudo yum install -y git

# Clone the repository
echo "📥 Cloning repository..."
if [ -d "/home/ec2-user/football-tournaments" ]; then
    cd /home/ec2-user/football-tournaments
    git pull origin main
else
    git clone https://github.com/Slazhen/tournament.git /home/ec2-user/football-tournaments
    cd /home/ec2-user/football-tournaments
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build the application
echo "🔨 Building application..."
npm run build

# Configure Nginx
echo "⚙️ Configuring Nginx..."
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
echo "🔐 Setting permissions..."
sudo chown -R ec2-user:ec2-user /home/ec2-user/football-tournaments
sudo chmod -R 755 /home/ec2-user/football-tournaments

# Configure firewall
echo "🔥 Configuring firewall..."
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Restart Nginx
echo "🔄 Restarting Nginx..."
sudo systemctl restart nginx

# Install Certbot for SSL
echo "🔒 Installing Certbot..."
sudo yum install -y certbot python3-certbot-nginx

echo "✅ Deployment completed successfully!"
echo ""
echo "🌐 Your site should now be accessible!"
echo "📋 Next steps:"
echo "1. Test your site at the instance IP"
echo "2. Set up SSL certificate with: sudo certbot --nginx -d your-domain.com"
echo "3. Configure your domain DNS if needed"
