#!/bin/bash

# 🚀 SIMPLE EC2 Deployment Script
# Run this script on your EC2 instance

echo "🚀 Starting MFTournament deployment..."

# Update system
echo "📦 Updating system..."
sudo yum update -y

# Install Node.js 18
echo "📦 Installing Node.js 18..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Nginx
echo "🌐 Installing Nginx..."
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Git
echo "📦 Installing Git..."
sudo yum install -y git

# Clone your app
echo "📥 Cloning MFTournament..."
if [ -d "/var/www/html/app" ]; then
    cd /var/www/html/app
    git pull origin main
else
    git clone https://github.com/Slazhen/tournament.git /var/www/html/app
    cd /var/www/html/app
fi

# Install dependencies and build
echo "🔨 Building application..."
npm ci
npm run build

# Configure Nginx
echo "⚙️ Configuring Nginx..."
sudo tee /etc/nginx/conf.d/mftournament.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/html/app/dist;
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

# Set permissions
echo "🔐 Setting permissions..."
sudo chown -R ec2-user:ec2-user /var/www/html/app
sudo chmod -R 755 /var/www/html/app

# Restart Nginx
echo "🔄 Restarting Nginx..."
sudo systemctl restart nginx

# Configure firewall
echo "🔥 Configuring firewall..."
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Test deployment
echo "🧪 Testing deployment..."
if curl -s http://localhost > /dev/null; then
    echo "🎉 Deployment successful!"
    echo "✅ Your MFTournament app is now live!"
    echo "🌐 Access it at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
else
    echo "❌ Deployment test failed, but setup completed"
fi

echo "📋 Next steps:"
echo "1. Test your app is accessible"
echo "2. Add your SSL certificate to /etc/ssl/"
echo "3. Update Nginx config for HTTPS"
echo "4. Point your domain to this server's IP"
