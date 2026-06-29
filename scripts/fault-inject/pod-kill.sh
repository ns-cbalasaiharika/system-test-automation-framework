#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# POD KILL FAULT INJECTION
# 
# Simulates pod failure/eviction by killing specific pods.
#
# Usage:
#   ./scripts/fault-inject/pod-kill.sh --target configuration
#   ./scripts/fault-inject/pod-kill.sh --target steering --count 2
#   ./scripts/fault-inject/pod-kill.sh --label app=my-app --index 1
#
# Options:
#   --target, -t       Target service (configuration, steering, orchestrator)
#   --label, -l        Custom pod label selector
#   --index, -i        Pod index to kill (default: 0, use 'random' for random)
#   --count, -c        Number of pods to kill (default: 1)
#   --grace, -g        Grace period in seconds (default: 0 for immediate)
#   --namespace, -n    Kubernetes namespace (default: client-oppy)
#   --no-wait          Don't wait for replacement pod
# =============================================================================

# Defaults
NAMESPACE="${NAMESPACE:-client-oppy}"
POD_LABEL=""
TARGET=""
POD_INDEX="0"
POD_COUNT="1"
GRACE_PERIOD="${GRACE_PERIOD:-0}"
WAIT_READY="true"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[fault-inject]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[fault-inject]${NC} $1"; }
log_error() { echo -e "${RED}[fault-inject]${NC} $1"; }

show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --target, -t     Target service (configuration, steering, orchestrator)"
    echo "  --label, -l      Custom pod label selector"
    echo "  --index, -i      Pod index to kill (default: 0, or 'random')"
    echo "  --count, -c      Number of pods to kill (default: 1)"
    echo "  --grace, -g      Grace period in seconds (default: 0)"
    echo "  --namespace, -n  Kubernetes namespace (default: client-oppy)"
    echo "  --no-wait        Don't wait for replacement pod"
    echo "  --help, -h       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --target configuration"
    echo "  $0 --target steering --count 2"
    echo "  $0 --label app=my-app --index 1"
    echo "  $0 --target configuration --index random --grace 30"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target|-t)
            TARGET="$2"
            shift 2
            ;;
        --label|-l)
            POD_LABEL="$2"
            shift 2
            ;;
        --index|-i)
            POD_INDEX="$2"
            shift 2
            ;;
        --count|-c)
            POD_COUNT="$2"
            shift 2
            ;;
        --grace|-g)
            GRACE_PERIOD="$2"
            shift 2
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

# Set label from target if not specified
if [[ -z "$POD_LABEL" ]]; then
    case "$TARGET" in
        configuration|config)
            POD_LABEL="app.kubernetes.io/name=client-oppy-configuration"
            ;;
        steering)
            POD_LABEL="app.kubernetes.io/name=client-oppy-steering"
            ;;
        orchestrator)
            POD_LABEL="app.kubernetes.io/name=client-oppy-orchestrator"
            ;;
        "")
            log_error "No target or label specified. Use --target or --label"
            show_help
            exit 1
            ;;
        *)
            POD_LABEL="app.kubernetes.io/name=$TARGET"
            ;;
    esac
fi

log_info "Finding pods with label '$POD_LABEL' in namespace '$NAMESPACE'..."

PODS=$(kubectl get pods -l "$POD_LABEL" -n "$NAMESPACE" -o name 2>/dev/null || true)

if [[ -z "$PODS" ]]; then
    log_error "No pods found with label '$POD_LABEL' in namespace '$NAMESPACE'"
    exit 1
fi

POD_ARRAY=()
while IFS= read -r pod; do
    [[ -n "$pod" ]] && POD_ARRAY+=("$pod")
done <<< "$PODS"

TOTAL_PODS=${#POD_ARRAY[@]}
log_info "Found $TOTAL_PODS pod(s)"

# Determine which pods to kill
PODS_TO_KILL=()
for ((i=0; i<POD_COUNT && i<TOTAL_PODS; i++)); do
    if [[ "$POD_INDEX" == "random" ]]; then
        # Random selection
        idx=$((RANDOM % TOTAL_PODS))
    else
        # Sequential from index
        idx=$((POD_INDEX + i))
        if [[ $idx -ge $TOTAL_PODS ]]; then
            log_warn "Index $idx out of range (total: $TOTAL_PODS)"
            break
        fi
    fi
    PODS_TO_KILL+=("${POD_ARRAY[$idx]}")
done

if [[ ${#PODS_TO_KILL[@]} -eq 0 ]]; then
    log_error "No pods selected to kill"
    exit 1
fi

log_info "Killing ${#PODS_TO_KILL[@]} pod(s) with grace period ${GRACE_PERIOD}s..."

for pod in "${PODS_TO_KILL[@]}"; do
    log_info "Killing $pod..."
    kubectl delete "$pod" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
done

log_info "Pod(s) deleted. Kubernetes will reschedule."

if [[ "$WAIT_READY" == "true" ]]; then
    log_info "Waiting for replacement pod(s)..."
    sleep 5
    if kubectl wait --for=condition=ready pod -l "$POD_LABEL" -n "$NAMESPACE" --timeout=120s 2>/dev/null; then
        log_info "Replacement pod(s) ready."
    else
        log_warn "Timeout waiting for replacement. Check pod status manually."
    fi
fi

log_info "Done."
