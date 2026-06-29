#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# DB FAILOVER FAULT INJECTION
# 
# Simulates MariaDB/Galera failover scenarios by killing RW or RO nodes.
#
# Usage:
#   ./scripts/fault-inject/db-failover.sh --kill-rw      # Kill primary (RW) node
#   ./scripts/fault-inject/db-failover.sh --restore-rw   # Wait for RW to recover
#   ./scripts/fault-inject/db-failover.sh --kill-ro      # Kill replica (RO) node
#   ./scripts/fault-inject/db-failover.sh --restore-ro   # Wait for RO to recover
#
# Options:
#   --namespace, -n    Kubernetes namespace (default: client-oppy)
#   --no-wait          Don't wait for pod to become ready after action
# =============================================================================

# Defaults
NAMESPACE="${NAMESPACE:-client-oppy}"
RW_LABEL="${RW_LABEL:-app=mariadb,role=primary}"
RO_LABEL="${RO_LABEL:-app=mariadb,role=replica}"
GRACE_PERIOD="${GRACE_PERIOD:-0}"
WAIT_READY="true"
ACTION=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[fault-inject]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[fault-inject]${NC} $1"; }
log_error() { echo -e "${RED}[fault-inject]${NC} $1"; }

show_help() {
    echo "Usage: $0 <action> [options]"
    echo ""
    echo "Actions:"
    echo "  --kill-rw       Kill the primary (RW) MariaDB node"
    echo "  --restore-rw    Wait for primary (RW) node to recover"
    echo "  --kill-ro       Kill the replica (RO) MariaDB node"
    echo "  --restore-ro    Wait for replica (RO) node to recover"
    echo ""
    echo "Options:"
    echo "  --namespace, -n  Kubernetes namespace (default: client-oppy)"
    echo "  --no-wait        Don't wait for pod to become ready"
    echo "  --help, -h       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --kill-rw"
    echo "  $0 --kill-rw --namespace my-namespace"
    echo "  $0 --restore-rw"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --kill-rw)
            ACTION="kill-rw"
            shift
            ;;
        --restore-rw)
            ACTION="restore-rw"
            shift
            ;;
        --kill-ro)
            ACTION="kill-ro"
            shift
            ;;
        --restore-ro)
            ACTION="restore-ro"
            shift
            ;;
        --namespace|-n)
            NAMESPACE="$2"
            shift 2
            ;;
        --no-wait)
            WAIT_READY="false"
            shift
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

if [[ -z "$ACTION" ]]; then
    log_error "No action specified"
    show_help
    exit 1
fi

kill_pod() {
    local label="$1"
    local role="$2"
    
    log_info "Killing MariaDB $role node (namespace=$NAMESPACE, label=$label)..."
    
    local pods
    pods=$(kubectl get pods -l "$label" -n "$NAMESPACE" -o name 2>/dev/null || true)
    
    if [[ -z "$pods" ]]; then
        log_warn "No pods found with label '$label' in namespace '$NAMESPACE'"
        log_warn "Checking for any MariaDB pods..."
        kubectl get pods -n "$NAMESPACE" -l app=mariadb 2>/dev/null || true
        return 1
    fi
    
    kubectl delete pod -l "$label" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
    log_info "MariaDB $role node killed."
}

wait_for_ready() {
    local label="$1"
    local role="$2"
    
    if [[ "$WAIT_READY" == "true" ]]; then
        log_info "Waiting for MariaDB $role node to become ready..."
        sleep 5
        if kubectl wait --for=condition=ready pod -l "$label" -n "$NAMESPACE" --timeout=300s 2>/dev/null; then
            log_info "MariaDB $role node is ready."
        else
            log_warn "Timeout waiting for $role node. Check pod status manually."
        fi
    fi
}

case "$ACTION" in
    kill-rw)
        kill_pod "$RW_LABEL" "primary (RW)"
        ;;
    restore-rw)
        wait_for_ready "$RW_LABEL" "primary (RW)"
        ;;
    kill-ro)
        kill_pod "$RO_LABEL" "replica (RO)"
        ;;
    restore-ro)
        wait_for_ready "$RO_LABEL" "replica (RO)"
        ;;
esac

log_info "Done."
