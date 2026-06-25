#!/bin/bash
# =============================================================================
# Database Integrity Verification Script
# 
# Validates data integrity in MariaDB for client-oppy services.
# Used for S5.1, S5.2, S14 (Data Integrity) scenarios.
# =============================================================================

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-mariadb-primary.database.svc.cluster.local}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
TENANT_DB_PREFIX="${TENANT_DB_PREFIX:-tenant_}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/db-verify}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"; }

mkdir -p "$OUTPUT_DIR"

# MySQL command helper
mysql_cmd() {
    local db=${1:-}
    if [[ -n "$DB_PASS" ]]; then
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" ${db:+-D "$db"} -N -e "$2"
    else
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" ${db:+-D "$db"} -N -e "$2"
    fi
}

# =============================================================================
# Function: Check priority contiguity (no gaps, no duplicates)
# =============================================================================
check_priority_contiguity() {
    local tenant_id=$1
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    log "Checking priority contiguity for tenant $tenant_id..."
    
    # Count distinct priorities vs total count
    local distinct_count=$(mysql_cmd "$db" "SELECT COUNT(DISTINCT priority) FROM client_config WHERE priority >= 0;")
    local total_count=$(mysql_cmd "$db" "SELECT COUNT(*) FROM client_config WHERE priority >= 0;")
    
    if [[ "$distinct_count" -ne "$total_count" ]]; then
        error "Priority duplicates detected: distinct=$distinct_count, total=$total_count"
        
        # Show duplicates
        mysql_cmd "$db" "SELECT priority, COUNT(*) as cnt FROM client_config WHERE priority >= 0 GROUP BY priority HAVING cnt > 1;"
        return 1
    fi
    
    # Check for gaps: max - min + 1 should equal count
    local min_priority=$(mysql_cmd "$db" "SELECT COALESCE(MIN(priority), 0) FROM client_config WHERE priority >= 0;")
    local max_priority=$(mysql_cmd "$db" "SELECT COALESCE(MAX(priority), 0) FROM client_config WHERE priority >= 0;")
    local expected_count=$((max_priority - min_priority + 1))
    
    if [[ "$expected_count" -ne "$total_count" && "$total_count" -gt 0 ]]; then
        error "Priority gaps detected: range=$min_priority-$max_priority, expected=$expected_count, actual=$total_count"
        
        # Find gaps
        mysql_cmd "$db" "
            SELECT a.priority + 1 as gap_start, MIN(b.priority) - 1 as gap_end
            FROM client_config a
            JOIN client_config b ON a.priority < b.priority
            WHERE NOT EXISTS (SELECT 1 FROM client_config c WHERE c.priority = a.priority + 1)
            AND a.priority >= 0
            GROUP BY a.priority
            HAVING gap_start <= gap_end;
        "
        return 1
    fi
    
    log "Priority contiguity: OK (count=$total_count, range=$min_priority-$max_priority)"
    return 0
}

# =============================================================================
# Function: Check default config immutability
# =============================================================================
check_default_config() {
    local tenant_id=$1
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    log "Checking default config for tenant $tenant_id..."
    
    # Default config should exist with priority=-1 and id=1
    local default_exists=$(mysql_cmd "$db" "SELECT COUNT(*) FROM client_config WHERE id = 1 AND priority = -1;")
    
    if [[ "$default_exists" -ne 1 ]]; then
        error "Default config missing or corrupted (id=1, priority=-1)"
        mysql_cmd "$db" "SELECT id, configurationName, priority FROM client_config WHERE id = 1 OR priority = -1;"
        return 1
    fi
    
    log "Default config: OK"
    return 0
}

# =============================================================================
# Function: Verify bulk delete job cleanup
# =============================================================================
check_bulk_jobs_cleanup() {
    local tenant_id=$1
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    log "Checking bulk delete jobs cleanup for tenant $tenant_id..."
    
    # Jobs older than 7 days should be cleaned up
    local stale_jobs=$(mysql_cmd "$db" "
        SELECT COUNT(*) FROM client_config_jobs 
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
    " 2>/dev/null || echo "0")
    
    if [[ "$stale_jobs" -gt 0 ]]; then
        warn "Found $stale_jobs stale bulk delete jobs (>7 days old)"
    else
        log "Bulk jobs cleanup: OK"
    fi
    
    # Check for incomplete jobs
    local incomplete_jobs=$(mysql_cmd "$db" "
        SELECT COUNT(*) FROM client_config_jobs 
        WHERE status IN ('pending', 'processing') 
        AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
    " 2>/dev/null || echo "0")
    
    if [[ "$incomplete_jobs" -gt 0 ]]; then
        warn "Found $incomplete_jobs stuck bulk delete jobs (incomplete >1 hour)"
        return 1
    fi
    
    return 0
}

# =============================================================================
# Function: Check steering priority contiguity
# =============================================================================
check_steering_priority() {
    local tenant_id=$1
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    log "Checking steering config priority for tenant $tenant_id..."
    
    # Similar checks as configuration service
    local distinct_count=$(mysql_cmd "$db" "SELECT COUNT(DISTINCT priority) FROM steering_config WHERE priority >= 0;" 2>/dev/null || echo "0")
    local total_count=$(mysql_cmd "$db" "SELECT COUNT(*) FROM steering_config WHERE priority >= 0;" 2>/dev/null || echo "0")
    
    if [[ "$distinct_count" -ne "$total_count" && "$total_count" -gt 0 ]]; then
        error "Steering priority duplicates: distinct=$distinct_count, total=$total_count"
        return 1
    fi
    
    log "Steering priority: OK (count=$total_count)"
    return 0
}

# =============================================================================
# Function: Count configs per tenant
# =============================================================================
count_configs() {
    local tenant_id=$1
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    local config_count=$(mysql_cmd "$db" "SELECT COUNT(*) FROM client_config;" 2>/dev/null || echo "N/A")
    local steering_count=$(mysql_cmd "$db" "SELECT COUNT(*) FROM steering_config;" 2>/dev/null || echo "N/A")
    
    echo "Tenant $tenant_id: configs=$config_count, steering=$steering_count"
}

# =============================================================================
# Function: Verify data exists after operation
# =============================================================================
verify_row_exists() {
    local tenant_id=$1
    local table=$2
    local id=$3
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    local exists=$(mysql_cmd "$db" "SELECT COUNT(*) FROM $table WHERE id = $id;")
    
    if [[ "$exists" -eq 1 ]]; then
        log "Row exists: $table.id=$id in tenant $tenant_id"
        return 0
    else
        error "Row missing: $table.id=$id in tenant $tenant_id"
        return 1
    fi
}

# =============================================================================
# Function: Compare row counts before/after operation
# =============================================================================
compare_counts() {
    local tenant_id=$1
    local table=$2
    local expected_delta=$3
    local before_count=$4
    local db="${TENANT_DB_PREFIX}${tenant_id}"
    
    local after_count=$(mysql_cmd "$db" "SELECT COUNT(*) FROM $table;")
    local actual_delta=$((after_count - before_count))
    
    if [[ "$actual_delta" -eq "$expected_delta" ]]; then
        log "Row count delta: OK (before=$before_count, after=$after_count, delta=$actual_delta)"
        return 0
    else
        error "Row count delta mismatch: expected=$expected_delta, actual=$actual_delta"
        return 1
    fi
}

# =============================================================================
# Function: Check replication lag
# =============================================================================
check_replication_lag() {
    log "Checking replication lag..."
    
    local lag=$(mysql_cmd "" "SHOW SLAVE STATUS\G" 2>/dev/null | grep "Seconds_Behind_Master" | awk '{print $2}' || echo "N/A")
    
    if [[ "$lag" == "N/A" || "$lag" == "NULL" ]]; then
        warn "Could not determine replication lag (may not be a replica)"
    elif [[ "$lag" -gt 5 ]]; then
        warn "High replication lag: ${lag}s"
    else
        log "Replication lag: ${lag}s"
    fi
}

# =============================================================================
# Function: Full integrity check for a tenant
# =============================================================================
full_tenant_check() {
    local tenant_id=$1
    local errors=0
    
    log "=== Full integrity check for tenant $tenant_id ==="
    
    count_configs "$tenant_id"
    
    check_priority_contiguity "$tenant_id" || ((errors++))
    check_default_config "$tenant_id" || ((errors++))
    check_bulk_jobs_cleanup "$tenant_id" || ((errors++))
    check_steering_priority "$tenant_id" || ((errors++))
    
    if [[ $errors -eq 0 ]]; then
        log "=== Tenant $tenant_id: ALL CHECKS PASSED ==="
        return 0
    else
        error "=== Tenant $tenant_id: $errors CHECKS FAILED ==="
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    local mode=${1:-"help"}
    
    case $mode in
        "priority")
            check_priority_contiguity "${2:?Tenant ID required}"
            ;;
        
        "default")
            check_default_config "${2:?Tenant ID required}"
            ;;
        
        "bulk-jobs")
            check_bulk_jobs_cleanup "${2:?Tenant ID required}"
            ;;
        
        "steering")
            check_steering_priority "${2:?Tenant ID required}"
            ;;
        
        "count")
            count_configs "${2:?Tenant ID required}"
            ;;
        
        "row-exists")
            verify_row_exists "${2:?Tenant ID required}" "${3:?Table required}" "${4:?ID required}"
            ;;
        
        "replication")
            check_replication_lag
            ;;
        
        "full")
            full_tenant_check "${2:?Tenant ID required}"
            ;;
        
        "multi")
            # Check multiple tenants
            shift
            local all_passed=true
            for tenant in "$@"; do
                full_tenant_check "$tenant" || all_passed=false
            done
            $all_passed
            ;;
        
        *)
            echo "Usage: $0 {priority|default|bulk-jobs|steering|count|row-exists|replication|full|multi} [args]"
            echo ""
            echo "Commands:"
            echo "  priority TENANT_ID     - Check priority contiguity"
            echo "  default TENANT_ID      - Check default config exists"
            echo "  bulk-jobs TENANT_ID    - Check bulk delete job cleanup"
            echo "  steering TENANT_ID     - Check steering priority"
            echo "  count TENANT_ID        - Count configs for tenant"
            echo "  row-exists TENANT TABLE ID - Verify row exists"
            echo "  replication            - Check replication lag"
            echo "  full TENANT_ID         - Run all checks for tenant"
            echo "  multi TENANT1 TENANT2  - Run checks for multiple tenants"
            echo ""
            echo "Environment variables:"
            echo "  DB_HOST, DB_PORT, DB_USER, DB_PASS, TENANT_DB_PREFIX"
            exit 1
            ;;
    esac
}

main "$@"
