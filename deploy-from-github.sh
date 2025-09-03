#!/bin/bash

# --- Configuration ---
REPO_URL="https://github.com/Slazhen/tournament.git"
APP_DIR="/home/ec2-user/football-tournaments"
ENV=${1:-"prod"}  # Default to prod if no argument provided

# --- Helper Functions ---
print_info() {
    echo -e "\033[0;36mℹ️  $1\033[0m"
}

print_status() {
    echo -e "\033[0;32m✅ $1\033[0m"
}

print_warning() {
    echo -e "\033[0;33m⚠️  $1\033[0m"
}

print_error() {
    echo -e "\033[0;31m❌ $1\033[0m"
}

# --- Main Script ---
echo -e "\n🚀 Deploying from GitHub"
echo "========================"
print_info "Environment: $ENV"

# Update system
print_info "Updating system packages..."
sudo yum update -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    print_info "Installing Docker..."
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -a -G docker ec2-user
    print_status "Docker installed successfully"
else
    print_info "Docker is already installed"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    print_info "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_status "Docker Compose installed successfully"
else
    print_info "Docker Compose is already installed"
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    print_info "Installing Git..."
    sudo yum install -y git
    print_status "Git installed successfully"
else
    print_info "Git is already installed"
fi

# Install Node.js and npm
if ! command -v node &> /dev/null; then
    print_info "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
    print_status "Node.js installed successfully"
else
    print_info "Node.js is already installed"
fi

# Clone or update repository
if [ -d "$APP_DIR" ]; then
    print_info "Updating existing repository..."
    cd $APP_DIR
    git pull origin main
    print_status "Repository updated"
else
    print_info "Cloning repository..."
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
    print_status "Repository cloned"
fi

# Install dependencies and build
print_info "Installing dependencies..."
npm ci

print_info "Building application..."
npm run build

# Install and configure Nginx
if ! command -v nginx &> /dev/null; then
    print_info "Installing Nginx..."
    sudo yum install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    print_status "Nginx installed successfully"
else
    print_info "Nginx is already installed"
fi

# Configure Nginx
print_info "Configuring Nginx..."
sudo tee /etc/nginx/conf.d/football-tournaments.conf > /dev/null << 'NGINX_EOF'
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
NGINX_EOF

# Set proper permissions
sudo chown -R ec2-user:ec2-user $APP_DIR
sudo chmod -R 755 $APP_DIR

# Configure firewall
print_info "Configuring firewall..."
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Restart Nginx
print_info "Restarting Nginx..."
sudo systemctl restart nginx

# Install Certbot for SSL
if ! command -v certbot &> /dev/null; then
    print_info "Installing Certbot..."
    sudo yum install -y certbot python3-certbot-nginx
    print_status "Certbot installed successfully"
else
    print_info "Certbot is already installed"
fi

# Get SSL certificate based on environment
if [ "$ENV" = "prod" ]; then
    DOMAIN="myfootballtournament.com"
else
    DOMAIN="dev.myfootballtournament.com"
fi

print_info "Getting SSL certificate for $DOMAIN..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@myfootballtournament.com || print_warning "SSL certificate setup failed - will retry later"

print_status "Deployment completed successfully!"
print_info ""
print_info "🌐 Your site should be available at:"
if [ "$ENV" = "prod" ]; then
    print_info "  Production: https://myfootballtournament.com"
    print_info "  Fallback: http://myfootballtournament.com"
else
    print_info "  Development: https://dev.myfootballtournament.com"
    print_info "  Fallback: http://dev.myfootballtournament.com"
fi
print_info ""
print_info "📋 Next steps:"
print_info "1. Test your site accessibility"
print_info "2. Check SSL certificate status"
print_info "3. Configure any additional settings"