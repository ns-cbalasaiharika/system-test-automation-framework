#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# KAFKA BROKER FAULT INJECTION
# 
# Simulates Kafka broker failures by killing pods or blocking network.
#
# Usage:
#   ./scripts/fault-inject/kafka-broker-kill.sh --block      # Block Kafka traffic
#   ./scripts/fault-inject/kafka-broker-kill.sh --restore    # Restore Kafka traffic
#   ./scripts/fault-inject/kafka-broker-kill.sh --kill       # Kill Kafka broker pod
#
# Options:
#   --namespace, -n    Kubernetes namespace (default: client-oppy)
#   --broker, -b       Broker index to target (default: 0)
#   --no-wait          Don't wait for pod to become ready after kill
# =============================================================================

# Defaults
NAMESPACE="${NAMESPACE:-client-oppy}"
KAFKA_LABEL="${KAFKA_LABEL:-app=kafka}"
GRACE_PERIOD="${GRACE_PERIOD:-0}"
BROKER_INDEX="${BROKER_INDEX:-0}"
WAIT_READY="true"
ACTION=""
TOXIPROXY_URL="${TOXIPROXY_URL:-http://localhost:8474}"

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
    echo "  --block         Block Kafka traffic (via Toxiproxy)"
    echo "  --restore       Restore Kafka traffic (remove block)"
    echo "  --kill          Kill Kafka broker pod"
    echo ""
    echo "Options:"
    echo "  --namespace, -n  Kubernetes namespace (default: client-oppy)"
    echo "  --broker, -b     Broker index to target (default: 0)"
    echo "  --no-wait        Don't wait for pod to become ready after kill"
    echo "  --help, -h       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --block"
    echo "  $0 --restore"
    echo "  $0 --kill --broker 1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --block)
            ACTION="block"
            shift
            ;;
        --restore)
            ACTION="restore"
            shift
            ;;
        --kill)
            ACTION="kill"
            shift
            ;;
        --namespace|-n)
            NAMESPACE="$2"
            shift 2
            ;;
        --broker|-b)
            BROKER_INDEX="$2"
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

block_kafka() {
    log_info "Blocking Kafka traffic via Toxiproxy..."
    
    # Check if toxiproxy is accessible
    if ! curl -s -f "$TOXIPROXY_URL/proxies" > /dev/null 2>&1; then
        log_warn "Toxiproxy not accessible at $TOXIPROXY_URL"
        log_warn "Falling back to network policy blocking..."
        
        # Create a NetworkPolicy to block Kafka
        kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: block-kafka-egress
  namespace: $NAMESPACE
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: client-oppy-configuration
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: kafka
    ports: []
EOF
        log_info "NetworkPolicy created to block Kafka traffic."
        return 0
    fi
    
    # Use Toxiproxy to block
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "$TOXIPROXY_URL/proxies/kafka/toxics" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "kafka_block",
            "type": "timeout",
            "stream": "downstream",
            "toxicity": 1.0,
            "attributes": {"timeout": 1}
        }' 2>/dev/null || echo -e "\n500")
    
    local http_code
    http_code=$(echo "$response" | tail -n1)
    
    if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
        log_info "Kafka traffic blocked via Toxiproxy."
    else
        log_warn "Could not block via Toxiproxy (HTTP $http_code). Kafka proxy may not exist."
    fi
}

restore_kafka() {
    log_info "Restoring Kafka traffic..."
    
    # Remove NetworkPolicy if exists
    if kubectl get networkpolicy block-kafka-egress -n "$NAMESPACE" > /dev/null 2>&1; then
        kubectl delete networkpolicy block-kafka-egress -n "$NAMESPACE"
        log_info "NetworkPolicy removed."
    fi
    
    # Remove Toxiproxy toxic if exists
    if curl -s -f "$TOXIPROXY_URL/proxies" > /dev/null 2>&1; then
        curl -s -X DELETE "$TOXIPROXY_URL/proxies/kafka/toxics/kafka_block" 2>/dev/null || true
        log_info "Toxiproxy toxic removed."
    fi
    
    log_info "Kafka traffic restored."
}

kill_broker() {
    log_info "Killing Kafka broker at index $BROKER_INDEX..."
    
    local pods
    pods=$(kubectl get pods -l "$KAFKA_LABEL" -n "$NAMESPACE" -o name 2>/dev/null || true)
    
    if [[ -z "$pods" ]]; then
        log_error "No Kafka broker pods found with label '$KAFKA_LABEL' in namespace '$NAMESPACE'"
        exit 1
    fi
    
    local pod_name
    pod_name=$(echo "$pods" | sed -n "$((BROKER_INDEX + 1))p")
    
    if [[ -z "$pod_name" ]]; then
        log_error "No Kafka broker found at index $BROKER_INDEX"
        log_info "Available pods:"
        echo "$pods"
        exit 1
    fi
    
    log_info "Killing $pod_name..."
    kubectl delete "$pod_name" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
    log_info "Kafka broker killed."
    
    if [[ "$WAIT_READY" == "true" ]]; then
        log_info "Waiting for broker to restart..."
        sleep 10
        if kubectl wait --for=condition=ready pod -l "$KAFKA_LABEL" -n "$NAMESPACE" --timeout=300s 2>/dev/null; then
            log_info "Kafka broker is ready."
        else
            log_warn "Timeout waiting for broker. Check pod status manually."
        fi
    fi
}

case "$ACTION" in
    block)
        block_kafka
        ;;
    restore)
        restore_kafka
        ;;
    kill)
        kill_broker
        ;;
esac

log_info "Done."
