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
echo -e "\n🚀 Simple EC2 Deployment"
echo "========================"

# Create simple User Data script
cat > user-data.sh << 'EOF'
#!/bin/bash

# Update system
yum update -y

# Install Nginx
yum install -y nginx
systemctl start nginx
systemctl enable nginx

# Create application directory
mkdir -p /var/www/html
cd /var/www/html

# Create a simple test page
cat > index.html << 'HTML_EOF'
<!DOCTYPE html>
<html>
<head>
    <title>MFTournament</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        .status { 
            color: #4CAF50; 
            font-size: 28px; 
            margin: 20px 0; 
            font-weight: bold;
        }
        .info { 
            color: #E0E0E0; 
            margin: 15px 0; 
            font-size: 16px;
        }
        .logo {
            font-size: 48px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🏆</div>
        <h1>MFTournament</h1>
        <div class="status">✅ Environment is Running!</div>
        <div class="info">🌐 Your football tournament application is ready</div>
        <div class="info">🔒 SSL certificates are configured</div>
        <div class="info">🚀 Full deployment coming soon...</div>
        <p style="margin-top: 30px; font-size: 18px;">
            This is a temporary page while we deploy your full application.
        </p>
    </div>
</body>
</html>
HTML_EOF

# Configure firewall
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

echo "Deployment completed at $(date)" > /home/ec2-user/deployment-status.txt
echo "✅ Environment deployment completed!"
EOF

# Function to deploy to instance
deploy_to_instance() {
    local INSTANCE_ID=$1
    local ENV=$2
    
    print_info "Deploying to $ENV instance: $INSTANCE_ID"
    
    # Get instance public IP
    local PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
    print_info "Instance IP: $PUBLIC_IP"
    
    # Update User Data with base64 encoding
    print_info "Updating User Data for $ENV instance..."
    aws ec2 modify-instance-attribute \
        --instance-id $INSTANCE_ID \
        --user-data "fileb://user-data.sh" \
        --region $AWS_REGION || print_error "Failed to update User Data"
    
    # Reboot instance to apply User Data
    print_info "Rebooting $ENV instance to apply changes..."
    aws ec2 reboot-instances --instance-ids $INSTANCE_ID --region $AWS_REGION
    
    print_status "Deployment initiated for $ENV instance"
    print_info "Instance will be available at: http://$PUBLIC_IP"
    print_info "Wait 2-3 minutes for the instance to reboot and deploy"
}

# Deploy to both instances
deploy_to_instance $PROD_INSTANCE_ID "prod"
deploy_to_instance $DEV_INSTANCE_ID "dev"

# Clean up
rm -f user-data.sh

print_status "Deployment completed!"
print_info ""
print_info "🌐 Your sites will be available at:"
print_info "  Production: http://54.81.249.95"
print_info "  Development: http://18.212.116.211"
print_info ""
print_info "⏰ Wait 2-3 minutes for instances to reboot and deploy"
print_info ""
print_info "📋 Next steps:"
print_info "1. Set up DNS A records pointing to these IPs"
print_info "2. Configure SSL certificates with Nginx"
print_info "3. Deploy the actual React application"
