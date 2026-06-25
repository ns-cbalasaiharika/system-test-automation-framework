#!/bin/bash
# =============================================================================
# Kafka Event Verification Script
# 
# Verifies that Kafka events match API operations.
# Used for S6 (E2E propagation), S10 (Kafka partition) scenarios.
# =============================================================================

set -euo pipefail

# Configuration
KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka.kafka.svc.cluster.local:9092}"
TOPIC_CONFIG="${TOPIC_CONFIG:-client_oppy_config}"
TOPIC_STEERING="${TOPIC_STEERING:-client_oppy_steering}"
TOPIC_USER_NOTIFICATION="${TOPIC_USER_NOTIFICATION:-um_user_notification_v2}"
CONSUMER_GROUP="${CONSUMER_GROUP:-k6-verification}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/kafka-verify}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Create output directory
mkdir -p "$OUTPUT_DIR"

# =============================================================================
# Function: Consume events from a topic
# =============================================================================
consume_events() {
    local topic=$1
    local output_file=$2
    local timeout=${3:-30}
    local max_messages=${4:-1000}
    
    log "Consuming from $topic (timeout: ${timeout}s, max: $max_messages)"
    
    kafka-console-consumer \
        --bootstrap-server "$KAFKA_BOOTSTRAP" \
        --topic "$topic" \
        --from-beginning \
        --timeout-ms $((timeout * 1000)) \
        --max-messages "$max_messages" \
        --property print.timestamp=true \
        --property print.key=true \
        --property print.headers=true \
        > "$output_file" 2>/dev/null || true
    
    local count=$(wc -l < "$output_file")
    log "Consumed $count events from $topic"
}

# =============================================================================
# Function: Count events by type
# =============================================================================
count_events_by_type() {
    local file=$1
    
    log "Event counts by type:"
    grep -o '"type":"[^"]*"' "$file" 2>/dev/null | sort | uniq -c || echo "  No events found"
}

# =============================================================================
# Function: Verify CloudEvents format
# =============================================================================
verify_cloudevents_format() {
    local file=$1
    local errors=0
    
    log "Verifying CloudEvents v1.0 format..."
    
    # Check for required CloudEvents fields
    while IFS= read -r line; do
        # Skip empty lines
        [[ -z "$line" ]] && continue
        
        # Extract JSON payload (after timestamp and key)
        json=$(echo "$line" | grep -oP '\{.*\}' | tail -1)
        [[ -z "$json" ]] && continue
        
        # Check required fields
        if ! echo "$json" | jq -e '.specversion' > /dev/null 2>&1; then
            warn "Missing specversion in event"
            ((errors++))
        fi
        
        if ! echo "$json" | jq -e '.type' > /dev/null 2>&1; then
            warn "Missing type in event"
            ((errors++))
        fi
        
        if ! echo "$json" | jq -e '.source' > /dev/null 2>&1; then
            warn "Missing source in event"
            ((errors++))
        fi
        
        if ! echo "$json" | jq -e '.id' > /dev/null 2>&1; then
            warn "Missing id in event"
            ((errors++))
        fi
        
    done < "$file"
    
    if [[ $errors -eq 0 ]]; then
        log "All events comply with CloudEvents v1.0 format"
        return 0
    else
        error "$errors events have format issues"
        return 1
    fi
}

# =============================================================================
# Function: Check consumer group lag
# =============================================================================
check_consumer_lag() {
    local group=$1
    
    log "Checking consumer lag for group: $group"
    
    kafka-consumer-groups \
        --bootstrap-server "$KAFKA_BOOTSTRAP" \
        --describe \
        --group "$group" 2>/dev/null || {
            warn "Consumer group $group not found or empty"
            return 1
        }
}

# =============================================================================
# Function: Verify event count matches API operations
# =============================================================================
verify_event_count() {
    local expected_creates=$1
    local expected_updates=$2
    local expected_deletes=$3
    local events_file=$4
    
    log "Verifying event counts..."
    
    local actual_creates=$(grep -c '"type":"com.netskope.clientoppy.config.created"' "$events_file" 2>/dev/null || echo 0)
    local actual_updates=$(grep -c '"type":"com.netskope.clientoppy.config.updated"' "$events_file" 2>/dev/null || echo 0)
    local actual_deletes=$(grep -c '"type":"com.netskope.clientoppy.config.deleted"' "$events_file" 2>/dev/null || echo 0)
    
    local pass=true
    
    if [[ "$actual_creates" -ne "$expected_creates" ]]; then
        error "Create events mismatch: expected $expected_creates, got $actual_creates"
        pass=false
    else
        log "Create events: $actual_creates ✓"
    fi
    
    if [[ "$actual_updates" -ne "$expected_updates" ]]; then
        error "Update events mismatch: expected $expected_updates, got $actual_updates"
        pass=false
    else
        log "Update events: $actual_updates ✓"
    fi
    
    if [[ "$actual_deletes" -ne "$expected_deletes" ]]; then
        error "Delete events mismatch: expected $expected_deletes, got $actual_deletes"
        pass=false
    else
        log "Delete events: $actual_deletes ✓"
    fi
    
    $pass && return 0 || return 1
}

# =============================================================================
# Function: Extract event IDs for reconciliation
# =============================================================================
extract_event_ids() {
    local file=$1
    local output=$2
    
    log "Extracting event IDs..."
    
    grep -oP '"configId":\s*"?\d+"?' "$file" 2>/dev/null | \
        grep -oP '\d+' | sort -n | uniq > "$output"
    
    local count=$(wc -l < "$output")
    log "Extracted $count unique config IDs"
}

# =============================================================================
# Main: Run verification based on mode
# =============================================================================
main() {
    local mode=${1:-"full"}
    
    case $mode in
        "consume-config")
            consume_events "$TOPIC_CONFIG" "$OUTPUT_DIR/config-events.txt" 30
            count_events_by_type "$OUTPUT_DIR/config-events.txt"
            ;;
        
        "consume-steering")
            consume_events "$TOPIC_STEERING" "$OUTPUT_DIR/steering-events.txt" 30
            count_events_by_type "$OUTPUT_DIR/steering-events.txt"
            ;;
        
        "consume-user")
            consume_events "$TOPIC_USER_NOTIFICATION" "$OUTPUT_DIR/user-events.txt" 30
            count_events_by_type "$OUTPUT_DIR/user-events.txt"
            ;;
        
        "verify-format")
            consume_events "$TOPIC_CONFIG" "$OUTPUT_DIR/config-events.txt" 30
            verify_cloudevents_format "$OUTPUT_DIR/config-events.txt"
            ;;
        
        "check-lag")
            check_consumer_lag "${2:-client-oppy-consumer}"
            ;;
        
        "verify-counts")
            local creates=${2:-10}
            local updates=${3:-5}
            local deletes=${4:-5}
            consume_events "$TOPIC_CONFIG" "$OUTPUT_DIR/config-events.txt" 60
            verify_event_count "$creates" "$updates" "$deletes" "$OUTPUT_DIR/config-events.txt"
            ;;
        
        "full")
            log "Running full Kafka verification..."
            
            # Consume from all topics
            consume_events "$TOPIC_CONFIG" "$OUTPUT_DIR/config-events.txt" 30
            consume_events "$TOPIC_STEERING" "$OUTPUT_DIR/steering-events.txt" 30
            
            # Count events
            count_events_by_type "$OUTPUT_DIR/config-events.txt"
            count_events_by_type "$OUTPUT_DIR/steering-events.txt"
            
            # Verify format
            verify_cloudevents_format "$OUTPUT_DIR/config-events.txt"
            
            # Check consumer lag
            check_consumer_lag "client-oppy-consumer" || true
            
            log "Verification complete. Results in $OUTPUT_DIR"
            ;;
        
        *)
            echo "Usage: $0 {consume-config|consume-steering|consume-user|verify-format|check-lag|verify-counts|full}"
            echo ""
            echo "Modes:"
            echo "  consume-config    - Consume events from config topic"
            echo "  consume-steering  - Consume events from steering topic"
            echo "  consume-user      - Consume events from user notification topic"
            echo "  verify-format     - Verify CloudEvents format compliance"
            echo "  check-lag GROUP   - Check consumer group lag"
            echo "  verify-counts C U D - Verify event counts (creates, updates, deletes)"
            echo "  full              - Run full verification"
            exit 1
            ;;
    esac
}

main "$@"
