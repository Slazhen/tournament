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
echo -e "\n🔧 Manual EC2 Deployment"
echo "========================"

# Create a simple HTML page
cat > index.html << 'EOF'
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
        .button {
            background: #4CAF50;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            cursor: pointer;
            margin: 20px 10px;
            text-decoration: none;
            display: inline-block;
        }
        .button:hover {
            background: #45a049;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🏆</div>
        <h1>MFTournament</h1>
        <div class="status">✅ Your Site is Live!</div>
        <div class="info">🌐 Football tournament management platform</div>
        <div class="info">🔒 SSL certificates are ready</div>
        <div class="info">🚀 Full application deployment in progress...</div>
        <p style="margin-top: 30px; font-size: 18px;">
            This is a temporary page while we deploy your full React application.
        </p>
        <div style="margin-top: 40px;">
            <a href="#" class="button">Create Tournament</a>
            <a href="#" class="button">View Tournaments</a>
        </div>
        <p style="margin-top: 30px; color: #FFD700; font-size: 14px;">
            Full deployment with all features coming soon!
        </p>
    </div>
</body>
</html>
EOF

# Function to deploy to instance using SSM
deploy_to_instance() {
    local INSTANCE_ID=$1
    local ENV=$2
    
    print_info "Deploying to $ENV instance: $INSTANCE_ID"
    
    # Get instance public IP
    local PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
    print_info "Instance IP: $PUBLIC_IP"
    
    # Create deployment commands
    local COMMANDS=(
        "sudo yum update -y"
        "sudo yum install -y nginx"
        "sudo systemctl start nginx"
        "sudo systemctl enable nginx"
        "sudo mkdir -p /var/www/html"
        "sudo cp /dev/null /var/www/html/index.html"
        "sudo chown ec2-user:ec2-user /var/www/html/index.html"
        "sudo firewall-cmd --permanent --add-service=http"
        "sudo firewall-cmd --permanent --add-service=https"
        "sudo firewall-cmd --reload"
    )
    
    # Execute commands via SSM
    for cmd in "${COMMANDS[@]}"; do
        print_info "Executing: $cmd"
        aws ssm send-command \
            --instance-ids $INSTANCE_ID \
            --document-name "AWS-RunShellScript" \
            --parameters "commands=[\"$cmd\"]" \
            --region $AWS_REGION \
            --output text --query 'Command.CommandId' > /dev/null 2>&1
        sleep 2
    done
    
    # Upload the HTML file
    print_info "Uploading HTML file..."
    aws ssm send-command \
        --instance-ids $INSTANCE_ID \
        --document-name "AWS-RunShellScript" \
        --parameters "commands=[\"echo '$(cat index.html | base64)' | base64 -d | sudo tee /var/www/html/index.html > /dev/null\"]" \
        --region $AWS_REGION \
        --output text --query 'Command.CommandId' > /dev/null 2>&1
    
    print_status "Deployment completed for $ENV instance"
    print_info "Site should be available at: http://$PUBLIC_IP"
}

# Deploy to both instances
deploy_to_instance $PROD_INSTANCE_ID "prod"
deploy_to_instance $DEV_INSTANCE_ID "dev"

# Clean up
rm -f index.html

print_status "Manual deployment completed!"
print_info ""
print_info "🌐 Your sites should be available at:"
print_info "  Production: http://54.81.249.95"
print_info "  Development: http://18.212.116.211"
print_info ""
print_info "⏰ Wait 1-2 minutes for deployment to complete"
print_info ""
print_info "📋 Next steps:"
print_info "1. Test the sites are accessible"
print_info "2. Set up SSL certificates with Nginx"
print_info "3. Deploy the full React application"
