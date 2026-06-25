#!/bin/bash
# =============================================================================
# CLUSTER LOAD ORCHESTRATOR
# Manages background load on the Rancher performance cluster
#
# Usage:
#   ./load-cluster.sh start --profile p95 --env rancher
#   ./load-cluster.sh stop
#   ./load-cluster.sh status
#   ./load-cluster.sh scale --rps 200
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
PID_FILE="${ROOT_DIR}/.cluster-load.pid"
LOG_FILE="${ROOT_DIR}/results/cluster-load.log"
STATE_FILE="${ROOT_DIR}/.cluster-load.state"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_status() { echo -e "${BLUE}[STATUS]${NC} $1"; }

# Default values
PROFILE="p95"
ENV="rancher"
SERVICES=""
EXCLUDE_SERVICES=""
PARALLELISM=4
K8S_MODE=false

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --profile)
                PROFILE="$2"
                shift 2
                ;;
            --env)
                ENV="$2"
                shift 2
                ;;
            --services)
                SERVICES="$2"
                shift 2
                ;;
            --exclude)
                EXCLUDE_SERVICES="$2"
                shift 2
                ;;
            --parallelism)
                PARALLELISM="$2"
                shift 2
                ;;
            --k8s)
                K8S_MODE=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Check prerequisites
check_prerequisites() {
    if ! command -v k6 &> /dev/null; then
        log_error "k6 is not installed"
        exit 1
    fi
    
    if [ "$K8S_MODE" = true ]; then
        if ! command -v kubectl &> /dev/null; then
            log_error "kubectl is not installed"
            exit 1
        fi
    fi
    
    # Check if bundle exists
    if [ ! -f "${ROOT_DIR}/dist/background/cluster-load-generator.bundle.js" ]; then
        log_warn "Bundle not found. Building..."
        cd "$ROOT_DIR" && npm run bundle
    fi
}

# Start cluster load (local mode)
start_local() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_error "Cluster load is already running (PID: $pid)"
            log_info "Use './load-cluster.sh stop' to stop it first"
            exit 1
        fi
    fi
    
    log_info "Starting cluster load..."
    log_info "  Profile: $PROFILE"
    log_info "  Environment: $ENV"
    [ -n "$SERVICES" ] && log_info "  Services: $SERVICES"
    [ -n "$EXCLUDE_SERVICES" ] && log_info "  Excluded: $EXCLUDE_SERVICES"
    
    mkdir -p "${ROOT_DIR}/results"
    
    # Build environment variables
    local env_vars="LOAD_PROFILE=$PROFILE ENV=$ENV"
    [ -n "$SERVICES" ] && env_vars="$env_vars SERVICES=$SERVICES"
    [ -n "$EXCLUDE_SERVICES" ] && env_vars="$env_vars EXCLUDE_SERVICES=$EXCLUDE_SERVICES"
    
    # Start k6 in background
    cd "$ROOT_DIR"
    env $env_vars k6 run \
        --out json="${ROOT_DIR}/results/cluster-load-metrics.json" \
        dist/background/cluster-load-generator.bundle.js \
        > "$LOG_FILE" 2>&1 &
    
    local pid=$!
    echo "$pid" > "$PID_FILE"
    
    # Save state
    cat > "$STATE_FILE" << EOF
PROFILE=$PROFILE
ENV=$ENV
SERVICES=$SERVICES
EXCLUDE_SERVICES=$EXCLUDE_SERVICES
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PID=$pid
EOF
    
    sleep 2
    
    if kill -0 "$pid" 2>/dev/null; then
        log_info "Cluster load started successfully (PID: $pid)"
        log_info "Log file: $LOG_FILE"
        log_info "Metrics: ${ROOT_DIR}/results/cluster-load-metrics.json"
    else
        log_error "Failed to start cluster load. Check log file: $LOG_FILE"
        rm -f "$PID_FILE" "$STATE_FILE"
        exit 1
    fi
}

# Start cluster load (Kubernetes mode)
start_k8s() {
    log_info "Starting cluster load in Kubernetes..."
    log_info "  Profile: $PROFILE"
    log_info "  Environment: $ENV"
    log_info "  Parallelism: $PARALLELISM"
    
    # Create ConfigMap with the test script
    kubectl create configmap cluster-load-script \
        --from-file=test.js="${ROOT_DIR}/dist/background/cluster-load-generator.bundle.js" \
        -n k6-perf-testing \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create ConfigMap with config files
    kubectl create configmap cluster-load-config \
        --from-file="${ROOT_DIR}/dist/config/" \
        -n k6-perf-testing \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create TestRun
    cat <<EOF | kubectl apply -f -
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: cluster-load-generator
  namespace: k6-perf-testing
spec:
  parallelism: $PARALLELISM
  script:
    configMap:
      name: cluster-load-script
      file: test.js
  runner:
    env:
      - name: LOAD_PROFILE
        value: "$PROFILE"
      - name: ENV
        value: "$ENV"
EOF

    # Save state
    cat > "$STATE_FILE" << EOF
PROFILE=$PROFILE
ENV=$ENV
K8S_MODE=true
PARALLELISM=$PARALLELISM
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    
    log_info "Cluster load TestRun created"
    log_info "Monitor with: kubectl get testrun cluster-load-generator -n k6-perf-testing -w"
}

# Stop cluster load
stop_load() {
    log_info "Stopping cluster load..."
    
    if [ -f "$STATE_FILE" ]; then
        source "$STATE_FILE"
        
        if [ "$K8S_MODE" = "true" ]; then
            kubectl delete testrun cluster-load-generator -n k6-perf-testing --ignore-not-found
            log_info "Kubernetes TestRun deleted"
        fi
    fi
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Sending SIGTERM to process $pid..."
            kill -TERM "$pid"
            
            # Wait for graceful shutdown (up to 30 seconds)
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 30 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "Process did not terminate gracefully, sending SIGKILL..."
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            log_info "Cluster load stopped"
        else
            log_warn "Process $pid is not running"
        fi
        rm -f "$PID_FILE"
    else
        log_warn "No PID file found"
    fi
    
    rm -f "$STATE_FILE"
    log_info "Cluster load cleanup complete"
}

# Get status
get_status() {
    log_status "Cluster Load Status"
    echo "────────────────────────────────────────"
    
    if [ -f "$STATE_FILE" ]; then
        source "$STATE_FILE"
        echo "Profile:     $PROFILE"
        echo "Environment: $ENV"
        echo "Started:     $START_TIME"
        
        if [ "$K8S_MODE" = "true" ]; then
            echo "Mode:        Kubernetes"
            echo ""
            kubectl get testrun cluster-load-generator -n k6-perf-testing 2>/dev/null || echo "TestRun not found"
        else
            echo "Mode:        Local"
            if [ -f "$PID_FILE" ]; then
                local pid=$(cat "$PID_FILE")
                if kill -0 "$pid" 2>/dev/null; then
                    echo "Status:      ${GREEN}RUNNING${NC} (PID: $pid)"
                    
                    # Show resource usage
                    if command -v ps &> /dev/null; then
                        local stats=$(ps -p "$pid" -o %cpu,%mem,etime 2>/dev/null | tail -1)
                        echo "Resources:   $stats"
                    fi
                else
                    echo "Status:      ${RED}STOPPED${NC}"
                fi
            else
                echo "Status:      ${RED}STOPPED${NC}"
            fi
        fi
        
        [ -n "$SERVICES" ] && echo "Services:    $SERVICES"
        [ -n "$EXCLUDE_SERVICES" ] && echo "Excluded:    $EXCLUDE_SERVICES"
    else
        echo "Status:      ${YELLOW}NOT STARTED${NC}"
    fi
    
    echo "────────────────────────────────────────"
}

# Show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        log_error "Log file not found: $LOG_FILE"
    fi
}

# Main
main() {
    local command="${1:-help}"
    shift || true
    
    parse_args "$@"
    
    case "$command" in
        start)
            check_prerequisites
            if [ "$K8S_MODE" = true ]; then
                start_k8s
            else
                start_local
            fi
            ;;
        stop)
            stop_load
            ;;
        status)
            get_status
            ;;
        logs)
            show_logs
            ;;
        restart)
            stop_load
            sleep 2
            check_prerequisites
            if [ "$K8S_MODE" = true ]; then
                start_k8s
            else
                start_local
            fi
            ;;
        help|*)
            echo "Cluster Load Orchestrator"
            echo ""
            echo "Usage: $0 <command> [options]"
            echo ""
            echo "Commands:"
            echo "  start     Start background cluster load"
            echo "  stop      Stop background cluster load"
            echo "  status    Show current load status"
            echo "  logs      Tail the load generator logs"
            echo "  restart   Stop and restart cluster load"
            echo ""
            echo "Options:"
            echo "  --profile <name>     Load profile (idle, light, p50, p95, p99, stress, soak)"
            echo "  --env <name>         Environment config (rancher, minikube, local)"
            echo "  --services <list>    Comma-separated list of services to load"
            echo "  --exclude <list>     Comma-separated list of services to exclude"
            echo "  --parallelism <n>    K8s parallelism (default: 4)"
            echo "  --k8s                Run in Kubernetes mode"
            echo ""
            echo "Examples:"
            echo "  $0 start --profile p95 --env rancher"
            echo "  $0 start --profile stress --k8s --parallelism 8"
            echo "  $0 start --profile p95 --exclude provisioner-core,cert-service"
            echo "  $0 stop"
            echo "  $0 status"
            ;;
    esac
}

main "$@"
