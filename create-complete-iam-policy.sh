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
    print_header "Creating Complete IAM Policy for Football Tournaments Deployment"
    
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
    
    print_info "Creating comprehensive IAM policy for user: $IAM_USER"
    
    # Create a comprehensive policy for all AWS services needed
    cat > complete-deployment-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:CreateTable",
                "dynamodb:DescribeTable",
                "dynamodb:ListTables",
                "dynamodb:UpdateTable",
                "dynamodb:DeleteTable",
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchGetItem",
                "dynamodb:BatchWriteItem"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:CreateBucket",
                "s3:DeleteBucket",
                "s3:ListBucket",
                "s3:GetBucketLocation",
                "s3:GetBucketPolicy",
                "s3:PutBucketPolicy",
                "s3:DeleteBucketPolicy",
                "s3:GetBucketPublicAccessBlock",
                "s3:PutBucketPublicAccessBlock",
                "s3:DeleteBucketPublicAccessBlock",
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListObjects",
                "s3:ListObjectsV2"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ec2:CreateKeyPair",
                "ec2:DeleteKeyPair",
                "ec2:DescribeKeyPairs",
                "ec2:RunInstances",
                "ec2:TerminateInstances",
                "ec2:DescribeInstances",
                "ec2:CreateSecurityGroup",
                "ec2:DeleteSecurityGroup",
                "ec2:DescribeSecurityGroups",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:AuthorizeSecurityGroupEgress",
                "ec2:RevokeSecurityGroupEgress",
                "ec2:CreateTags",
                "ec2:DescribeTags",
                "ec2:DescribeImages",
                "ec2:DescribeRegions",
                "ec2:DescribeAvailabilityZones"
            ],
            "Resource": "*"
        },
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
        },
        {
            "Effect": "Allow",
            "Action": [
                "route53:GetHostedZone",
                "route53:ListHostedZones",
                "route53:CreateHostedZone",
                "route53:DeleteHostedZone",
                "route53:ChangeResourceRecordSets",
                "route53:GetChange",
                "route53:ListResourceRecordSets",
                "route53:GetHostedZoneCount",
                "route53:GetHostedZoneLimit"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "iam:CreateUser",
                "iam:DeleteUser",
                "iam:GetUser",
                "iam:ListUsers",
                "iam:CreateAccessKey",
                "iam:DeleteAccessKey",
                "iam:ListAccessKeys",
                "iam:CreatePolicy",
                "iam:DeletePolicy",
                "iam:GetPolicy",
                "iam:ListPolicies",
                "iam:AttachUserPolicy",
                "iam:DetachUserPolicy",
                "iam:ListAttachedUserPolicies",
                "iam:ListUserPolicies",
                "iam:PassRole"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ecr:CreateRepository",
                "ecr:DeleteRepository",
                "ecr:DescribeRepositories",
                "ecr:GetRepositoryPolicy",
                "ecr:SetRepositoryPolicy",
                "ecr:DeleteRepositoryPolicy",
                "ecr:GetLifecyclePolicy",
                "ecr:PutLifecyclePolicy",
                "ecr:DeleteLifecyclePolicy",
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ],
            "Resource": "*"
        }
    ]
}
EOF
    
    print_info "Creating comprehensive deployment policy..."
    aws iam create-policy \
        --policy-name FootballTournamentsCompletePolicy \
        --policy-document file://complete-deployment-policy.json \
        --description "Complete policy for Football Tournaments AWS deployment" \
        || print_warning "Policy might already exist"
    
    print_info "Attaching comprehensive policy to IAM user..."
    aws iam attach-user-policy \
        --user-name "$IAM_USER" \
        --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/FootballTournamentsCompletePolicy" \
        || print_warning "Policy might already be attached"
    
    # Clean up temporary file
    rm -f complete-deployment-policy.json
    
    print_success "Complete IAM policy created and attached successfully!"
    print_info "The user $IAM_USER now has permissions for:"
    print_info "  - DynamoDB (database operations)"
    print_info "  - S3 (file storage)"
    print_info "  - EC2 (virtual servers)"
    print_info "  - ACM (SSL certificates)"
    print_info "  - Route 53 (DNS management)"
    print_info "  - IAM (user and policy management)"
    print_info "  - ECR (container registry)"
    
    print_info "You can now retry the deployment:"
    print_info "  ./deploy-domain.sh"
}

# Run main function
main "$@"
