#!/bin/bash
# =============================================================================
# K6-OPERATOR TEST RUNNER
# 
# Runs k6 tests inside Kubernetes using k6-operator.
# Supports background load generation with manual or automatic control.
#
# Usage:
#   # Run scenario (no load)
#   ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster
#
#   # Run scenario with auto load (starts load, runs test, stops load)
#   ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster --with-load light
#
#   # Manual load control
#   ./scripts/k6-operator-test.sh start-load light --env minikube-cluster
#   ./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster
#   ./scripts/k6-operator-test.sh stop-load
#
#   # Check load status
#   ./scripts/k6-operator-test.sh load-status
#
# Prerequisites:
#   - kubectl configured for target cluster
#   - k6-operator installed (script will install if missing)
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Default values
SCENARIO=""
ENV="minikube-cluster"
PROFILE="smoke"
LOAD_PROFILE=""
NAMESPACE="k6-tests"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMMAND=""

# Show help
show_help() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  --scenario, -s    Run a test scenario"
    echo "  start-load        Start background load (manual control)"
    echo "  stop-load         Stop background load"
    echo "  load-status       Check if background load is running"
    echo ""
    echo "Options:"
    echo "  --scenario, -s    Scenario ID (e.g., bl01, bl02)"
    echo "  --env, -e         Environment (default: minikube-cluster)"
    echo "  --profile, -p     Load profile for scenario (default: smoke)"
    echo "  --with-load, -l   Auto load: start before test, stop after (light|p50|p95|p99|stress)"
    echo "  --namespace, -n   Kubernetes namespace (default: k6-tests)"
    echo ""
    echo "Examples:"
    echo ""
    echo "  # All-in-one (auto start/stop load):"
    echo "  $0 --scenario bl01 --env minikube-cluster --with-load light"
    echo ""
    echo "  # Manual load control:"
    echo "  $0 start-load light --env minikube-cluster"
    echo "  $0 load-status"
    echo "  $0 --scenario bl01 --env minikube-cluster"
    echo "  $0 --scenario bl02 --env minikube-cluster"
    echo "  $0 stop-load"
    echo ""
}

# Check for subcommand first
if [[ $# -gt 0 ]]; then
    case $1 in
        start-load)
            COMMAND="start-load"
            shift
            if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
                LOAD_PROFILE="$1"
                shift
            fi
            ;;
        stop-load)
            COMMAND="stop-load"
            shift
            ;;
        load-status)
            COMMAND="load-status"
            shift
            ;;
        --help|-h|help)
            show_help
            exit 0
            ;;
    esac
fi

# Parse remaining arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --scenario|-s)
            SCENARIO="$2"
            COMMAND="run-scenario"
            shift 2
            ;;
        --env|-e)
            ENV="$2"
            shift 2
            ;;
        --profile|-p)
            PROFILE="$2"
            shift 2
            ;;
        --with-load|-l)
            LOAD_PROFILE="$2"
            shift 2
            ;;
        --namespace|-n)
            NAMESPACE="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Find scenario bundle
find_scenario_bundle() {
    local scenario_id="$1"
    local bundle_path=""
    
    bundle_path=$(find "$PROJECT_ROOT/dist" -name "*${scenario_id}*.bundle.js" 2>/dev/null | head -1)
    
    if [[ -z "$bundle_path" ]]; then
        log_error "No bundle found for scenario: $scenario_id"
        log_info "Run 'npm run bundle' first"
        exit 1
    fi
    
    echo "$bundle_path"
}

# Install k6-operator if not present
ensure_k6_operator() {
    log_info "Checking k6-operator installation..."
    
    if kubectl get deployment k6-operator-controller-manager -n k6-operator-system &>/dev/null; then
        log_success "k6-operator is installed"
    else
        log_info "Installing k6-operator..."
        helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
        helm repo update
        helm install k6-operator grafana/k6-operator -n k6-operator-system --create-namespace
        
        log_info "Waiting for k6-operator to be ready..."
        kubectl wait --for=condition=available deployment/k6-operator-controller-manager \
            -n k6-operator-system --timeout=120s
        log_success "k6-operator installed"
    fi
}

# Create namespace and ConfigMaps
setup_configmaps() {
    log_info "Setting up ConfigMaps..."
    
    kubectl create namespace "$NAMESPACE" 2>/dev/null || true
    
    if [[ -f "$PROJECT_ROOT/config/environments/${ENV}.yaml" ]]; then
        kubectl create configmap k6-env-config \
            --from-file="${ENV}.yaml=$PROJECT_ROOT/config/environments/${ENV}.yaml" \
            -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    else
        log_error "Environment config not found: config/environments/${ENV}.yaml"
        exit 1
    fi
    
    kubectl create configmap k6-profiles-config \
        --from-file=smoke.yaml="$PROJECT_ROOT/config/profiles/smoke.yaml" \
        --from-file=load.yaml="$PROJECT_ROOT/config/profiles/load.yaml" \
        -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap k6-cluster-load-config \
        --from-file=cluster-services.yaml="$PROJECT_ROOT/config/cluster-load/cluster-services.yaml" \
        --from-file=load-profiles.yaml="$PROJECT_ROOT/config/cluster-load/load-profiles.yaml" \
        -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "ConfigMaps ready"
}

# Upload scenario bundle as ConfigMap
upload_scenario() {
    local bundle_path="$1"
    local configmap_name="$2"
    
    log_info "Uploading scenario bundle: $(basename "$bundle_path")"
    
    kubectl create configmap "$configmap_name" \
        --from-file=script.js="$bundle_path" \
        -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
}

# Start background load
do_start_load() {
    local load_profile="$1"
    
    echo ""
    echo "=========================================="
    echo "  STARTING CLUSTER LOAD"
    echo "=========================================="
    echo ""
    echo "  Profile:     $load_profile"
    echo "  Environment: $ENV"
    echo "  Namespace:   $NAMESPACE"
    echo ""
    
    # Check if already running
    if kubectl get testrun cluster-load -n "$NAMESPACE" &>/dev/null; then
        log_warn "Background load is already running"
        log_info "Use '$0 stop-load' to stop it first, or '$0 load-status' to check"
        exit 1
    fi
    
    ensure_k6_operator
    setup_configmaps
    
    log_info "Starting background load (profile: $load_profile)..."
    
    upload_scenario "$PROJECT_ROOT/dist/scenarios/background/cluster-load-generator.bundle.js" "k6-cluster-load"
    
    cat <<EOF | kubectl apply -f -
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: cluster-load
  namespace: $NAMESPACE
spec:
  parallelism: 1
  script:
    configMap:
      name: k6-cluster-load
      file: script.js
  arguments: >-
    --env LOAD_PROFILE=$load_profile
    --env ENV=$ENV
  runner:
    image: grafana/k6:latest
    resources:
      limits:
        cpu: "500m"
        memory: "256Mi"
    volumes:
      - name: cluster-load-config
        configMap:
          name: k6-cluster-load-config
      - name: env-config
        configMap:
          name: k6-env-config
    volumeMounts:
      - name: cluster-load-config
        mountPath: /config/cluster-load
      - name: env-config
        mountPath: /config/environments
EOF

    log_info "Waiting for load generator to start..."
    sleep 15
    
    if kubectl get pods -n "$NAMESPACE" -l k6_cr=cluster-load 2>/dev/null | grep -q "Running"; then
        log_success "Background load is now running!"
        echo ""
        echo "=========================================="
        echo "  CLUSTER IS NOW LOADED"
        echo "=========================================="
        echo ""
        echo "  You can now run your test scenarios:"
        echo "    $0 --scenario bl01 --env $ENV"
        echo "    $0 --scenario bl02 --env $ENV"
        echo ""
        echo "  When done, stop the load:"
        echo "    $0 stop-load"
        echo ""
        echo "  Check load status:"
        echo "    $0 load-status"
        echo ""
        echo "=========================================="
    else
        log_warn "Load generator may not have started properly"
        log_info "Check with: kubectl get pods -n $NAMESPACE -l k6_cr=cluster-load"
    fi
}

# Stop background load
do_stop_load() {
    echo ""
    echo "=========================================="
    echo "  STOPPING CLUSTER LOAD"
    echo "=========================================="
    echo ""
    
    if kubectl get testrun cluster-load -n "$NAMESPACE" &>/dev/null; then
        log_info "Stopping background load..."
        kubectl delete testrun cluster-load -n "$NAMESPACE"
        log_success "Background load stopped"
        echo ""
        echo "=========================================="
        echo "  CLUSTER RETURNED TO NORMAL"
        echo "=========================================="
    else
        log_info "No background load running"
    fi
}

# Show load status
do_load_status() {
    echo ""
    echo "=========================================="
    echo "  CLUSTER LOAD STATUS"
    echo "=========================================="
    echo ""
    
    if kubectl get testrun cluster-load -n "$NAMESPACE" &>/dev/null; then
        local stage=$(kubectl get testrun cluster-load -n "$NAMESPACE" -o jsonpath='{.status.stage}' 2>/dev/null || echo "unknown")
        log_success "Background load is RUNNING (stage: $stage)"
        echo ""
        echo "Pods:"
        kubectl get pods -n "$NAMESPACE" -l k6_cr=cluster-load 2>/dev/null || true
        echo ""
        echo "To stop: $0 stop-load"
    else
        log_info "No background load running"
        echo ""
        echo "To start: $0 start-load <profile> --env <environment>"
        echo "Profiles: light, p50, p95, p99, stress"
    fi
    echo ""
}

# Run scenario test
run_scenario() {
    local scenario_id="$1"
    local bundle_path="$2"
    
    log_info "Running scenario: $scenario_id (env: $ENV, profile: $PROFILE)"
    
    upload_scenario "$bundle_path" "k6-scenario-$scenario_id"
    
    local workload_configmap=""
    if [[ -f "$PROJECT_ROOT/config/scenarios/client-oppy/${scenario_id}-golden-baseline.yaml" ]]; then
        kubectl create configmap k6-scenarios-config \
            --from-file="${scenario_id}-golden-baseline.yaml=$PROJECT_ROOT/config/scenarios/client-oppy/${scenario_id}-golden-baseline.yaml" \
            -n "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
        workload_configmap="k6-scenarios-config"
    fi
    
    cat <<EOF | kubectl apply -f -
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: scenario-$scenario_id
  namespace: $NAMESPACE
spec:
  parallelism: 1
  script:
    configMap:
      name: k6-scenario-$scenario_id
      file: script.js
  arguments: >-
    --env ENV=$ENV
    --env PROFILE=$PROFILE
  runner:
    image: grafana/k6:latest
    resources:
      limits:
        cpu: "500m"
        memory: "256Mi"
    volumes:
      - name: env-config
        configMap:
          name: k6-env-config
      - name: profiles-config
        configMap:
          name: k6-profiles-config
      - name: scenarios-config
        configMap:
          name: ${workload_configmap:-k6-profiles-config}
    volumeMounts:
      - name: env-config
        mountPath: /config/environments
      - name: profiles-config
        mountPath: /config/profiles
      - name: scenarios-config
        mountPath: /config/scenarios/client-oppy
EOF

    log_info "Waiting for scenario to complete..."
    
    local max_wait=300
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        local stage=$(kubectl get testrun "scenario-$scenario_id" -n "$NAMESPACE" -o jsonpath='{.status.stage}' 2>/dev/null || echo "pending")
        
        if [[ "$stage" == "finished" ]] || [[ "$stage" == "error" ]]; then
            break
        fi
        
        sleep 5
        waited=$((waited + 5))
        echo -n "."
    done
    echo ""
    
    local pod_name=$(kubectl get pods -n "$NAMESPACE" -l "k6_cr=scenario-$scenario_id" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null | head -1)
    
    if [[ -n "$pod_name" ]]; then
        echo ""
        echo "════════════════════════════════════════════════════════════"
        kubectl logs -n "$NAMESPACE" "$pod_name" 2>/dev/null | grep -A 100 "TEST RESULT" | head -60 || \
            kubectl logs -n "$NAMESPACE" "$pod_name" 2>/dev/null | tail -30
        echo "════════════════════════════════════════════════════════════"
    fi
    
    kubectl delete testrun "scenario-$scenario_id" -n "$NAMESPACE" 2>/dev/null || true
}

# Main execution
main() {
    case "$COMMAND" in
        start-load)
            if [[ -z "$LOAD_PROFILE" ]]; then
                log_error "Load profile required. Usage: $0 start-load <profile>"
                echo "Profiles: light, p50, p95, p99, stress"
                exit 1
            fi
            do_start_load "$LOAD_PROFILE"
            ;;
        stop-load)
            do_stop_load
            ;;
        load-status)
            do_load_status
            ;;
        run-scenario)
            if [[ -z "$SCENARIO" ]]; then
                log_error "Scenario is required. Use --scenario <id>"
                exit 1
            fi
            
            echo ""
            echo "╔══════════════════════════════════════════════════════════════════════╗"
            echo "║                    K6-OPERATOR TEST RUNNER                           ║"
            echo "╚══════════════════════════════════════════════════════════════════════╝"
            echo ""
            echo "  Scenario:    $SCENARIO"
            echo "  Environment: $ENV"
            echo "  Profile:     $PROFILE"
            [[ -n "$LOAD_PROFILE" ]] && echo "  Load:        $LOAD_PROFILE (auto)"
            echo ""
            
            local bundle_path
            bundle_path=$(find_scenario_bundle "$SCENARIO")
            log_info "Found bundle: $(basename "$bundle_path")"
            
            ensure_k6_operator
            setup_configmaps
            
            # Start load if requested (auto mode)
            if [[ -n "$LOAD_PROFILE" ]]; then
                do_start_load "$LOAD_PROFILE"
                sleep 10
            fi
            
            run_scenario "$SCENARIO" "$bundle_path"
            
            # Stop load if it was started (auto mode)
            if [[ -n "$LOAD_PROFILE" ]]; then
                do_stop_load
            fi
            
            echo ""
            log_success "Test complete!"
            ;;
        *)
            show_help
            exit 1
            ;;
    esac
}

main
