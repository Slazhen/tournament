#!/bin/bash

# Docker Installation Script
# This script installs Docker on your local machine

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

# Function to detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

# Function to install Docker on macOS
install_docker_macos() {
    print_info "Installing Docker on macOS..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        print_error "Homebrew is not installed. Please install Homebrew first:"
        print_info "https://brew.sh/"
        exit 1
    fi
    
    # Install Docker Desktop
    print_info "Installing Docker Desktop..."
    brew install --cask docker
    
    print_status "Docker Desktop installed!"
    print_warning "Please start Docker Desktop from Applications folder"
    print_info "After starting Docker Desktop, run this script again to verify installation"
}

# Function to install Docker on Linux
install_docker_linux() {
    print_info "Installing Docker on Linux..."
    
    # Update package index
    sudo apt-get update
    
    # Install Docker
    sudo apt-get install -y docker.io
    
    # Start and enable Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    
    print_status "Docker installed on Linux!"
    print_warning "Please log out and log back in for group changes to take effect"
    print_info "Or run: newgrp docker"
}

# Function to install Docker on Windows
install_docker_windows() {
    print_info "Installing Docker on Windows..."
    
    print_info "Please download and install Docker Desktop for Windows:"
    print_info "https://www.docker.com/products/docker-desktop"
    print_info ""
    print_info "After installation:"
    print_info "1. Start Docker Desktop"
    print_info "2. Run this script again to verify installation"
}

# Function to verify Docker installation
verify_docker() {
    print_info "Verifying Docker installation..."
    
    if command -v docker &> /dev/null; then
        print_status "Docker is installed!"
        
        # Check if Docker daemon is running
        if docker info &> /dev/null; then
            print_status "Docker daemon is running!"
            print_info "Docker version: $(docker --version)"
        else
            print_warning "Docker is installed but daemon is not running"
            print_info "Please start Docker Desktop or Docker daemon"
        fi
    else
        print_error "Docker is not installed or not in PATH"
        return 1
    fi
}

# Main function
main() {
    echo "🐳 Docker Installation Script"
    echo "============================="
    echo ""
    
    # Check if Docker is already installed
    if command -v docker &> /dev/null; then
        print_status "Docker is already installed!"
        verify_docker
        exit 0
    fi
    
    # Detect OS
    OS=$(detect_os)
    print_info "Detected OS: $OS"
    
    case $OS in
        "macos")
            install_docker_macos
            ;;
        "linux")
            install_docker_linux
            ;;
        "windows")
            install_docker_windows
            ;;
        *)
            print_error "Unsupported operating system: $OSTYPE"
            print_info "Please install Docker manually:"
            print_info "https://docs.docker.com/get-docker/"
            exit 1
            ;;
    esac
    
    echo ""
    echo "🎉 Docker installation complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Start Docker Desktop (if on macOS/Windows)"
    echo "2. Verify installation: ./install-docker.sh"
    echo "3. Continue with AWS deployment"
}

# Run main function
main "$@"
