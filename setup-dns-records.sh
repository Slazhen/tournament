#!/bin/bash

# --- Configuration ---
AWS_REGION="us-east-1"
HOSTED_ZONE_ID="Z09871352GNI3VQS0BAXF"
PROD_IP="54.81.249.95"
DEV_IP="18.212.116.211"

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
echo -e "\n🌐 Setting up DNS Records"
echo "========================="

# Function to create DNS record
create_dns_record() {
    local DOMAIN=$1
    local IP=$2
    local ENV=$3
    
    print_info "Creating DNS A record for $DOMAIN -> $IP"
    
    # Create the change batch
    cat > "dns-change-${ENV}.json" << EOF
{
    "Comment": "Create A record for $DOMAIN",
    "Changes": [
        {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "$DOMAIN",
                "Type": "A",
                "TTL": 300,
                "ResourceRecords": [
                    {
                        "Value": "$IP"
                    }
                ]
            }
        }
    ]
}
EOF

    # Apply the DNS change
    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch "file://dns-change-${ENV}.json" \
        --region $AWS_REGION || print_error "Failed to create DNS record for $DOMAIN"
    
    # Clean up
    rm -f "dns-change-${ENV}.json"
    
    print_status "DNS A record created for $DOMAIN"
}

# Create DNS records
create_dns_record "myfootballtournament.com" $PROD_IP "prod"
create_dns_record "dev.myfootballtournament.com" $DEV_IP "dev"

print_status "DNS records created successfully!"
print_info ""
print_info "🌐 Your domains will be available at:"
print_info "  Production: http://myfootballtournament.com"
print_info "  Development: http://dev.myfootballtournament.com"
print_info ""
print_info "⏰ DNS propagation may take 5-15 minutes"
print_info ""
print_info "📋 Next steps:"
print_info "1. Wait for DNS propagation"
print_info "2. Configure Nginx on EC2 instances"
print_info "3. Set up SSL certificates"
print_info "4. Deploy the React application"
