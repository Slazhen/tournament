#!/bin/bash

# Deploy from GitHub Script
# This script pulls the latest code from GitHub and deploys it

set -e

# Configuration
GITHUB_REPO="https://github.com/Slazhen/tournament.git"
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

# Function to deploy from GitHub
deploy_from_github() {
    local ENV=$1
    local DOMAIN_NAME=$2
    
    echo ""
    echo "🚀 Deploying $ENV environment from GitHub"
    echo "=========================================="
    
    # Create deployment directory
    DEPLOY_DIR="/home/ec2-user/football-tournaments-${ENV}"
    mkdir -p $DEPLOY_DIR
    cd $DEPLOY_DIR
    
    # Clone or pull latest code
    if [ -d ".git" ]; then
        print_info "Pulling latest changes from GitHub..."
        git pull origin main
    else
        print_info "Cloning repository from GitHub..."
        git clone $GITHUB_REPO .
    fi
    
    # Make scripts executable
    chmod +x *.sh
    
    # Build Docker image
    print_info "Building Docker image for $ENV..."
    docker build -t "${APP_NAME}-${ENV}:latest" .
    
    # Stop existing container
    print_info "Stopping existing container..."
    docker-compose down || true
    
    # Start new container
    print_info "Starting new container..."
    docker-compose up -d
    
    # Wait for container to be healthy
    print_info "Waiting for application to start..."
    sleep 30
    
    # Check if running
    if docker ps | grep -q "${APP_NAME}-${ENV}"; then
        print_status "$ENV environment deployed successfully!"
        print_info "Access your app at: https://$DOMAIN_NAME"
        
        # Test SSL certificate
        if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN_NAME | grep -q "200"; then
            print_status "SSL certificate is working!"
        else
            print_warning "SSL certificate might need renewal"
        fi
    else
        print_error "$ENV environment failed to start"
        docker logs "${APP_NAME}-${ENV}"
        exit 1
    fi
}

# Function to setup GitHub deployment
setup_github_deployment() {
    echo ""
    echo "🔧 Setting up GitHub deployment"
    echo "==============================="
    
    # Install Git if not already installed
    if ! command -v git &> /dev/null; then
        print_info "Installing Git..."
        sudo yum install -y git
    fi
    
    # Install Docker if not already installed
    if ! command -v docker &> /dev/null; then
        print_info "Installing Docker..."
        sudo yum install -y docker
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -a -G docker ec2-user
    fi
    
    # Install Docker Compose if not already installed
    if ! command -v docker-compose &> /dev/null; then
        print_info "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    fi
    
    # Create deployment script
    print_info "Creating deployment script..."
    cat > /home/ec2-user/deploy-from-github.sh << 'EOF'
#!/bin/bash

# Auto-deployment script
cd /home/ec2-user/football-tournaments-prod
git pull origin main
docker-compose down
docker-compose up -d

cd /home/ec2-user/football-tournaments-dev
git pull origin main
docker-compose down
docker-compose up -d

echo "Deployment completed at $(date)"
EOF
    
    chmod +x /home/ec2-user/deploy-from-github.sh
    
    # Create cron job for automatic deployment
    print_info "Setting up automatic deployment..."
    (crontab -l 2>/dev/null; echo "0 2 * * * /home/ec2-user/deploy-from-github.sh >> /home/ec2-user/deployment.log 2>&1") | crontab -
    
    print_status "GitHub deployment setup complete!"
}

# Main function
main() {
    echo "🚀 GitHub Deployment for Football Tournaments App"
    echo "================================================="
    echo "Repository: $GITHUB_REPO"
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
    
    # Ask what to do
    echo ""
    echo "What would you like to do?"
    echo "1) Setup GitHub deployment (first time)"
    echo "2) Deploy production environment"
    echo "3) Deploy development environment"
    echo "4) Deploy both environments"
    read -p "Enter your choice (1-4): " choice
    
    case $choice in
        1)
            setup_github_deployment
            ;;
        2)
            deploy_from_github "prod" "myfootballtournament.com"
            ;;
        3)
            deploy_from_github "dev" "dev.myfootballtournament.com"
            ;;
        4)
            deploy_from_github "prod" "myfootballtournament.com"
            deploy_from_github "dev" "dev.myfootballtournament.com"
            ;;
        *)
            print_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
    
    echo ""
    echo "🎉 GitHub deployment complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Your code is now deployed from GitHub"
    echo "2. Future changes can be deployed by pushing to GitHub"
    echo "3. Automatic deployment runs daily at 2 AM"
    echo "4. Manual deployment: ./deploy-from-github.sh"
    echo ""
    echo "🌐 Your applications:"
    echo "- Production: https://myfootballtournament.com"
    echo "- Development: https://dev.myfootballtournament.com"
}

# Run main function
main "$@"
