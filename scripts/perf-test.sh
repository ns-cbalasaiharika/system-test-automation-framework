#!/bin/bash
# =============================================================================
# PERFORMANCE TEST ORCHESTRATOR
# Main entry point for running performance tests on Rancher cluster
#
# This script orchestrates the full performance testing workflow:
#   1. Load the cluster with background traffic
#   2. Run service-specific tests
#   3. Unload the cluster
#
# Usage:
#   ./perf-test.sh full --service client-oppy --load-profile p95
#   ./perf-test.sh load start --profile p95
#   ./perf-test.sh test --scenario bl01 --profile load
#   ./perf-test.sh load stop
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ORCHESTRATOR_DIR="${SCRIPT_DIR}/orchestrator"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_status() { echo -e "${BLUE}[STATUS]${NC} $1"; }
log_header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"; }

show_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║     K6 System Test Automation Framework                       ║"
    echo "║     Performance Testing Orchestrator                          ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Full workflow: load → test → unload
run_full_workflow() {
    local load_profile="${LOAD_PROFILE:-p95}"
    local test_profile="${TEST_PROFILE:-load}"
    local env="${ENV:-rancher}"
    local service="${SERVICE:-client-oppy-configuration}"
    local scenario="${SCENARIO:-}"
    local k8s_mode="${K8S_MODE:-false}"
    local skip_unload="${SKIP_UNLOAD:-false}"
    
    log_header "STARTING FULL PERFORMANCE TEST WORKFLOW"
    
    echo "Configuration:"
    echo "  Load Profile:  $load_profile"
    echo "  Test Profile:  $test_profile"
    echo "  Environment:   $env"
    echo "  Service:       $service"
    [ -n "$scenario" ] && echo "  Scenario:      $scenario"
    echo ""
    
    # Step 1: Start cluster load
    log_header "STEP 1: LOADING CLUSTER"
    
    local load_args="--profile $load_profile --env $env"
    [ "$k8s_mode" = true ] && load_args="$load_args --k8s"
    
    "${ORCHESTRATOR_DIR}/load-cluster.sh" start $load_args
    
    # Wait for load to stabilize
    log_info "Waiting for load to stabilize (30 seconds)..."
    sleep 30
    
    # Step 2: Run tests
    log_header "STEP 2: RUNNING SERVICE TESTS"
    
    local test_result=0
    local test_args="--profile $test_profile --env $env"
    [ "$k8s_mode" = true ] && test_args="$test_args --k8s"
    
    if [ -n "$scenario" ]; then
        "${ORCHESTRATOR_DIR}/run-test.sh" --scenario "$scenario" $test_args || test_result=$?
    else
        "${ORCHESTRATOR_DIR}/run-test.sh" --service "$service" --all-scenarios $test_args || test_result=$?
    fi
    
    # Step 3: Stop cluster load
    if [ "$skip_unload" = false ]; then
        log_header "STEP 3: UNLOADING CLUSTER"
        "${ORCHESTRATOR_DIR}/load-cluster.sh" stop
    else
        log_warn "Skipping cluster unload (--skip-unload specified)"
    fi
    
    # Summary
    log_header "PERFORMANCE TEST COMPLETE"
    
    if [ $test_result -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed${NC}"
    else
        echo -e "${RED}✗ Some tests failed (exit code: $test_result)${NC}"
    fi
    
    echo ""
    echo "Results available in: ${ROOT_DIR}/results/"
    
    return $test_result
}

# Show help
show_help() {
    show_banner
    
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  full           Run full workflow: load → test → unload"
    echo "  load <action>  Manage cluster load (start|stop|status)"
    echo "  test           Run service tests (requires cluster load)"
    echo "  status         Show current status"
    echo "  help           Show this help"
    echo ""
    echo "Full Workflow Options:"
    echo "  --load-profile <name>   Cluster load profile (idle, light, p50, p95, p99, stress)"
    echo "  --test-profile <name>   Test profile (smoke, load, stress, soak)"
    echo "  --env <name>            Environment (rancher, minikube)"
    echo "  --service <name>        Target service for testing"
    echo "  --scenario <name>       Specific scenario to run (optional)"
    echo "  --k8s                   Run in Kubernetes mode"
    echo "  --skip-unload           Don't stop cluster load after tests"
    echo ""
    echo "Examples:"
    echo ""
    echo "  # Full workflow: Load cluster at p95, run all client-oppy tests"
    echo "  $0 full --service client-oppy-configuration --load-profile p95"
    echo ""
    echo "  # Full workflow: Stress test with specific scenario"
    echo "  $0 full --scenario bl01-golden-baseline --load-profile stress --test-profile stress"
    echo ""
    echo "  # Manual workflow: Start/stop cluster load separately"
    echo "  $0 load start --profile p95 --env rancher"
    echo "  $0 test --scenario bl01-golden-baseline --profile load"
    echo "  $0 test --service client-oppy-configuration --all-scenarios"
    echo "  $0 load stop"
    echo ""
    echo "  # Kubernetes distributed testing"
    echo "  $0 full --service client-oppy-configuration --load-profile p95 --k8s"
    echo ""
    echo "Load Profiles:"
    echo "  idle      Minimal activity (1 RPS base)"
    echo "  light     Light load (10 RPS base)"
    echo "  p50       Median production (50 RPS base)"
    echo "  p95       Peak production (100 RPS base) [default]"
    echo "  p99       Extreme peak (150 RPS base)"
    echo "  stress    Beyond capacity (200 RPS base)"
    echo "  soak      Sustained p95 for 4 hours"
    echo ""
    echo "Test Profiles:"
    echo "  smoke     Quick validation (~35 seconds)"
    echo "  load      Standard load test (~63 minutes)"
    echo "  stress    Find breaking point (~23 minutes)"
    echo "  soak      Memory leak detection (~4 hours)"
}

# Parse global options
parse_global_options() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --load-profile)
                export LOAD_PROFILE="$2"
                shift 2
                ;;
            --test-profile)
                export TEST_PROFILE="$2"
                shift 2
                ;;
            --env)
                export ENV="$2"
                shift 2
                ;;
            --service)
                export SERVICE="$2"
                shift 2
                ;;
            --scenario)
                export SCENARIO="$2"
                shift 2
                ;;
            --k8s)
                export K8S_MODE=true
                shift
                ;;
            --skip-unload)
                export SKIP_UNLOAD=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Main
main() {
    cd "$ROOT_DIR"
    
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        full)
            parse_global_options "$@"
            show_banner
            run_full_workflow
            ;;
        load)
            show_banner
            "${ORCHESTRATOR_DIR}/load-cluster.sh" "$@"
            ;;
        test)
            show_banner
            "${ORCHESTRATOR_DIR}/run-test.sh" "$@"
            ;;
        status)
            show_banner
            "${ORCHESTRATOR_DIR}/load-cluster.sh" status
            ;;
        build)
            show_banner
            log_info "Building scenario bundles..."
            npm run bundle
            ;;
        help|*)
            show_help
            ;;
    esac
}

main "$@"
