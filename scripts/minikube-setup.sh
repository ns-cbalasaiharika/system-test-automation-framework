#!/bin/bash
# =============================================================================
# Minikube Setup Script for Client-Oppy System Tests
# 
# This script automates the complete setup and test execution for local testing.
#
# Prerequisites:
#   - Docker Desktop running
#   - minikube installed (brew install minikube)
#   - helm installed (brew install helm)
#   - helmfile installed (brew install helmfile)
#   - k6 installed (brew install k6)
#   - client-oppy repo cloned
#
# Usage:
#   ./scripts/minikube-setup.sh                    # Full setup + run BL01 test
#   ./scripts/minikube-setup.sh --setup-only       # Only setup, no test
#   ./scripts/minikube-setup.sh --test-only        # Only run test (assumes setup done)
#   ./scripts/minikube-setup.sh --cleanup          # Cleanup everything
#
# Environment Variables:
#   CLIENT_OPPY_PATH  - Path to client-oppy repo (required)
#   SCENARIO          - Scenario to run (default: bl01-golden-baseline)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCENARIO="${SCENARIO:-bl01-golden-baseline}"
NAMESPACE="client-oppy"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# =============================================================================
# Prerequisites Check
# =============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    check_command docker
    check_command minikube
    check_command helm
    check_command helmfile
    check_command k6
    check_command kubectl
    
    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    # Check CLIENT_OPPY_PATH
    if [ -z "$CLIENT_OPPY_PATH" ]; then
        # Try to find it relative to project
        if [ -d "$PROJECT_ROOT/../client-oppy" ]; then
            export CLIENT_OPPY_PATH="$PROJECT_ROOT/../client-oppy"
            log_info "Found client-oppy at: $CLIENT_OPPY_PATH"
        else
            log_error "CLIENT_OPPY_PATH environment variable is not set."
            log_error "Please set it: export CLIENT_OPPY_PATH=/path/to/client-oppy"
            exit 1
        fi
    fi
    
    if [ ! -d "$CLIENT_OPPY_PATH/docker/dev" ]; then
        log_error "client-oppy/docker/dev not found at $CLIENT_OPPY_PATH"
        log_error "Please clone: git clone https://github.com/netSkope/client-oppy.git"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# =============================================================================
# Infrastructure Setup (Docker Compose)
# =============================================================================

start_infrastructure() {
    log_info "Starting infrastructure (Docker Compose)..."
    
    cd "$CLIENT_OPPY_PATH/docker/dev"
    
    # Check if containers are already running
    if docker ps --format '{{.Names}}' | grep -q "client-oppy-mariadb"; then
        log_info "Infrastructure already running"
    else
        docker-compose up -d
        log_info "Waiting for containers to be healthy..."
        sleep 20
    fi
    
    # Verify all containers are healthy
    local containers=(client-oppy-mariadb client-oppy-redis client-oppy-kafka client-oppy-zookeeper)
    for container in "${containers[@]}"; do
        if docker ps --format '{{.Names}} {{.Status}}' | grep "$container" | grep -q "healthy\|Up"; then
            log_success "$container is running"
        else
            log_error "$container is not healthy"
            docker ps -a | grep "$container"
            exit 1
        fi
    done
    
    cd "$PROJECT_ROOT"
    log_success "Infrastructure started"
}

stop_infrastructure() {
    log_info "Stopping infrastructure..."
    cd "$CLIENT_OPPY_PATH/docker/dev"
    docker-compose down
    cd "$PROJECT_ROOT"
    log_success "Infrastructure stopped"
}

# =============================================================================
# Minikube Setup
# =============================================================================

start_minikube() {
    log_info "Starting minikube..."
    
    # Check if minikube is already running
    if minikube status | grep -q "Running"; then
        log_info "Minikube already running"
        minikube update-context
    else
        minikube start --driver=docker --cni=bridge --cpus=4 --memory=8192
    fi
    
    # Verify node is ready
    kubectl wait --for=condition=Ready node/minikube --timeout=60s
    log_success "Minikube is ready"
}

stop_minikube() {
    log_info "Stopping minikube..."
    minikube stop
    log_success "Minikube stopped"
}

# =============================================================================
# Image Loading
# =============================================================================

load_images() {
    log_info "Loading client-oppy images into minikube..."
    
    local images=(
        "artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-configuration:latest"
        "artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-orchestrator:latest"
        "artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-steering:latest"
    )
    
    for image in "${images[@]}"; do
        # Check if image exists locally
        if ! docker image inspect "$image" &> /dev/null; then
            log_info "Pulling $image..."
            docker pull --platform linux/amd64 "$image"
        else
            log_info "Image already exists: $image"
        fi
        
        # Check if image is in minikube
        if ! minikube image ls | grep -q "$(echo $image | cut -d: -f1)"; then
            log_info "Loading $image into minikube..."
            minikube image load "$image"
        else
            log_info "Image already in minikube: $image"
        fi
    done
    
    log_success "Images loaded"
}

# =============================================================================
# Service Deployment
# =============================================================================

deploy_services() {
    log_info "Deploying client-oppy services..."
    
    cd "$PROJECT_ROOT/k8s/minikube"
    
    # Create namespace if not exists
    kubectl create namespace $NAMESPACE 2>/dev/null || true
    
    # Deploy services
    helmfile sync -l tier=app
    
    # Wait for pods to be ready
    log_info "Waiting for pods to be ready..."
    kubectl wait --for=condition=Ready pods --all -n $NAMESPACE --timeout=120s
    
    # Show pod status
    kubectl get pods -n $NAMESPACE
    
    cd "$PROJECT_ROOT"
    log_success "Services deployed"
}

destroy_services() {
    log_info "Destroying services..."
    cd "$PROJECT_ROOT/k8s/minikube"
    helmfile destroy 2>/dev/null || true
    kubectl delete namespace $NAMESPACE 2>/dev/null || true
    cd "$PROJECT_ROOT"
    log_success "Services destroyed"
}

# =============================================================================
# Test Execution
# =============================================================================

run_test() {
    log_info "Running k6 test: $SCENARIO"
    
    cd "$PROJECT_ROOT"
    
    # Bundle scenarios
    log_info "Bundling scenarios..."
    npm run bundle
    
    # Start port-forward in background
    log_info "Starting port-forward..."
    kubectl port-forward -n $NAMESPACE svc/client-oppy-configuration 6010:80 &
    PF_PID=$!
    sleep 3
    
    # Verify port-forward is working
    if ! curl -s http://localhost:6010/api/v1/ready | grep -q "ready"; then
        log_error "Port-forward failed or service not ready"
        kill $PF_PID 2>/dev/null
        exit 1
    fi
    
    log_success "Service is ready"
    
    # Run k6 test
    log_info "Starting k6 test..."
    mkdir -p results
    
    k6 run "dist/scenarios/client-oppy/baseline/${SCENARIO}.bundle.js" \
        --env ENV=minikube-local \
        --env SCENARIO_ID="$SCENARIO" \
        --duration 1m \
        --vus 5 \
        || TEST_FAILED=true
    
    # Cleanup port-forward
    kill $PF_PID 2>/dev/null
    
    if [ "$TEST_FAILED" = true ]; then
        log_warn "Test completed with threshold violations"
    else
        log_success "Test completed successfully"
    fi
}

# =============================================================================
# Full Setup
# =============================================================================

full_setup() {
    check_prerequisites
    start_infrastructure
    start_minikube
    load_images
    deploy_services
    log_success "Setup complete! Ready to run tests."
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
    log_info "Cleaning up everything..."
    destroy_services
    stop_minikube
    stop_infrastructure
    log_success "Cleanup complete"
}

# =============================================================================
# Main
# =============================================================================

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --setup-only    Only run setup (infrastructure + minikube + deploy)"
    echo "  --test-only     Only run test (assumes setup is done)"
    echo "  --cleanup       Cleanup everything"
    echo "  --help          Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  CLIENT_OPPY_PATH  Path to client-oppy repo (required)"
    echo "  SCENARIO          Scenario to run (default: bl01-golden-baseline)"
    echo ""
    echo "Examples:"
    echo "  export CLIENT_OPPY_PATH=/path/to/client-oppy"
    echo "  $0                    # Full setup + run test"
    echo "  $0 --setup-only       # Only setup"
    echo "  $0 --test-only        # Only run test"
    echo "  SCENARIO=bl02 $0      # Run different scenario"
}

case "${1:-}" in
    --setup-only)
        full_setup
        ;;
    --test-only)
        check_prerequisites
        run_test
        ;;
    --cleanup)
        cleanup
        ;;
    --help|-h)
        show_help
        ;;
    "")
        full_setup
        run_test
        ;;
    *)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac
