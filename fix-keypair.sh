#!/bin/bash

# Fix Key Pair Duplicate Issue Script
# This script helps resolve the "InvalidKeyPair.Duplicate" error

set -e

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

# Function to list existing key pairs
list_key_pairs() {
    print_info "Listing existing key pairs..."
    aws ec2 describe-key-pairs --query 'KeyPairs[*].KeyName' --output table
}

# Function to delete existing key pair
delete_key_pair() {
    local key_name=$1
    
    print_info "Deleting key pair: $key_name"
    aws ec2 delete-key-pair --key-name "$key_name"
    print_status "Key pair '$key_name' deleted from AWS"
}

# Function to create new key pair
create_key_pair() {
    local key_name=$1
    
    print_info "Creating new key pair: $key_name"
    aws ec2 create-key-pair \
        --key-name "$key_name" \
        --query 'KeyMaterial' \
        --output text > "${key_name}.pem"
    
    chmod 400 "${key_name}.pem"
    print_status "Key pair created: ${key_name}.pem"
}

# Main function
main() {
    echo "🔑 Key Pair Duplicate Issue Fix"
    echo "==============================="
    echo ""
    
    # Check if AWS CLI is configured
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured. Please run: aws configure"
        exit 1
    fi
    
    KEY_NAME="football-tournaments-key"
    
    # Check if key pair exists
    if aws ec2 describe-key-pairs --key-names "$KEY_NAME" &> /dev/null; then
        print_warning "Key pair '$KEY_NAME' already exists in AWS"
        
        # Check if we have the local .pem file
        if [ -f "${KEY_NAME}.pem" ]; then
            print_status "Local .pem file exists. You can continue with deployment."
            print_info "The key pair is ready to use."
        else
            print_error "Local .pem file is missing!"
            echo ""
            echo "What would you like to do?"
            echo "1) Delete existing key pair and create new one"
            echo "2) List all key pairs"
            echo "3) Exit"
            read -p "Enter your choice (1-3): " choice
            
            case $choice in
                1)
                    delete_key_pair "$KEY_NAME"
                    create_key_pair "$KEY_NAME"
                    ;;
                2)
                    list_key_pairs
                    ;;
                3)
                    print_info "Exiting..."
                    exit 0
                    ;;
                *)
                    print_error "Invalid choice"
                    exit 1
                    ;;
            esac
        fi
    else
        print_info "Key pair '$KEY_NAME' does not exist. Creating new one..."
        create_key_pair "$KEY_NAME"
    fi
    
    echo ""
    echo "🎉 Key pair issue resolved!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Continue with your AWS setup"
    echo "2. Use the key pair for EC2 instance access"
    echo ""
    echo "🔑 Key pair file: ${KEY_NAME}.pem"
    echo "🔐 Permissions: 400 (read-only for owner)"
}

# Run main function
main "$@"
