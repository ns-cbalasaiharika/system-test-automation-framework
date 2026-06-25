#!/bin/bash
# =============================================================================
# Kafka Consumer Lag Monitoring Script
# 
# Monitors consumer group lag for client-oppy orchestrator.
# Used for S6 (E2E), S7 (Deployment), S10 (Kafka partition) scenarios.
# =============================================================================

set -euo pipefail

# Configuration
KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka.kafka.svc.cluster.local:9092}"
CONSUMER_GROUP="${CONSUMER_GROUP:-client-oppy-consumer}"
MAX_LAG="${MAX_LAG:-100}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/consumer-lag}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"; }

mkdir -p "$OUTPUT_DIR"

# =============================================================================
# Function: Get current lag for a consumer group
# =============================================================================
get_consumer_lag() {
    local group=$1
    local output_file="$OUTPUT_DIR/lag-${group}.txt"
    
    kafka-consumer-groups \
        --bootstrap-server "$KAFKA_BOOTSTRAP" \
        --describe \
        --group "$group" 2>/dev/null | tee "$output_file"
    
    # Extract total lag
    local total_lag=$(grep -v "^TOPIC\|^Consumer\|^$" "$output_file" | \
        awk '{sum += $6} END {print sum+0}')
    
    echo "$total_lag"
}

# =============================================================================
# Function: Check if lag is within threshold
# =============================================================================
check_lag_threshold() {
    local group=$1
    local max_lag=$2
    
    local current_lag=$(get_consumer_lag "$group")
    
    if [[ "$current_lag" -le "$max_lag" ]]; then
        log "Consumer group $group: lag=$current_lag (threshold: $max_lag) ✓"
        return 0
    else
        error "Consumer group $group: lag=$current_lag exceeds threshold $max_lag"
        return 1
    fi
}

# =============================================================================
# Function: Wait for lag to reach zero
# =============================================================================
wait_for_zero_lag() {
    local group=$1
    local timeout=${2:-300}
    local interval=${3:-5}
    
    log "Waiting for $group lag to reach 0 (timeout: ${timeout}s)..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        local current_lag=$(get_consumer_lag "$group" 2>/dev/null | tail -1)
        
        if [[ "$current_lag" -eq 0 ]]; then
            local elapsed=$(($(date +%s) - start_time))
            log "Lag reached 0 after ${elapsed}s"
            return 0
        fi
        
        log "Current lag: $current_lag, waiting..."
        sleep "$interval"
    done
    
    error "Timeout waiting for lag to reach 0"
    return 1
}

# =============================================================================
# Function: Monitor lag continuously
# =============================================================================
monitor_lag() {
    local group=$1
    local duration=${2:-300}
    local interval=${3:-5}
    
    local output_file="$OUTPUT_DIR/lag-history-${group}.csv"
    echo "timestamp,lag" > "$output_file"
    
    log "Monitoring $group for ${duration}s (interval: ${interval}s)..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local max_observed=0
    local samples=0
    
    while [[ $(date +%s) -lt $end_time ]]; do
        local current_lag=$(get_consumer_lag "$group" 2>/dev/null | tail -1)
        local timestamp=$(date +%s)
        
        echo "$timestamp,$current_lag" >> "$output_file"
        
        if [[ "$current_lag" -gt "$max_observed" ]]; then
            max_observed=$current_lag
        fi
        
        ((samples++))
        log "Lag: $current_lag (max observed: $max_observed)"
        
        sleep "$interval"
    done
    
    log "Monitoring complete. Samples: $samples, Max lag: $max_observed"
    log "History saved to: $output_file"
    
    return 0
}

# =============================================================================
# Function: Check lag spike and recovery
# =============================================================================
check_spike_recovery() {
    local group=$1
    local spike_threshold=$2
    local recovery_timeout=${3:-60}
    
    log "Monitoring for lag spike (threshold: $spike_threshold)..."
    
    # Wait for spike
    local spike_detected=false
    local spike_value=0
    
    for i in {1..60}; do
        local current_lag=$(get_consumer_lag "$group" 2>/dev/null | tail -1)
        
        if [[ "$current_lag" -ge "$spike_threshold" ]]; then
            spike_detected=true
            spike_value=$current_lag
            log "Spike detected: lag=$spike_value"
            break
        fi
        
        sleep 1
    done
    
    if ! $spike_detected; then
        warn "No spike detected within 60s"
        return 1
    fi
    
    # Wait for recovery
    log "Waiting for recovery (timeout: ${recovery_timeout}s)..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + recovery_timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        local current_lag=$(get_consumer_lag "$group" 2>/dev/null | tail -1)
        
        if [[ "$current_lag" -eq 0 ]]; then
            local recovery_time=$(($(date +%s) - start_time))
            log "Recovery complete after ${recovery_time}s (peak lag: $spike_value)"
            return 0
        fi
        
        log "Recovering: lag=$current_lag"
        sleep 2
    done
    
    error "Recovery timeout - lag did not return to 0"
    return 1
}

# =============================================================================
# Function: List all consumer groups
# =============================================================================
list_groups() {
    log "Listing all consumer groups..."
    
    kafka-consumer-groups \
        --bootstrap-server "$KAFKA_BOOTSTRAP" \
        --list 2>/dev/null
}

# =============================================================================
# Function: Get lag summary for multiple groups
# =============================================================================
lag_summary() {
    log "Consumer group lag summary:"
    echo ""
    printf "%-40s %10s\n" "GROUP" "TOTAL LAG"
    printf "%-40s %10s\n" "----------------------------------------" "----------"
    
    for group in $(list_groups 2>/dev/null); do
        local lag=$(get_consumer_lag "$group" 2>/dev/null | tail -1)
        printf "%-40s %10s\n" "$group" "$lag"
    done
}

# =============================================================================
# Main
# =============================================================================
main() {
    local mode=${1:-"check"}
    
    case $mode in
        "check")
            check_lag_threshold "${2:-$CONSUMER_GROUP}" "${3:-$MAX_LAG}"
            ;;
        
        "wait-zero")
            wait_for_zero_lag "${2:-$CONSUMER_GROUP}" "${3:-300}" "${4:-5}"
            ;;
        
        "monitor")
            monitor_lag "${2:-$CONSUMER_GROUP}" "${3:-300}" "${4:-5}"
            ;;
        
        "spike-recovery")
            check_spike_recovery "${2:-$CONSUMER_GROUP}" "${3:-100}" "${4:-60}"
            ;;
        
        "list")
            list_groups
            ;;
        
        "summary")
            lag_summary
            ;;
        
        "describe")
            kafka-consumer-groups \
                --bootstrap-server "$KAFKA_BOOTSTRAP" \
                --describe \
                --group "${2:-$CONSUMER_GROUP}"
            ;;
        
        *)
            echo "Usage: $0 {check|wait-zero|monitor|spike-recovery|list|summary|describe} [args]"
            echo ""
            echo "Commands:"
            echo "  check [GROUP] [MAX]      - Check if lag is within threshold"
            echo "  wait-zero [GROUP] [TIMEOUT] [INTERVAL] - Wait for lag to reach 0"
            echo "  monitor [GROUP] [DURATION] [INTERVAL]  - Monitor lag over time"
            echo "  spike-recovery [GROUP] [THRESHOLD] [TIMEOUT] - Detect spike and recovery"
            echo "  list                     - List all consumer groups"
            echo "  summary                  - Show lag summary for all groups"
            echo "  describe [GROUP]         - Describe a consumer group"
            echo ""
            echo "Environment variables:"
            echo "  KAFKA_BOOTSTRAP - Kafka bootstrap servers"
            echo "  CONSUMER_GROUP  - Default consumer group (client-oppy-consumer)"
            echo "  MAX_LAG         - Maximum acceptable lag (100)"
            echo "  POLL_INTERVAL   - Polling interval in seconds (5)"
            exit 1
            ;;
    esac
}

main "$@"
