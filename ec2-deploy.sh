#!/bin/bash

# EC2 Deployment Script
# Run this script ON YOUR EC2 INSTANCE after launching it

set -e

echo "🚀 Deploying Football Tournaments App to EC2..."

# Configuration
APP_NAME="football-tournaments"
AWS_REGION="us-east-1"
S3_BUCKET="football-tournaments-images"  # Update this with your actual bucket name

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Install Node.js (for building if needed)
print_status "Installing Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 18
nvm use 18

# Create application directory
print_status "Setting up application directory..."
mkdir -p /home/ec2-user/football-tournaments
cd /home/ec2-user/football-tournaments

# Create environment file
print_status "Creating environment configuration..."
cat > .env.production << EOF
REACT_APP_AWS_REGION=$AWS_REGION
REACT_APP_TOURNAMENTS_TABLE=football-tournaments
REACT_APP_TEAMS_TABLE=football-teams
REACT_APP_PLAYERS_TABLE=football-players
REACT_APP_MATCHES_TABLE=football-matches
REACT_APP_ORGANIZERS_TABLE=football-organizers
REACT_APP_S3_BUCKET=$S3_BUCKET
NODE_ENV=production
EOF

# Create Docker Compose file for easy management
print_status "Creating Docker Compose configuration..."
cat > docker-compose.yml << EOF
version: '3.8'

services:
  football-tournaments:
    image: $APP_NAME:latest
    container_name: $APP_NAME
    ports:
      - "80:3000"
    environment:
      - REACT_APP_AWS_REGION=$AWS_REGION
      - REACT_APP_TOURNAMENTS_TABLE=football-tournaments
      - REACT_APP_TEAMS_TABLE=football-teams
      - REACT_APP_PLAYERS_TABLE=football-players
      - REACT_APP_MATCHES_TABLE=football-matches
      - REACT_APP_ORGANIZERS_TABLE=football-organizers
      - REACT_APP_S3_BUCKET=$S3_BUCKET
      - NODE_ENV=production
    restart: unless-stopped
    volumes:
      - /home/ec2-user/.aws:/root/.aws:ro
EOF

# Create deployment script
print_status "Creating deployment script..."
cat > deploy.sh << 'EOF'
#!/bin/bash

APP_NAME="football-tournaments"

echo "🚀 Deploying Football Tournaments App..."

# Stop existing container
docker stop $APP_NAME 2>/dev/null || true
docker rm $APP_NAME 2>/dev/null || true

# Pull latest image (if using ECR)
# docker pull your-account-id.dkr.ecr.us-east-1.amazonaws.com/$APP_NAME:latest

# Start new container
docker-compose up -d

# Check if running
if docker ps | grep -q $APP_NAME; then
    echo "✅ App is running successfully!"
    echo "🌐 Access your app at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
else
    echo "❌ App failed to start"
    docker logs $APP_NAME
fi
EOF

chmod +x deploy.sh

# Create systemd service for auto-start
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/football-tournaments.service > /dev/null << EOF
[Unit]
Description=Football Tournaments App
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/football-tournaments
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
sudo systemctl enable football-tournaments

print_status "EC2 setup complete!"

echo ""
echo "📋 Next steps:"
echo "1. Copy your Docker image to this EC2 instance"
echo "2. Configure AWS credentials: aws configure"
echo "3. Run: ./deploy.sh"
echo ""
echo "💡 To check status: docker ps"
echo "💡 To view logs: docker logs $APP_NAME"
echo "💡 To restart: ./deploy.sh"
echo ""
echo "🔧 Manual deployment commands:"
echo "docker-compose up -d"
echo "docker-compose down"
echo "docker-compose logs"
