#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${BLUE}🔐 $1${NC}"
    echo "=========================================="
}

# Main function
main() {
    print_header "Fixing IAM Permissions for SSL Certificate Creation"
    
    # Check if AWS CLI is configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured or credentials are invalid"
        print_info "Please run: aws configure"
        exit 1
    fi
    
    print_info "Current AWS identity:"
    aws sts get-caller-identity
    
    # IAM user name
    IAM_USER="football-tournaments-deployer"
    
    print_info "Adding ACM permissions to IAM user: $IAM_USER"
    
    # Create a policy for ACM permissions
    cat > acm-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "acm:RequestCertificate",
                "acm:DescribeCertificate",
                "acm:ListCertificates",
                "acm:GetCertificate",
                "acm:DeleteCertificate",
                "acm:AddTagsToCertificate",
                "acm:RemoveTagsFromCertificate",
                "acm:ListTagsForCertificate"
            ],
            "Resource": "*"
        }
    ]
}
EOF
    
    print_info "Creating ACM policy..."
    aws iam create-policy \
        --policy-name FootballTournamentsACMPolicy \
        --policy-document file://acm-policy.json \
        --description "Policy for ACM certificate management" \
        || print_warning "Policy might already exist"
    
    print_info "Attaching ACM policy to IAM user..."
    aws iam attach-user-policy \
        --user-name "$IAM_USER" \
        --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/FootballTournamentsACMPolicy" \
        || print_warning "Policy might already be attached"
    
    # Also add Route 53 permissions for DNS validation
    print_info "Adding Route 53 permissions for DNS validation..."
    cat > route53-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "route53:GetHostedZone",
                "route53:ListHostedZones",
                "route53:ChangeResourceRecordSets",
                "route53:GetChange",
                "route53:ListResourceRecordSets"
            ],
            "Resource": "*"
        }
    ]
}
EOF
    
    print_info "Creating Route 53 policy..."
    aws iam create-policy \
        --policy-name FootballTournamentsRoute53Policy \
        --policy-document file://route53-policy.json \
        --description "Policy for Route 53 DNS management" \
        || print_warning "Policy might already exist"
    
    print_info "Attaching Route 53 policy to IAM user..."
    aws iam attach-user-policy \
        --user-name "$IAM_USER" \
        --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/FootballTournamentsRoute53Policy" \
        || print_warning "Policy might already be attached"
    
    # Clean up temporary files
    rm -f acm-policy.json route53-policy.json
    
    print_success "IAM permissions updated successfully!"
    print_info "The user $IAM_USER now has permissions for:"
    print_info "  - ACM certificate creation and management"
    print_info "  - Route 53 DNS record management"
    
    print_info "You can now retry the SSL certificate creation:"
    print_info "  ./deploy-domain.sh"
}

# Run main function
main "$@"
