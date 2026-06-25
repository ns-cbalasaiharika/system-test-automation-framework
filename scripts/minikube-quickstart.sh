#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Minikube Quick Start — Full Stack Deployment
# Deploys real client-oppy services with dependencies for system testing
#
# Usage:
#   ./scripts/minikube-quickstart.sh                    # Full setup + run BL-01
#   ./scripts/minikube-quickstart.sh --deploy-only      # Deploy stack only
#   ./scripts/minikube-quickstart.sh --run-only         # Skip deploy, run test
#   ./scripts/minikube-quickstart.sh --scenario bl02    # Run specific scenario
#   ./scripts/minikube-quickstart.sh --teardown         # Destroy cluster
#
# Prerequisites:
#   - Docker login to artifactory-rd.netskope.io
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MINIKUBE_DIR="$FRAMEWORK_ROOT/k8s/minikube"

# Defaults
DEPLOY_ONLY=false
RUN_ONLY=false
TEARDOWN=false
SCENARIO="bl01"
PROFILE="smoke"
NAMESPACE="client-oppy"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[minikube]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $*"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --deploy-only)   DEPLOY_ONLY=true; shift ;;
    --run-only)      RUN_ONLY=true; shift ;;
    --teardown)      TEARDOWN=true; shift ;;
    --scenario|-s)   SCENARIO="$2"; shift 2 ;;
    --profile|-p)    PROFILE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --deploy-only       Deploy stack only, don't run tests"
      echo "  --run-only          Skip deployment, just run tests"
      echo "  --scenario, -s ID   Scenario to run (default: bl01)"
      echo "  --profile, -p NAME  Load profile: smoke|load|stress (default: smoke)"
      echo "  --teardown          Destroy minikube cluster"
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# ═══════════════════════════════════════════════════════════════════════════════
# PREREQUISITE CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

check_prerequisites() {
  log "Checking prerequisites..."
  
  command -v minikube >/dev/null 2>&1 || fail "minikube not installed (brew install minikube)"
  command -v kubectl >/dev/null 2>&1 || fail "kubectl not installed (brew install kubectl)"
  command -v helm >/dev/null 2>&1 || fail "helm not installed (brew install helm)"
  command -v helmfile >/dev/null 2>&1 || fail "helmfile not installed (brew install helmfile)"
  command -v k6 >/dev/null 2>&1 || fail "k6 not installed (brew install k6)"
  
  # Check docker login
  if ! docker pull artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-configuration:latest >/dev/null 2>&1; then
    warn "Cannot pull from artifactory-rd.netskope.io"
    warn "Run: docker login artifactory-rd.netskope.io"
  fi
  
  ok "All prerequisites available"
}

# ═══════════════════════════════════════════════════════════════════════════════
# TEARDOWN
# ═══════════════════════════════════════════════════════════════════════════════

teardown_cluster() {
  log "Tearing down minikube cluster..."
  minikube delete 2>/dev/null || true
  ok "Minikube cluster destroyed"
  exit 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# MINIKUBE SETUP
# ═══════════════════════════════════════════════════════════════════════════════

setup_minikube() {
  log "Setting up minikube cluster..."
  
  if minikube status >/dev/null 2>&1; then
    ok "Minikube already running"
  else
    log "Starting minikube with 6 CPUs, 12GB memory..."
    minikube start \
      --cpus=6 \
      --memory=12288 \
      --driver=docker \
      --addons=metrics-server
    ok "Minikube started"
  fi
  
  # Create namespace
  kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  
  # Create image pull secret if docker config exists
  if [[ -f ~/.docker/config.json ]]; then
    log "Creating image pull secret from docker config..."
    kubectl create secret generic artifactory-creds \
      --from-file=.dockerconfigjson=$HOME/.docker/config.json \
      --type=kubernetes.io/dockerconfigjson \
      -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# DEPLOY STACK
# ═══════════════════════════════════════════════════════════════════════════════

deploy_stack() {
  log "Deploying client-oppy stack..."
  
  cd "$MINIKUBE_DIR"
  
  # Add helm repos
  log "Adding Helm repositories..."
  helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
  helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
  helm repo update
  
  # Deploy infrastructure first
  log "Deploying infrastructure (MariaDB, Redis)..."
  helmfile sync -l tier=infra --concurrency 1
  
  # Deploy client-oppy services
  log "Deploying client-oppy services..."
  helmfile sync -l tier=app --concurrency 1
  
  ok "Stack deployed"
}

# ═══════════════════════════════════════════════════════════════════════════════
# WAIT FOR SERVICES
# ═══════════════════════════════════════════════════════════════════════════════

wait_for_services() {
  log "Waiting for services to be ready..."
  
  local deployments=(
    "client-oppy-configuration"
    "client-oppy-orchestrator"
    "client-oppy-steering"
  )
  
  for dep in "${deployments[@]}"; do
    log "Waiting for $dep..."
    kubectl rollout status deployment/"$dep" -n "$NAMESPACE" --timeout=300s || warn "$dep not ready"
  done
  
  ok "Services ready"
}

# ═══════════════════════════════════════════════════════════════════════════════
# BUNDLE SCENARIOS
# ═══════════════════════════════════════════════════════════════════════════════

bundle_scenarios() {
  log "Bundling k6 scenarios..."
  
  cd "$FRAMEWORK_ROOT"
  
  if [[ ! -d "node_modules" ]]; then
    log "Installing npm dependencies..."
    npm install
  fi
  
  npm run bundle
  ok "Scenarios bundled"
}

# ═══════════════════════════════════════════════════════════════════════════════
# RUN TEST
# ═══════════════════════════════════════════════════════════════════════════════

run_test() {
  log "Running $SCENARIO ($PROFILE) against minikube..."
  
  cd "$FRAMEWORK_ROOT"
  
  # Port-forward the configuration service
  log "Port-forwarding services..."
  kubectl port-forward svc/client-oppy-configuration 6010:6010 -n "$NAMESPACE" > /tmp/pf-config.log 2>&1 &
  local PF_PID=$!
  sleep 5
  
  # Verify connection
  if ! curl -s http://localhost:6010/-/alive >/dev/null 2>&1; then
    kill $PF_PID 2>/dev/null || true
    fail "Cannot connect to client-oppy-configuration service"
  fi
  
  ok "Port-forward established"
  
  # Run the test
  local EXIT_CODE=0
  ./scripts/run.sh --scenario "$SCENARIO" --profile "$PROFILE" --env local || EXIT_CODE=$?
  
  # Cleanup
  kill $PF_PID 2>/dev/null || true
  
  return $EXIT_CODE
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRINT STATUS
# ═══════════════════════════════════════════════════════════════════════════════

print_status() {
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  Minikube Stack Status${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  kubectl get pods -n "$NAMESPACE"
  
  echo ""
  info "Port-forward and run tests:"
  echo "  kubectl port-forward svc/client-oppy-configuration 6010:6010 -n $NAMESPACE &"
  echo "  ./scripts/run.sh --scenario bl01 --profile smoke --env local"
  echo ""
  
  info "Teardown:"
  echo "  ./scripts/minikube-quickstart.sh --teardown"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

main() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║     Minikube Full Stack — client-oppy System Testing        ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  check_prerequisites
  
  if [[ "$TEARDOWN" == "true" ]]; then
    teardown_cluster
  fi
  
  if [[ "$RUN_ONLY" == "false" ]]; then
    setup_minikube
    deploy_stack
    wait_for_services
    bundle_scenarios
  fi
  
  if [[ "$DEPLOY_ONLY" == "true" ]]; then
    print_status
    ok "Deployment complete"
    exit 0
  fi
  
  # Run test
  local EXIT_CODE=0
  run_test || EXIT_CODE=$?
  
  echo ""
  if [[ $EXIT_CODE -eq 0 ]]; then
    ok "Scenario $SCENARIO ($PROFILE) — PASSED"
  else
    fail "Scenario $SCENARIO ($PROFILE) — FAILED (exit code: $EXIT_CODE)"
  fi
  
  return $EXIT_CODE
}

main
