#!/bin/bash

# --- Configuration ---
AWS_REGION="us-east-1"

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
echo -e "\n🔧 Fixing DynamoDB Tables"
echo "=========================="

# Function to create tables for an environment
create_tables_for_env() {
    local ENV=$1
    local TABLE_SUFFIX=$([ "$ENV" = "prod" ] && echo "" || echo "-dev")
    
    print_info "Creating DynamoDB tables for $ENV environment..."
    
    # Create Tournaments table
    print_info "Creating football-tournaments${TABLE_SUFFIX} table..."
    aws dynamodb create-table \
        --table-name "football-tournaments${TABLE_SUFFIX}" \
        --attribute-definitions \
            AttributeName=id,AttributeType=S \
            AttributeName=organizerId,AttributeType=S \
        --key-schema \
            AttributeName=id,KeyType=HASH \
        --global-secondary-indexes \
            'IndexName=organizerId-index,KeySchema=[{AttributeName=organizerId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region $AWS_REGION || print_warning "Tournaments table might already exist"
    
    # Create Teams table
    print_info "Creating football-teams${TABLE_SUFFIX} table..."
    aws dynamodb create-table \
        --table-name "football-teams${TABLE_SUFFIX}" \
        --attribute-definitions \
            AttributeName=id,AttributeType=S \
            AttributeName=organizerId,AttributeType=S \
        --key-schema \
            AttributeName=id,KeyType=HASH \
        --global-secondary-indexes \
            'IndexName=organizerId-index,KeySchema=[{AttributeName=organizerId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region $AWS_REGION || print_warning "Teams table might already exist"
    
    # Create Players table
    print_info "Creating football-players${TABLE_SUFFIX} table..."
    aws dynamodb create-table \
        --table-name "football-players${TABLE_SUFFIX}" \
        --attribute-definitions \
            AttributeName=id,AttributeType=S \
            AttributeName=teamId,AttributeType=S \
        --key-schema \
            AttributeName=id,KeyType=HASH \
        --global-secondary-indexes \
            'IndexName=teamId-index,KeySchema=[{AttributeName=teamId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region $AWS_REGION || print_warning "Players table might already exist"
    
    # Create Matches table
    print_info "Creating football-matches${TABLE_SUFFIX} table..."
    aws dynamodb create-table \
        --table-name "football-matches${TABLE_SUFFIX}" \
        --attribute-definitions \
            AttributeName=id,AttributeType=S \
            AttributeName=tournamentId,AttributeType=S \
        --key-schema \
            AttributeName=id,KeyType=HASH \
        --global-secondary-indexes \
            'IndexName=tournamentId-index,KeySchema=[{AttributeName=tournamentId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}' \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region $AWS_REGION || print_warning "Matches table might already exist"
    
    # Create Organizers table
    print_info "Creating football-organizers${TABLE_SUFFIX} table..."
    aws dynamodb create-table \
        --table-name "football-organizers${TABLE_SUFFIX}" \
        --attribute-definitions \
            AttributeName=id,AttributeType=S \
        --key-schema \
            AttributeName=id,KeyType=HASH \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region $AWS_REGION || print_warning "Organizers table might already exist"
    
    print_status "Tables for $ENV environment created successfully!"
}

# Create tables for both environments
create_tables_for_env "prod"
create_tables_for_env "dev"

print_status "All DynamoDB tables have been created!"
print_info "You can now proceed with the SSL certificate validation and EC2 deployment."
