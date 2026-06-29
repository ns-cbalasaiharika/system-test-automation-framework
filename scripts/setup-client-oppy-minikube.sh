#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
#
#  CLIENT-OPPY MINIKUBE ENVIRONMENT SETUP
#
#  This script sets up a complete client-oppy testing environment in Minikube.
#  It is specifically designed for testing client-oppy services (configuration,
#  orchestrator, steering) in a local Kubernetes cluster.
#
# =============================================================================
#
#  ARCHITECTURE:
#  ┌─────────────────────────────────────────────────────────────────────────┐
#  │                         Host Machine (Docker)                           │
#  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
#  │  │  MySQL/  │  │  Kafka   │  │  Redis   │   ← Infrastructure           │
#  │  │ MariaDB  │  │          │  │          │     (docker-compose)         │
#  │  └────┬─────┘  └────┬─────┘  └────┬─────┘                              │
#  │       │             │             │                                     │
#  │       └─────────────┼─────────────┘                                     │
#  │                     │ host.minikube.internal                            │
#  │  ┌──────────────────┼──────────────────────────────────────────────┐   │
#  │  │                  │            Minikube Cluster                   │   │
#  │  │  ┌───────────────┴───────────────┐                              │   │
#  │  │  │     client-oppy namespace     │                              │   │
#  │  │  │  ┌─────────────────────────┐  │                              │   │
#  │  │  │  │  configuration service  │  │  ← Helm charts from          │   │
#  │  │  │  │  orchestrator service   │  │    client-oppy/helm/         │   │
#  │  │  │  │  steering service       │  │                              │   │
#  │  │  │  │  toxiproxy (optional)   │  │                              │   │
#  │  │  │  └─────────────────────────┘  │                              │   │
#  │  │  └───────────────────────────────┘                              │   │
#  │  │  ┌───────────────────────────────┐                              │   │
#  │  │  │   k6-operator-system ns       │  ← For running k6 tests      │   │
#  │  │  │   k6-perf-testing ns          │    inside the cluster        │   │
#  │  │  └───────────────────────────────┘                              │   │
#  │  └─────────────────────────────────────────────────────────────────┘   │
#  └─────────────────────────────────────────────────────────────────────────┘
#
# =============================================================================
#
#  PREREQUISITES:
#    1. Docker Desktop running with sufficient resources (6+ CPUs, 12GB+ RAM)
#    2. Tools installed: minikube, kubectl, helm, helmfile
#    3. Docker login to artifactory: docker login artifactory-rd.netskope.io
#    4. client-oppy repo cloned locally
#
#  USAGE:
#    # Full setup (infrastructure + services + k6-operator)
#    ./scripts/setup-client-oppy-minikube.sh
#
#    # Start infrastructure only (MySQL, Kafka, Redis)
#    ./scripts/setup-client-oppy-minikube.sh --infra-only
#
#    # Deploy services only (assumes infrastructure is running)
#    ./scripts/setup-client-oppy-minikube.sh --deploy-only
#
#    # Check current status
#    ./scripts/setup-client-oppy-minikube.sh --status
#
#    # Teardown everything
#    ./scripts/setup-client-oppy-minikube.sh --teardown
#
#  AFTER SETUP, RUN TESTS WITH:
#    ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster
#
# =============================================================================
#
#  WHAT THIS SCRIPT DOES:
#
#    Step 1: Validate Resources
#            - Check Docker has enough CPU/memory allocated
#            - Check disk space is sufficient
#
#    Step 2: Start Infrastructure (from client-oppy repo)
#            - MySQL/MariaDB for database
#            - Kafka for event streaming
#            - Redis for caching
#            Source: $CLIENT_OPPY_PATH/docker/dev/docker-compose.yaml
#
#    Step 3: Start Minikube Cluster
#            - Create cluster with 6 CPUs, 12GB memory
#            - Create namespaces: client-oppy, k6-perf-testing
#            - Setup image pull secrets for artifactory
#
#    Step 4: Pull & Load Service Images
#            - Pull from: artifactory-rd.netskope.io/nsclient-release-docker/
#            - Services: client-oppy-configuration, orchestrator, steering
#            - Load images into minikube's Docker daemon
#
#    Step 5: Deploy client-oppy Services (via Helm)
#            - Uses Helm charts from: $CLIENT_OPPY_PATH/helm/
#            - Deploys: configuration, orchestrator, steering services
#            - Applies values from: k8s/minikube/*-values.yaml
#
#    Step 6: Install k6-operator
#            - For running performance tests inside the cluster
#            - Creates TestRun CRDs for k6 test execution
#
#    Step 7: Deploy Toxiproxy (optional)
#            - For fault injection testing scenarios
#            - Allows simulating network failures, latency, etc.
#
#    Step 8: Verify & Seed
#            - Wait for all pods to be ready
#            - Verify health endpoints respond
#            - Seed initial test data
#
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MINIKUBE_K8S_DIR="$FRAMEWORK_ROOT/k8s/minikube"
TOXIPROXY_DIR="$FRAMEWORK_ROOT/k8s/toxiproxy"

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION - Modify these as needed
# ─────────────────────────────────────────────────────────────────────────────

# Path to client-oppy repository (required)
CLIENT_OPPY_PATH="${CLIENT_OPPY_PATH:-/Users/cbalasaiharika/Desktop/code/client-oppy}"

# Artifactory registry for pulling images
ARTIFACTORY_REGISTRY="artifactory-rd.netskope.io/nsclient-release-docker"

# Minikube resource allocation
MINIKUBE_CPUS=6
MINIKUBE_MEMORY_MB=12288

# Kubernetes namespaces
NAMESPACE="client-oppy"
K6_NAMESPACE="k6-perf-testing"

# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL VARIABLES (do not modify)
# ─────────────────────────────────────────────────────────────────────────────

DEPLOY_ONLY=false
INFRA_ONLY=false
TEARDOWN=false
STATUS_ONLY=false
SKIP_SEED=false
SKIP_TOXIPROXY=false

LOG_DIR="$FRAMEWORK_ROOT/logs"
DEPLOY_LOG="$LOG_DIR/setup-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $*" | tee -a "$DEPLOY_LOG" 2>/dev/null || echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*" | tee -a "$DEPLOY_LOG" 2>/dev/null || echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*" | tee -a "$DEPLOY_LOG" 2>/dev/null || echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*" | tee -a "$DEPLOY_LOG" 2>/dev/null || echo -e "${RED}[✗]${NC} $*"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $*" | tee -a "$DEPLOY_LOG" 2>/dev/null || echo -e "${CYAN}[i]${NC} $*"; }

# ─────────────────────────────────────────────────────────────────────────────
# ARGUMENT PARSING
# ─────────────────────────────────────────────────────────────────────────────

show_help() {
  cat << EOF
CLIENT-OPPY MINIKUBE SETUP

Sets up a complete client-oppy testing environment in Minikube.

USAGE:
  $0 [OPTIONS]

OPTIONS:
  --deploy-only         Deploy services only (skip infrastructure setup)
  --infra-only          Start infrastructure only (MySQL, Kafka, Redis)
  --teardown            Destroy minikube cluster and stop infrastructure
  --status              Show current environment status
  --skip-seed           Skip seeding test data
  --skip-toxiproxy      Skip Toxiproxy deployment
  --client-oppy-path    Path to client-oppy repo (default: $CLIENT_OPPY_PATH)
  --help, -h            Show this help message

EXAMPLES:
  # Full setup
  $0

  # Check status
  $0 --status

  # Teardown
  $0 --teardown

ENVIRONMENT VARIABLES:
  CLIENT_OPPY_PATH      Path to client-oppy repository

AFTER SETUP:
  Run tests with: ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster

EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --deploy-only)      DEPLOY_ONLY=true; shift ;;
    --infra-only)       INFRA_ONLY=true; shift ;;
    --teardown)         TEARDOWN=true; shift ;;
    --status)           STATUS_ONLY=true; shift ;;
    --skip-seed)        SKIP_SEED=true; shift ;;
    --skip-toxiproxy)   SKIP_TOXIPROXY=true; shift ;;
    --client-oppy-path) CLIENT_OPPY_PATH="$2"; shift 2 ;;
    --help|-h)          show_help ;;
    *)                  fail "Unknown option: $1. Use --help for usage." ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: RESOURCE VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

check_resources() {
  log "Step 1: Validating system resources..."
  
  # Check Docker is running
  if ! docker info >/dev/null 2>&1; then
    fail "Docker is not running. Please start Docker Desktop."
  fi
  
  # Check Docker resource allocation
  local docker_cpus=$(docker info --format '{{.NCPU}}' 2>/dev/null || echo "0")
  local docker_mem_bytes=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo "0")
  local docker_mem_gb=$((docker_mem_bytes / 1024 / 1024 / 1024))
  
  info "Docker resources: ${docker_cpus} CPUs, ${docker_mem_gb}GB memory"
  
  if [[ "$docker_cpus" -lt 4 ]]; then
    warn "Docker has only $docker_cpus CPUs (recommended: 6+)"
  fi
  
  if [[ "$docker_mem_gb" -lt 8 ]]; then
    warn "Docker has only ${docker_mem_gb}GB memory (recommended: 12GB+)"
  fi
  
  # Check disk space
  local free_space_gb=$(df -g "$HOME" 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
  if [[ "$free_space_gb" -lt 20 ]]; then
    warn "Low disk space: ${free_space_gb}GB free (recommended: 20GB+)"
  fi
  
  ok "Resource validation complete"
}

# ─────────────────────────────────────────────────────────────────────────────
# PREREQUISITE CHECKS
# ─────────────────────────────────────────────────────────────────────────────

check_prerequisites() {
  log "Checking prerequisites..."
  
  local missing=()
  command -v docker >/dev/null 2>&1 || missing+=("docker")
  command -v minikube >/dev/null 2>&1 || missing+=("minikube")
  command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
  command -v helm >/dev/null 2>&1 || missing+=("helm")
  command -v helmfile >/dev/null 2>&1 || missing+=("helmfile")
  
  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing tools: ${missing[*]}. Install with: brew install ${missing[*]}"
  fi
  
  # Check client-oppy repo exists
  if [[ ! -d "$CLIENT_OPPY_PATH" ]]; then
    fail "client-oppy repo not found at: $CLIENT_OPPY_PATH
    
    Please either:
      1. Clone the repo: git clone <client-oppy-url> $CLIENT_OPPY_PATH
      2. Set CLIENT_OPPY_PATH: export CLIENT_OPPY_PATH=/your/path/to/client-oppy"
  fi
  
  # Check required directories in client-oppy
  [[ -d "$CLIENT_OPPY_PATH/helm" ]] || fail "Helm charts not found at: $CLIENT_OPPY_PATH/helm"
  [[ -d "$CLIENT_OPPY_PATH/docker" ]] || fail "Docker configs not found at: $CLIENT_OPPY_PATH/docker"
  
  ok "Prerequisites verified"
  info "Using client-oppy repo: $CLIENT_OPPY_PATH"
}

# ─────────────────────────────────────────────────────────────────────────────
# TEARDOWN
# ─────────────────────────────────────────────────────────────────────────────

teardown() {
  log "Tearing down environment..."
  
  if minikube status >/dev/null 2>&1; then
    log "Deleting minikube cluster..."
    minikube delete || true
    ok "Minikube deleted"
  else
    info "Minikube not running"
  fi
  
  local compose_dir="$CLIENT_OPPY_PATH/docker/dev"
  if [[ -f "$compose_dir/docker-compose.yaml" ]] || [[ -f "$compose_dir/docker-compose.yml" ]]; then
    log "Stopping infrastructure containers..."
    cd "$compose_dir"
    docker-compose down -v 2>/dev/null || true
    ok "Infrastructure stopped"
  fi
  
  ok "Teardown complete"
  exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────────────────────────────────────────

show_status() {
  echo ""
  echo -e "${BOLD}CLIENT-OPPY ENVIRONMENT STATUS${NC}"
  echo "════════════════════════════════════════════════════════════════"
  echo ""
  
  echo -e "${CYAN}Infrastructure (Docker Compose):${NC}"
  if docker ps --format "{{.Names}}" 2>/dev/null | grep -qE "mysql|mariadb|kafka|redis"; then
    docker ps --filter "name=mysql" --filter "name=mariadb" --filter "name=kafka" --filter "name=redis" \
      --format "  {{.Names}}: {{.Status}}" 2>/dev/null
  else
    echo "  Not running"
  fi
  echo ""
  
  echo -e "${CYAN}Minikube:${NC}"
  if minikube status >/dev/null 2>&1; then
    echo "  Status: Running"
    echo "  IP: $(minikube ip 2>/dev/null || echo 'N/A')"
  else
    echo "  Status: Not running"
  fi
  echo ""
  
  if kubectl cluster-info >/dev/null 2>&1; then
    echo -e "${CYAN}Client-Oppy Services (namespace: $NAMESPACE):${NC}"
    kubectl get pods -n "$NAMESPACE" 2>/dev/null || echo "  Namespace not found"
    echo ""
    
    echo -e "${CYAN}K6 Operator:${NC}"
    kubectl get pods -n k6-operator-system 2>/dev/null | head -5 || echo "  Not installed"
  fi
  
  echo ""
  exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: START INFRASTRUCTURE
# ─────────────────────────────────────────────────────────────────────────────

start_infrastructure() {
  log "Step 2: Starting infrastructure (MySQL, Kafka, Redis)..."
  
  local compose_dir="$CLIENT_OPPY_PATH/docker/dev"
  
  # Find docker-compose file
  if [[ ! -f "$compose_dir/docker-compose.yaml" ]] && [[ ! -f "$compose_dir/docker-compose.yml" ]]; then
    compose_dir="$CLIENT_OPPY_PATH/docker"
  fi
  
  if [[ ! -f "$compose_dir/docker-compose.yaml" ]] && [[ ! -f "$compose_dir/docker-compose.yml" ]]; then
    fail "docker-compose.yaml not found in $CLIENT_OPPY_PATH/docker/"
  fi
  
  info "Using: $compose_dir/docker-compose.yaml"
  cd "$compose_dir"
  
  docker-compose up -d
  
  # Wait for containers to be healthy
  log "Waiting for infrastructure to be ready..."
  sleep 10
  
  ok "Infrastructure started"
  docker-compose ps
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: START MINIKUBE
# ─────────────────────────────────────────────────────────────────────────────

start_minikube() {
  log "Step 3: Starting Minikube cluster..."
  
  if minikube status >/dev/null 2>&1; then
    ok "Minikube already running"
  else
    log "Creating cluster with $MINIKUBE_CPUS CPUs, ${MINIKUBE_MEMORY_MB}MB memory..."
    minikube start \
      --cpus=$MINIKUBE_CPUS \
      --memory=$MINIKUBE_MEMORY_MB \
      --driver=docker \
      --addons=metrics-server
    ok "Minikube started"
  fi
  
  # Create namespaces
  log "Creating namespaces..."
  kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  kubectl create namespace "$K6_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  
  # Create PriorityClass required by client-oppy Helm charts
  log "Creating PriorityClass..."
  kubectl apply -f - <<EOF
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: eng-priority-2000
value: 2000
globalDefault: false
description: "Engineering workloads priority class for minikube"
EOF
  
  # Create image pull secret from Docker config
  if [[ -f ~/.docker/config.json ]]; then
    log "Creating image pull secret for artifactory..."
    kubectl create secret generic artifactory-creds \
      --from-file=.dockerconfigjson=$HOME/.docker/config.json \
      --type=kubernetes.io/dockerconfigjson \
      -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  else
    warn "~/.docker/config.json not found. You may need to create image pull secret manually."
  fi
  
  ok "Minikube configured"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: PULL AND LOAD IMAGES
# ─────────────────────────────────────────────────────────────────────────────

pull_and_load_images() {
  log "Step 4: Pulling and loading service images..."
  
  local services=("configuration" "orchestrator" "steering")
  
  for svc in "${services[@]}"; do
    local image="${ARTIFACTORY_REGISTRY}/client-oppy-${svc}:latest"
    
    log "Pulling $image..."
    if ! docker pull --platform linux/amd64 "$image" 2>>"$DEPLOY_LOG"; then
      warn "Failed to pull $image - retrying..."
      sleep 3
      docker pull --platform linux/amd64 "$image" || fail "Cannot pull $image. Check artifactory login."
    fi
    
    log "Loading into minikube..."
    minikube image load "$image" 2>>"$DEPLOY_LOG"
  done
  
  ok "All images loaded into minikube"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: DEPLOY SERVICES
# ─────────────────────────────────────────────────────────────────────────────

deploy_services() {
  log "Step 5: Deploying client-oppy services via Helm..."
  
  cd "$MINIKUBE_K8S_DIR"
  export CLIENT_OPPY_PATH
  
  # Add Helm repos
  helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
  helm repo update >/dev/null
  
  info "Deploying from Helm charts: $CLIENT_OPPY_PATH/helm/"
  
  # Deploy with retry
  local retries=3
  while [[ $retries -gt 0 ]]; do
    if helmfile sync -l tier=app 2>>"$DEPLOY_LOG"; then
      break
    fi
    retries=$((retries - 1))
    [[ $retries -gt 0 ]] && warn "Deployment failed, retrying... ($retries left)" && sleep 10
  done
  
  [[ $retries -eq 0 ]] && fail "Failed to deploy services. Check: $DEPLOY_LOG"
  
  ok "Services deployed"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: INSTALL K6 OPERATOR
# ─────────────────────────────────────────────────────────────────────────────

install_k6_operator() {
  log "Step 6: Installing k6-operator..."
  
  cd "$MINIKUBE_K8S_DIR"
  export CLIENT_OPPY_PATH
  
  helmfile sync -l tier=k6 2>>"$DEPLOY_LOG" || warn "k6-operator had warnings"
  
  ok "k6-operator installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: DEPLOY TOXIPROXY
# ─────────────────────────────────────────────────────────────────────────────

deploy_toxiproxy() {
  if [[ "$SKIP_TOXIPROXY" == "true" ]]; then
    info "Skipping Toxiproxy (--skip-toxiproxy)"
    return
  fi
  
  log "Step 7: Deploying Toxiproxy for fault injection..."
  
  if [[ -f "$TOXIPROXY_DIR/deployment-minikube.yaml" ]]; then
    kubectl apply -f "$TOXIPROXY_DIR/deployment-minikube.yaml" -n "$NAMESPACE" 2>>"$DEPLOY_LOG" || true
    kubectl apply -f "$TOXIPROXY_DIR/configmap-minikube.yaml" -n "$NAMESPACE" 2>>"$DEPLOY_LOG" || true
    ok "Toxiproxy deployed"
  else
    warn "Toxiproxy manifests not found, skipping"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: WAIT AND VERIFY
# ─────────────────────────────────────────────────────────────────────────────

wait_for_services() {
  log "Step 8: Waiting for services to be ready..."
  
  local services=("client-oppy-configuration" "client-oppy-orchestrator" "client-oppy-steering")
  
  for svc in "${services[@]}"; do
    log "Waiting for $svc..."
    kubectl rollout status deployment/"$svc" -n "$NAMESPACE" --timeout=300s 2>>"$DEPLOY_LOG" || warn "$svc not ready"
  done
  
  ok "All services deployed"
}

verify_health() {
  log "Verifying service health..."
  
  # Check configuration service
  local config_pod=$(kubectl get pods -n "$NAMESPACE" -l app=client-oppy-configuration -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
  if [[ -n "$config_pod" ]]; then
    if kubectl exec -n "$NAMESPACE" "$config_pod" -- wget -q -O- http://localhost:6010/-/ready >/dev/null 2>&1; then
      ok "configuration service: healthy"
    else
      warn "configuration service: health check failed"
    fi
  fi
  
  # Check steering service
  local steering_pod=$(kubectl get pods -n "$NAMESPACE" -l app=client-oppy-steering -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
  if [[ -n "$steering_pod" ]]; then
    if kubectl exec -n "$NAMESPACE" "$steering_pod" -- wget -q -O- http://localhost:6020/-/alive >/dev/null 2>&1; then
      ok "steering service: healthy"
    else
      warn "steering service: health check failed"
    fi
  fi
}

seed_data() {
  if [[ "$SKIP_SEED" == "true" ]]; then
    info "Skipping data seeding (--skip-seed)"
    return
  fi
  
  log "Seeding test data..."
  
  if [[ -x "$FRAMEWORK_ROOT/scripts/seed-data.sh" ]]; then
    cd "$FRAMEWORK_ROOT"
    ./scripts/seed-data.sh --env minikube-cluster 2>>"$DEPLOY_LOG" || warn "Seeding had warnings"
    ok "Test data seeded"
  else
    info "seed-data.sh not found, skipping"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  CLIENT-OPPY MINIKUBE SETUP COMPLETE${NC}"
  echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  echo -e "${CYAN}Pods:${NC}"
  kubectl get pods -n "$NAMESPACE" --no-headers | sed 's/^/  /'
  echo ""
  
  echo -e "${CYAN}Services:${NC}"
  kubectl get svc -n "$NAMESPACE" --no-headers | sed 's/^/  /'
  echo ""
  
  echo -e "${CYAN}Log file:${NC}"
  echo "  $DEPLOY_LOG"
  echo ""
  
  echo -e "${CYAN}Run Tests:${NC}"
  echo "  ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster"
  echo ""
  echo "  # With background load:"
  echo "  ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster --with-load"
  echo ""
  
  echo -e "${CYAN}Management:${NC}"
  echo "  ./scripts/setup-client-oppy-minikube.sh --status     # Check status"
  echo "  ./scripts/setup-client-oppy-minikube.sh --teardown   # Destroy environment"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

main() {
  mkdir -p "$LOG_DIR"
  
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║          CLIENT-OPPY MINIKUBE ENVIRONMENT SETUP              ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # Handle special modes first
  [[ "$STATUS_ONLY" == "true" ]] && show_status
  [[ "$TEARDOWN" == "true" ]] && teardown
  
  check_resources
  check_prerequisites
  
  # Infrastructure only mode
  if [[ "$INFRA_ONLY" == "true" ]]; then
    start_infrastructure
    ok "Infrastructure ready. Start services with: $0 --deploy-only"
    exit 0
  fi
  
  # Full setup
  [[ "$DEPLOY_ONLY" == "false" ]] && start_infrastructure
  
  start_minikube
  pull_and_load_images
  deploy_services
  install_k6_operator
  deploy_toxiproxy
  wait_for_services
  verify_health
  seed_data
  
  print_summary
  ok "Setup complete!"
}

main
