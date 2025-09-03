#!/bin/bash

# --- Configuration ---
AWS_REGION="us-east-1"
PROD_INSTANCE_ID="i-03a2402ec98975a44"
DEV_INSTANCE_ID="i-0ed8af072c464ddf7"

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
echo -e "\n🚀 Running GitHub Deployment on EC2"
echo "===================================="

# Function to run deployment on instance
deploy_to_instance() {
    local INSTANCE_ID=$1
    local ENV=$2
    
    print_info "Deploying to $ENV instance: $INSTANCE_ID"
    
    # Get instance public IP
    local PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
    print_info "Instance IP: $PUBLIC_IP"
    
    # Create deployment script
    cat > "deploy-${ENV}-script.sh" << 'EOF'
#!/bin/bash

# Update system
sudo yum update -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    sudo yum install -y docker
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -a -G docker ec2-user
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    sudo yum install -y git
fi

# Install Node.js and npm
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
fi

# Clone or update repository
if [ -d "/home/ec2-user/football-tournaments" ]; then
    cd /home/ec2-user/football-tournaments
    git pull origin main
else
    git clone https://github.com/Slazhen/tournament.git /home/ec2-user/football-tournaments
    cd /home/ec2-user/football-tournaments
fi

# Install dependencies and build
npm ci
npm run build

# Install and configure Nginx
if ! command -v nginx &> /dev/null; then
    sudo yum install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
fi

# Configure Nginx
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
sudo chown -R ec2-user:ec2-user /home/ec2-user/football-tournaments
sudo chmod -R 755 /home/ec2-user/football-tournaments

# Configure firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Restart Nginx
sudo systemctl restart nginx

echo "✅ Deployment completed for $ENV environment!"
EOF

    # Upload and execute the script
    print_info "Uploading deployment script..."
    aws ssm send-command \
        --instance-ids $INSTANCE_ID \
        --document-name "AWS-RunShellScript" \
        --parameters "commands=[\"bash -s\"]" \
        --cli-input-json "{\"commands\":[\"$(cat deploy-${ENV}-script.sh | base64 -w 0 | sed 's/^/echo /' | sed 's/$/ | base64 -d | bash/']}" \
        --region $AWS_REGION \
        --output text --query 'Command.CommandId' > /dev/null 2>&1 || {
        print_warning "SSM command failed, trying alternative method..."
        
        # Alternative: Use EC2 User Data
        print_info "Using EC2 User Data to deploy..."
        aws ec2 modify-instance-attribute \
            --instance-id $INSTANCE_ID \
            --user-data "file://deploy-${ENV}-script.sh" \
            --region $AWS_REGION || print_error "Failed to update User Data"
        
        # Reboot instance to apply User Data
        print_info "Rebooting instance to apply changes..."
        aws ec2 reboot-instances --instance-ids $INSTANCE_ID --region $AWS_REGION
    }
    
    # Clean up
    rm -f "deploy-${ENV}-script.sh"
    
    print_status "Deployment initiated for $ENV instance"
    print_info "Site will be available at: http://$PUBLIC_IP"
    print_info "Wait 3-5 minutes for deployment to complete"
}

# Deploy to both instances
deploy_to_instance $PROD_INSTANCE_ID "prod"
deploy_to_instance $DEV_INSTANCE_ID "dev"

print_status "GitHub deployment completed!"
print_info ""
print_info "🌐 Your sites will be available at:"
print_info "  Production: http://54.81.249.95"
print_info "  Development: http://18.212.116.211"
print_info ""
print_info "⏰ Wait 3-5 minutes for deployment to complete"
print_info ""
print_info "📋 Next steps:"
print_info "1. Test the sites are accessible"
print_info "2. Set up SSL certificates with Certbot"
print_info "3. Configure custom domains"
