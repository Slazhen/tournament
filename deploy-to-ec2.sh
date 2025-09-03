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
echo -e "\n🚀 Deploying Applications to EC2 Instances"
echo "============================================="

# Function to deploy to an instance
deploy_to_instance() {
    local INSTANCE_ID=$1
    local ENV=$2
    local DOMAIN=$3
    
    print_info "Deploying to $ENV instance: $INSTANCE_ID"
    
    # Get instance public IP
    local PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
    print_info "Instance IP: $PUBLIC_IP"
    
    # Create deployment script
    cat > "deploy-${ENV}.sh" << EOF
#!/bin/bash

# Update system
sudo yum update -y

# Install Docker
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo yum install -y git

# Clone repository (you'll need to make this public or use a different method)
# For now, we'll create a simple deployment
mkdir -p /home/ec2-user/football-tournaments
cd /home/ec2-user/football-tournaments

# Create a simple HTML page for testing
cat > index.html << 'HTML_EOF'
<!DOCTYPE html>
<html>
<head>
    <title>MFTournament - $ENV</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .container { max-width: 600px; margin: 0 auto; }
        .status { color: #28a745; font-size: 24px; margin: 20px 0; }
        .info { color: #666; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏆 MFTournament</h1>
        <div class="status">✅ $ENV Environment is Running!</div>
        <div class="info">Domain: $DOMAIN</div>
        <div class="info">Instance: $INSTANCE_ID</div>
        <div class="info">IP: $PUBLIC_IP</div>
        <p>Your football tournament application is being deployed...</p>
    </div>
</body>
</html>
HTML_EOF

# Install and configure Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Configure Nginx
sudo tee /etc/nginx/conf.d/football-tournaments.conf > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name $DOMAIN;
    root /home/ec2-user/football-tournaments;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
    }
}
NGINX_EOF

# Restart Nginx
sudo systemctl restart nginx

# Configure firewall
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

echo "Deployment completed for $ENV environment!"
EOF

    # Execute the deployment script on the instance
    print_info "Executing deployment script on $ENV instance..."
    aws ssm send-command \
        --instance-ids $INSTANCE_ID \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["bash -s"]' \
        --cli-input-json "{\"commands\":[\"$(cat deploy-${ENV}.sh | base64 -w 0 | sed 's/^/echo /' | sed 's/$/ | base64 -d | bash/']}" \
        --region $AWS_REGION \
        --output text --query 'Command.CommandId' || {
        print_warning "SSM command failed, trying alternative method..."
        
        # Alternative: Use EC2 User Data
        print_info "Using EC2 User Data to deploy..."
        aws ec2 modify-instance-attribute \
            --instance-id $INSTANCE_ID \
            --user-data "file://deploy-${ENV}.sh" \
            --region $AWS_REGION || print_error "Failed to update User Data"
    }
    
    # Clean up
    rm -f "deploy-${ENV}.sh"
    
    print_status "Deployment initiated for $ENV instance"
    print_info "You can check the status at: http://$PUBLIC_IP"
}

# Deploy to both instances
deploy_to_instance $PROD_INSTANCE_ID "prod" "myfootballtournament.com"
deploy_to_instance $DEV_INSTANCE_ID "dev" "dev.myfootballtournament.com"

print_status "Deployment completed!"
print_info "Check your instances:"
print_info "  Production: http://54.81.249.95"
print_info "  Development: http://18.212.116.211"
print_info ""
print_info "Next steps:"
print_info "1. Set up DNS A records pointing to these IPs"
print_info "2. Configure SSL certificates with Nginx"
print_info "3. Deploy the actual React application"
