#!/bin/bash

# Route 53 DNS Setup Script for Football Tournaments App
# Sets up DNS records for both production and development domains

set -e

# Configuration
DOMAIN="myfootballtournament.com"
DEV_DOMAIN="dev.myfootballtournament.com"
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

# Function to get EC2 instance IP
get_ec2_ip() {
    local INSTANCE_NAME=$1
    local IP=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running" \
        --query "Reservations[0].Instances[0].PublicIpAddress" \
        --output text \
        --region $AWS_REGION)
    
    if [ "$IP" = "None" ] || [ -z "$IP" ]; then
        print_error "Could not find running EC2 instance with name: $INSTANCE_NAME"
        return 1
    fi
    
    echo $IP
}

# Function to create DNS records
create_dns_records() {
    local DOMAIN_NAME=$1
    local EC2_IP=$2
    local RECORD_TYPE=${3:-"A"}
    
    echo ""
    echo "🌐 Creating DNS records for $DOMAIN_NAME"
    echo "========================================"
    
    # Get hosted zone ID
    HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text | cut -d'/' -f3)
    
    if [ -z "$HOSTED_ZONE_ID" ]; then
        print_error "Hosted zone for $DOMAIN not found. Please run deploy-domain.sh first."
        return 1
    fi
    
    print_info "Hosted Zone ID: $HOSTED_ZONE_ID"
    print_info "EC2 IP: $EC2_IP"
    
    # Create A record
    print_info "Creating A record for $DOMAIN_NAME..."
    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch "{
            \"Changes\": [{
                \"Action\": \"UPSERT\",
                \"ResourceRecordSet\": {
                    \"Name\": \"$DOMAIN_NAME\",
                    \"Type\": \"$RECORD_TYPE\",
                    \"TTL\": 300,
                    \"ResourceRecords\": [{\"Value\": \"$EC2_IP\"}]
                }
            }]
        }" > /dev/null
    
    # Create www subdomain (for production only)
    if [ "$DOMAIN_NAME" = "$DOMAIN" ]; then
        print_info "Creating www subdomain record..."
        aws route53 change-resource-record-sets \
            --hosted-zone-id $HOSTED_ZONE_ID \
            --change-batch "{
                \"Changes\": [{
                    \"Action\": \"UPSERT\",
                    \"ResourceRecordSet\": {
                        \"Name\": \"www.$DOMAIN\",
                        \"Type\": \"$RECORD_TYPE\",
                        \"TTL\": 300,
                        \"ResourceRecords\": [{\"Value\": \"$EC2_IP\"}]
                    }
                }]
            }" > /dev/null
    fi
    
    print_status "DNS records created for $DOMAIN_NAME"
}

# Function to setup SSL certificate validation
setup_ssl_validation() {
    local DOMAIN_NAME=$1
    
    echo ""
    echo "🔒 Setting up SSL certificate validation for $DOMAIN_NAME"
    echo "========================================================"
    
    # Get hosted zone ID
    HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text | cut -d'/' -f3)
    
    # Get certificate ARN
    CERT_ARN=$(aws acm list-certificates \
        --query "CertificateSummaryList[?DomainName=='$DOMAIN_NAME'].CertificateArn" \
        --output text \
        --region $AWS_REGION)
    
    if [ -z "$CERT_ARN" ]; then
        print_warning "No SSL certificate found for $DOMAIN_NAME. Please create one first."
        return 1
    fi
    
    print_info "Certificate ARN: $CERT_ARN"
    
    # Get validation records
    print_info "Getting certificate validation records..."
    aws acm describe-certificate \
        --certificate-arn $CERT_ARN \
        --region $AWS_REGION \
        --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
        --output json > /tmp/validation-record.json
    
    # Extract validation record details
    VALIDATION_NAME=$(cat /tmp/validation-record.json | jq -r '.Name')
    VALIDATION_TYPE=$(cat /tmp/validation-record.json | jq -r '.Type')
    VALIDATION_VALUE=$(cat /tmp/validation-record.json | jq -r '.Value')
    
    print_info "Validation Record:"
    print_info "Name: $VALIDATION_NAME"
    print_info "Type: $VALIDATION_TYPE"
    print_info "Value: $VALIDATION_VALUE"
    
    # Create validation record
    print_info "Creating validation record..."
    aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch "{
            \"Changes\": [{
                \"Action\": \"UPSERT\",
                \"ResourceRecordSet\": {
                    \"Name\": \"$VALIDATION_NAME\",
                    \"Type\": \"$VALIDATION_TYPE\",
                    \"TTL\": 300,
                    \"ResourceRecords\": [{\"Value\": \"$VALIDATION_VALUE\"}]
                }
            }]
        }" > /dev/null
    
    print_status "SSL validation record created"
    print_warning "Certificate validation may take a few minutes to complete."
    print_warning "Check AWS Certificate Manager console for status."
    
    # Clean up
    rm -f /tmp/validation-record.json
}

# Function to check DNS propagation
check_dns_propagation() {
    local DOMAIN_NAME=$1
    
    echo ""
    echo "🔍 Checking DNS propagation for $DOMAIN_NAME"
    echo "============================================"
    
    print_info "Checking DNS resolution..."
    
    # Wait for DNS propagation
    for i in {1..10}; do
        if nslookup $DOMAIN_NAME > /dev/null 2>&1; then
            print_status "DNS is resolving for $DOMAIN_NAME"
            break
        else
            print_warning "DNS not yet propagated (attempt $i/10)"
            sleep 30
        fi
    done
    
    # Get resolved IP
    RESOLVED_IP=$(nslookup $DOMAIN_NAME | grep "Address:" | tail -1 | awk '{print $2}')
    print_info "Resolved IP: $RESOLVED_IP"
    
    # Test HTTP response
    print_info "Testing HTTP response..."
    if curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN_NAME | grep -q "200\|301\|302"; then
        print_status "HTTP response successful"
    else
        print_warning "HTTP response not yet available (may take a few more minutes)"
    fi
}

# Main function
main() {
    echo "🌐 Route 53 DNS Setup for Football Tournaments App"
    echo "=================================================="
    echo "Production Domain: $DOMAIN"
    echo "Development Domain: $DEV_DOMAIN"
    echo ""
    
    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v nslookup &> /dev/null; then
        print_error "nslookup is not installed. Please install it first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_status "Prerequisites check passed"
    
    # Get EC2 instance IPs
    print_info "Getting EC2 instance IPs..."
    
    # Try to get production instance IP
    PROD_IP=$(get_ec2_ip "football-tournaments-prod" 2>/dev/null || echo "")
    if [ -z "$PROD_IP" ]; then
        PROD_IP=$(get_ec2_ip "football-tournaments" 2>/dev/null || echo "")
    fi
    
    # Try to get development instance IP
    DEV_IP=$(get_ec2_ip "football-tournaments-dev" 2>/dev/null || echo "")
    if [ -z "$DEV_IP" ]; then
        DEV_IP=$PROD_IP  # Use same instance for both if dev instance not found
    fi
    
    if [ -z "$PROD_IP" ]; then
        print_error "Could not find any running EC2 instances. Please launch EC2 instances first."
        exit 1
    fi
    
    print_info "Production EC2 IP: $PROD_IP"
    print_info "Development EC2 IP: $DEV_IP"
    
    # Ask which domains to setup
    echo ""
    echo "Which domains would you like to setup?"
    echo "1) Production only ($DOMAIN)"
    echo "2) Development only ($DEV_DOMAIN)"
    echo "3) Both domains"
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            create_dns_records $DOMAIN $PROD_IP
            setup_ssl_validation $DOMAIN
            check_dns_propagation $DOMAIN
            ;;
        2)
            create_dns_records $DEV_DOMAIN $DEV_IP
            setup_ssl_validation $DEV_DOMAIN
            check_dns_propagation $DEV_DOMAIN
            ;;
        3)
            create_dns_records $DOMAIN $PROD_IP
            create_dns_records $DEV_DOMAIN $DEV_IP
            setup_ssl_validation $DOMAIN
            setup_ssl_validation $DEV_DOMAIN
            check_dns_propagation $DOMAIN
            check_dns_propagation $DEV_DOMAIN
            ;;
        *)
            print_error "Invalid choice. Please run the script again."
            exit 1
            ;;
    esac
    
    echo ""
    echo "🎉 DNS setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Wait for DNS propagation (5-10 minutes)"
    echo "2. Get SSL certificates on your EC2 instances"
    echo "3. Deploy your applications"
    echo ""
    echo "🌐 Your domains will be available at:"
    if [ "$choice" = "1" ] || [ "$choice" = "3" ]; then
        echo "- Production: https://$DOMAIN"
        echo "- www: https://www.$DOMAIN"
    fi
    if [ "$choice" = "2" ] || [ "$choice" = "3" ]; then
        echo "- Development: https://$DEV_DOMAIN"
    fi
    echo ""
    echo "⏰ DNS propagation typically takes 5-10 minutes"
    echo "🔒 SSL certificates will be automatically validated"
}

# Run main function
main "$@"
