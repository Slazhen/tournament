#!/bin/bash

# Fix Docker Daemon Issue Script
# This script helps resolve Docker daemon connection issues

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

# Function to start Docker on macOS
start_docker_macos() {
    print_info "Starting Docker Desktop on macOS..."
    
    # Try to start Docker Desktop
    open -a Docker 2>/dev/null || print_warning "Could not start Docker Desktop automatically"
    
    print_info "Waiting for Docker Desktop to start..."
    sleep 10
    
    # Check if Docker is running
    if docker info &> /dev/null; then
        print_status "Docker Desktop is now running!"
    else
        print_warning "Docker Desktop is starting up. Please wait a moment and try again."
        print_info "You can also start Docker Desktop manually from Applications folder"
    fi
}

# Function to start Docker on Linux
start_docker_linux() {
    print_info "Starting Docker daemon on Linux..."
    
    # Start Docker service
    sudo systemctl start docker
    
    # Enable Docker service
    sudo systemctl enable docker
    
    # Check if Docker is running
    if docker info &> /dev/null; then
        print_status "Docker daemon is now running!"
    else
        print_error "Failed to start Docker daemon"
        print_info "Try running: sudo systemctl status docker"
        return 1
    fi
}

# Function to start Docker on Windows
start_docker_windows() {
    print_info "Starting Docker Desktop on Windows..."
    
    print_info "Please start Docker Desktop manually:"
    print_info "1. Open Docker Desktop from Start menu"
    print_info "2. Wait for it to start completely"
    print_info "3. Run this script again to verify"
}

# Function to install Docker buildx
install_buildx() {
    print_info "Installing Docker buildx..."
    
    if docker buildx version &> /dev/null; then
        print_status "Docker buildx is already installed!"
    else
        print_info "Installing buildx..."
        docker buildx install
        print_status "Docker buildx installed!"
    fi
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
            
            # Check buildx
            if docker buildx version &> /dev/null; then
                print_status "Docker buildx is available!"
            else
                print_warning "Docker buildx is not available (optional)"
            fi
        else
            print_error "Docker daemon is not running"
            return 1
        fi
    else
        print_error "Docker is not installed"
        return 1
    fi
}

# Main function
main() {
    echo "🐳 Docker Daemon Fix Script"
    echo "==========================="
    echo ""
    
    # Detect OS
    OS=$(detect_os)
    print_info "Detected OS: $OS"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first:"
        print_info "Run: ./install-docker.sh"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if docker info &> /dev/null; then
        print_status "Docker daemon is already running!"
        install_buildx
        verify_docker
        exit 0
    fi
    
    print_warning "Docker daemon is not running. Attempting to start..."
    
    case $OS in
        "macos")
            start_docker_macos
            ;;
        "linux")
            start_docker_linux
            ;;
        "windows")
            start_docker_windows
            ;;
        *)
            print_error "Unsupported operating system: $OSTYPE"
            print_info "Please start Docker manually"
            exit 1
            ;;
    esac
    
    # Wait a bit and verify
    sleep 5
    verify_docker
    
    echo ""
    echo "🎉 Docker daemon issue resolved!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Continue with your AWS deployment"
    echo "2. Docker images will now build locally (faster deployment)"
    echo "3. Run: ./deploy-domain.sh"
}

# Run main function
main "$@"
