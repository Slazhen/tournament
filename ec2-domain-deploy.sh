#!/bin/bash

# EC2 Domain Deployment Script
# Deploys Football Tournaments App with custom domain support
# Supports both production and development environments

set -e

# Configuration
DOMAIN="myfootballtournament.com"
DEV_DOMAIN="dev.myfootballtournament.com"
APP_NAME="football-tournaments"
AWS_REGION="us-east-1"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to setup EC2 for domain deployment
setup_ec2_domain() {
    local ENV=$1
    local DOMAIN_NAME=$2
    local PORT=$3
    
    echo ""
    echo "🚀 Setting up EC2 for $ENV environment ($DOMAIN_NAME)"
    echo "====================================================="
    
    # Update system
    print_status "Updating system packages..."
    sudo yum update -y
    
    # Install Docker
    print_status "Installing Docker..."
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -a -G docker ec2-user
    
    # Install AWS CLI v2
    print_status "Installing AWS CLI..."
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
    rm -rf aws awscliv2.zip
    
    # Install Git
    print_status "Installing Git..."
    sudo yum install -y git
    
    # Install Node.js
    print_status "Installing Node.js..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 18
    nvm use 18
    
    # Install Nginx for reverse proxy and SSL termination
    print_status "Installing Nginx..."
    sudo yum install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    # Install Certbot for SSL certificates
    print_status "Installing Certbot..."
    sudo yum install -y certbot python3-certbot-nginx
    
    # Create application directory
    print_status "Setting up application directory..."
    mkdir -p /home/ec2-user/football-tournaments-${ENV}
    cd /home/ec2-user/football-tournaments-${ENV}
    
    # Create Nginx configuration
    print_status "Creating Nginx configuration for $DOMAIN_NAME..."
    sudo tee /etc/nginx/conf.d/football-tournaments-${ENV}.conf > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;
    
    # SSL configuration (will be updated by Certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Proxy to React app
    location / {
        proxy_pass http://localhost:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Handle React Router
        try_files \$uri \$uri/ /index.html;
    }
    
    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://localhost:${PORT};
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # Create environment-specific Docker Compose file
    print_status "Creating Docker Compose configuration for $ENV..."
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  football-tournaments-${ENV}:
    image: ${APP_NAME}-${ENV}:latest
    container_name: ${APP_NAME}-${ENV}
    ports:
      - "${PORT}:3000"
    environment:
      - REACT_APP_AWS_REGION=$AWS_REGION
      - REACT_APP_TOURNAMENTS_TABLE=football-tournaments${ENV == "prod" ? "" : "-dev"}
      - REACT_APP_TEAMS_TABLE=football-teams${ENV == "prod" ? "" : "-dev"}
      - REACT_APP_PLAYERS_TABLE=football-players${ENV == "prod" ? "" : "-dev"}
      - REACT_APP_MATCHES_TABLE=football-matches${ENV == "prod" ? "" : "-dev"}
      - REACT_APP_ORGANIZERS_TABLE=football-organizers${ENV == "prod" ? "" : "-dev"}
      - REACT_APP_S3_BUCKET=football-tournaments-${ENV}
      - REACT_APP_ENVIRONMENT=$ENV
      - REACT_APP_DOMAIN=$DOMAIN_NAME
      - NODE_ENV=production
    restart: unless-stopped
    volumes:
      - /home/ec2-user/.aws:/root/.aws:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
    
    # Create deployment script
    print_status "Creating deployment script for $ENV..."
    cat > deploy.sh << EOF
#!/bin/bash

echo "🚀 Deploying Football Tournaments App ($ENV environment)..."

# Stop existing container
docker-compose down || true

# Pull latest image (if using ECR)
# docker pull your-account-id.dkr.ecr.us-east-1.amazonaws.com/${APP_NAME}-${ENV}:latest

# Start new container
docker-compose up -d

# Wait for container to be healthy
echo "⏳ Waiting for application to start..."
sleep 30

# Check if running
if docker ps | grep -q ${APP_NAME}-${ENV}; then
    echo "✅ App is running successfully!"
    echo "🌐 Access your app at: https://$DOMAIN_NAME"
    
    # Test SSL certificate
    if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN_NAME | grep -q "200"; then
        echo "🔒 SSL certificate is working!"
    else
        echo "⚠️  SSL certificate might need renewal"
    fi
else
    echo "❌ App failed to start"
    docker logs ${APP_NAME}-${ENV}
    exit 1
fi
EOF
    
    chmod +x deploy.sh
    
    # Create SSL certificate renewal script
    print_status "Creating SSL certificate renewal script..."
    cat > renew-ssl.sh << EOF
#!/bin/bash

echo "🔒 Renewing SSL certificate for $DOMAIN_NAME..."

# Renew certificate
sudo certbot renew --nginx -d $DOMAIN_NAME --non-interactive --agree-tos

# Reload Nginx
sudo systemctl reload nginx

echo "✅ SSL certificate renewed successfully!"
EOF
    
    chmod +x renew-ssl.sh
    
    # Create systemd service for auto-start
    print_status "Creating systemd service for $ENV..."
    sudo tee /etc/systemd/system/football-tournaments-${ENV}.service > /dev/null << EOF
[Unit]
Description=Football Tournaments App ($ENV)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/football-tournaments-${ENV}
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    
    # Install Docker Compose
    print_status "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    # Reload systemd
    sudo systemctl daemon-reload
    sudo systemctl enable football-tournaments-${ENV}
    
    # Test Nginx configuration
    sudo nginx -t
    
    print_status "EC2 setup complete for $ENV environment!"
    
    echo ""
    echo "📋 Next steps for $ENV environment:"
    echo "1. Copy your Docker image: ${APP_NAME}-${ENV}"
    echo "2. Configure AWS credentials: aws configure"
    echo "3. Get SSL certificate: sudo certbot --nginx -d $DOMAIN_NAME"
    echo "4. Deploy app: ./deploy.sh"
    echo ""
    echo "🔧 Useful commands:"
    echo "- Deploy: ./deploy.sh"
    echo "- Renew SSL: ./renew-ssl.sh"
    echo "- View logs: docker logs ${APP_NAME}-${ENV}"
    echo "- Restart: docker-compose restart"
    echo "- Stop: docker-compose down"
}

# Main function
main() {
    echo "🚀 Football Tournaments EC2 Domain Deployment"
    echo "=============================================="
    echo "Production Domain: $DOMAIN (Port 3001)"
    echo "Development Domain: $DEV_DOMAIN (Port 3002)"
    echo ""
    
    # Check if we're on EC2
    if ! curl -s http://169.254.169.254/latest/meta-data/instance-id > /dev/null; then
        print_error "This script must be run on an EC2 instance"
        exit 1
    fi
    
    # Get instance metadata
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
    
    print_info "EC2 Instance ID: $INSTANCE_ID"
    print_info "Public IP: $PUBLIC_IP"
    
    # Ask which environment to setup
    echo ""
    echo "Which environment would you like to setup?"
    echo "1) Production ($DOMAIN)"
    echo "2) Development ($DEV_DOMAIN)"
    echo "3) Both"
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            setup_ec2_domain "prod" $DOMAIN "3001"
            ;;
        2)
            setup_ec2_domain "dev" $DEV_DOMAIN "3002"
            ;;
        3)
            setup_ec2_domain "prod" $DOMAIN "3001"
            setup_ec2_domain "dev" $DEV_DOMAIN "3002"
            ;;
        *)
            print_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
    
    echo ""
    echo "🎉 EC2 domain deployment setup complete!"
    echo ""
    echo "📋 Final steps:"
    echo "1. Update Route 53 DNS records to point to this EC2 instance"
    echo "2. Get SSL certificates using Certbot"
    echo "3. Deploy your applications"
    echo ""
    echo "🌐 Your domains will be available at:"
    echo "- Production: https://$DOMAIN"
    echo "- Development: https://$DEV_DOMAIN"
}

# Run main function
main "$@"
