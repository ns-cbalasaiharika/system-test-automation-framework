#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TOXIPROXY FAULT INJECTION
# 
# Injects latency, blocks traffic, or clears toxics via Toxiproxy.
#
# Usage:
#   ./scripts/fault-inject/toxiproxy-latency.sh --target db --latency 500ms
#   ./scripts/fault-inject/toxiproxy-latency.sh --target um --block 100%
#   ./scripts/fault-inject/toxiproxy-latency.sh --target db --clear
#
# Options:
#   --target, -t       Target proxy name (db, um, provisioner, addonman, npa, redis, kafka)
#   --latency, -l      Add latency in ms (e.g., 500ms, 1000ms)
#   --block, -b        Block traffic percentage (e.g., 100%, 50%)
#   --clear, -c        Remove all toxics from target
#   --jitter, -j       Latency jitter in ms (default: 10)
#   --url, -u          Toxiproxy API URL (default: http://localhost:8474)
# =============================================================================

# Defaults
TOXIPROXY_URL="${TOXIPROXY_URL:-http://localhost:8474}"
TARGET=""
LATENCY_MS=""
BLOCK_PERCENT=""
CLEAR="false"
JITTER_MS="${JITTER_MS:-10}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[fault-inject]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[fault-inject]${NC} $1"; }
log_error() { echo -e "${RED}[fault-inject]${NC} $1"; }

show_help() {
    echo "Usage: $0 --target <name> [action] [options]"
    echo ""
    echo "Targets:"
    echo "  db              MariaDB database"
    echo "  um              User Manager"
    echo "  provisioner     Provisioner-pycore"
    echo "  addonman        Addonman service"
    echo "  npa             NPA QDispatcher"
    echo "  redis           Redis cache"
    echo "  kafka           Kafka broker"
    echo ""
    echo "Actions:"
    echo "  --latency, -l   Add latency (e.g., 500ms)"
    echo "  --block, -b     Block traffic percentage (e.g., 100%)"
    echo "  --clear, -c     Remove all toxics from target"
    echo ""
    echo "Options:"
    echo "  --target, -t    Target proxy name (required)"
    echo "  --jitter, -j    Latency jitter in ms (default: 10)"
    echo "  --url, -u       Toxiproxy API URL (default: http://localhost:8474)"
    echo "  --help, -h      Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --target db --latency 500ms"
    echo "  $0 --target um --block 100%"
    echo "  $0 --target db --clear"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target|-t)
            TARGET="$2"
            shift 2
            ;;
        --latency|-l)
            LATENCY_MS="${2%ms}"  # Remove 'ms' suffix if present
            shift 2
            ;;
        --block|-b)
            BLOCK_PERCENT="${2%\%}"  # Remove '%' suffix if present
            shift 2
            ;;
        --clear|-c)
            CLEAR="true"
            shift
            ;;
        --jitter|-j)
            JITTER_MS="${2%ms}"
            shift 2
            ;;
        --url|-u)
            TOXIPROXY_URL="$2"
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

if [[ -z "$TARGET" ]]; then
    log_error "No target specified. Use --target <name>"
    show_help
    exit 1
fi

# Check if toxiproxy is accessible
check_toxiproxy() {
    if ! curl -s -f "$TOXIPROXY_URL/proxies" > /dev/null 2>&1; then
        log_error "Cannot connect to Toxiproxy at $TOXIPROXY_URL"
        log_warn "Make sure Toxiproxy is running and accessible."
        log_warn "For Minikube: kubectl port-forward svc/toxiproxy 8474:8474 -n client-oppy"
        exit 1
    fi
}

add_latency() {
    log_info "Adding ${LATENCY_MS}ms latency (±${JITTER_MS}ms jitter) to proxy '$TARGET'..."
    
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "$TOXIPROXY_URL/proxies/$TARGET/toxics" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"latency_downstream\",
            \"type\": \"latency\",
            \"stream\": \"downstream\",
            \"attributes\": {\"latency\": $LATENCY_MS, \"jitter\": $JITTER_MS}
        }")
    
    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
        log_info "Latency toxic added successfully."
        echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
        log_error "Failed to add latency toxic (HTTP $http_code)"
        echo "$body"
        exit 1
    fi
}

add_block() {
    local toxicity
    toxicity=$(echo "scale=2; $BLOCK_PERCENT / 100" | bc)
    
    log_info "Blocking ${BLOCK_PERCENT}% of traffic to proxy '$TARGET'..."
    
    local response
    response=$(curl -s -w "\n%{http_code}" -X POST "$TOXIPROXY_URL/proxies/$TARGET/toxics" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"timeout_downstream\",
            \"type\": \"timeout\",
            \"stream\": \"downstream\",
            \"toxicity\": $toxicity,
            \"attributes\": {\"timeout\": 1}
        }")
    
    local http_code
    http_code=$(echo "$response" | tail -n1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" == "200" ]] || [[ "$http_code" == "201" ]]; then
        log_info "Block toxic added successfully."
        echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
        log_error "Failed to add block toxic (HTTP $http_code)"
        echo "$body"
        exit 1
    fi
}

clear_toxics() {
    log_info "Removing all toxics from proxy '$TARGET'..."
    
    # Get list of toxics
    local toxics
    toxics=$(curl -s "$TOXIPROXY_URL/proxies/$TARGET/toxics" 2>/dev/null || echo "[]")
    
    if [[ "$toxics" == "[]" ]] || [[ -z "$toxics" ]]; then
        log_info "No toxics found on proxy '$TARGET'."
        return 0
    fi
    
    # Parse and delete each toxic
    local toxic_names
    toxic_names=$(echo "$toxics" | python3 -c "import sys, json; toxics = json.load(sys.stdin); print('\n'.join([t['name'] for t in toxics]))" 2>/dev/null || true)
    
    if [[ -z "$toxic_names" ]]; then
        log_info "No toxics to remove."
        return 0
    fi
    
    while IFS= read -r toxic_name; do
        if [[ -n "$toxic_name" ]]; then
            log_info "Removing toxic: $toxic_name"
            curl -s -X DELETE "$TOXIPROXY_URL/proxies/$TARGET/toxics/$toxic_name"
        fi
    done <<< "$toxic_names"
    
    log_info "All toxics removed from '$TARGET'."
}

# Main
check_toxiproxy

if [[ "$CLEAR" == "true" ]]; then
    clear_toxics
elif [[ -n "$LATENCY_MS" ]]; then
    add_latency
elif [[ -n "$BLOCK_PERCENT" ]]; then
    add_block
else
    log_error "No action specified. Use --latency, --block, or --clear"
    show_help
    exit 1
fi

log_info "Done."
