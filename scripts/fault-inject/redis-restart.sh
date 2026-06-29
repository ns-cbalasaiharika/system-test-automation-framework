#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# REDIS FAULT INJECTION
# 
# Simulates Redis failures (cache loss, unavailability).
#
# Usage:
#   ./scripts/fault-inject/redis-restart.sh --kill      # Kill Redis pod
#   ./scripts/fault-inject/redis-restart.sh --restore   # Wait for Redis ready
#   ./scripts/fault-inject/redis-restart.sh --flush     # Flush Redis cache
#
# Options:
#   --namespace, -n    Kubernetes namespace (default: client-oppy)
#   --no-wait          Don't wait for pod to become ready
# =============================================================================

# Defaults
NAMESPACE="${NAMESPACE:-client-oppy}"
REDIS_LABEL="${REDIS_LABEL:-app=redis}"
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
    echo "  --kill          Kill Redis pod (simulates failure)"
    echo "  --restore       Wait for Redis pod to be ready"
    echo "  --flush         Flush all Redis cache data"
    echo ""
    echo "Options:"
    echo "  --namespace, -n  Kubernetes namespace (default: client-oppy)"
    echo "  --no-wait        Don't wait for pod to become ready"
    echo "  --help, -h       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --kill"
    echo "  $0 --restore"
    echo "  $0 --flush"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --kill)
            ACTION="kill"
            shift
            ;;
        --restore)
            ACTION="restore"
            shift
            ;;
        --flush)
            ACTION="flush"
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

kill_redis() {
    log_info "Killing Redis pod (namespace=$NAMESPACE, label=$REDIS_LABEL)..."
    
    local pods
    pods=$(kubectl get pods -l "$REDIS_LABEL" -n "$NAMESPACE" -o name 2>/dev/null || true)
    
    if [[ -z "$pods" ]]; then
        log_warn "No Redis pods found with label '$REDIS_LABEL' in namespace '$NAMESPACE'"
        return 1
    fi
    
    kubectl delete pod -l "$REDIS_LABEL" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
    log_info "Redis pod deleted. Kubernetes will restart it."
    
    if [[ "$WAIT_READY" == "true" ]]; then
        log_info "Waiting for Redis pod to be ready..."
        sleep 3
        if kubectl wait --for=condition=ready pod -l "$REDIS_LABEL" -n "$NAMESPACE" --timeout=120s 2>/dev/null; then
            log_info "Redis pod ready."
        else
            log_warn "Timeout waiting for Redis. Check pod status manually."
        fi
    fi
}

restore_redis() {
    log_info "Waiting for Redis pod to be ready..."
    if kubectl wait --for=condition=ready pod -l "$REDIS_LABEL" -n "$NAMESPACE" --timeout=120s 2>/dev/null; then
        log_info "Redis pod ready."
    else
        log_warn "Timeout waiting for Redis. Check pod status manually."
    fi
}

flush_redis() {
    log_info "Flushing Redis cache..."
    
    local pod
    pod=$(kubectl get pods -l "$REDIS_LABEL" -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    
    if [[ -z "$pod" ]]; then
        log_error "No Redis pod found"
        exit 1
    fi
    
    kubectl exec "$pod" -n "$NAMESPACE" -- redis-cli FLUSHALL
    log_info "Redis cache flushed."
}

case "$ACTION" in
    kill)
        kill_redis
        ;;
    restore)
        restore_redis
        ;;
    flush)
        flush_redis
        ;;
esac

log_info "Done."
