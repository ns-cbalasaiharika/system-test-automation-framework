#!/bin/bash
# =============================================================================
# SERVICE TEST RUNNER
# Runs performance tests against specific services while cluster is loaded
#
# Usage:
#   ./run-test.sh --scenario bl01 --profile load --env rancher
#   ./run-test.sh --service client-oppy --all-scenarios --profile smoke
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOAD_STATE_FILE="${ROOT_DIR}/.cluster-load.state"
RESULTS_DIR="${ROOT_DIR}/results"

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
SCENARIO=""
SERVICE=""
PROFILE="load"
ENV="rancher"
ALL_SCENARIOS=false
CHECK_CLUSTER_LOAD=true
K8S_MODE=false
PARALLELISM=4
K6_ARGS=""

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --scenario)
                SCENARIO="$2"
                shift 2
                ;;
            --service)
                SERVICE="$2"
                shift 2
                ;;
            --profile)
                PROFILE="$2"
                shift 2
                ;;
            --env)
                ENV="$2"
                shift 2
                ;;
            --all-scenarios)
                ALL_SCENARIOS=true
                shift
                ;;
            --skip-cluster-check)
                CHECK_CLUSTER_LOAD=false
                shift
                ;;
            --k8s)
                K8S_MODE=true
                shift
                ;;
            --parallelism)
                PARALLELISM="$2"
                shift 2
                ;;
            --k6-args)
                K6_ARGS="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Check if cluster load is running
check_cluster_load() {
    if [ "$CHECK_CLUSTER_LOAD" = false ]; then
        log_warn "Skipping cluster load check"
        return 0
    fi
    
    if [ ! -f "$LOAD_STATE_FILE" ]; then
        log_error "Cluster load is not running!"
        log_info "Start cluster load first with: ./load-cluster.sh start --profile p95 --env $ENV"
        exit 1
    fi
    
    source "$LOAD_STATE_FILE"
    log_info "Cluster load is active:"
    log_info "  Profile: $PROFILE"
    log_info "  Started: $START_TIME"
}

# Find scenarios for a service
find_service_scenarios() {
    local service="$1"
    local scenarios=()
    
    # Search config/workloads for workload configs targeting this service
    for config in "${ROOT_DIR}"/config/workloads/**/*.yaml; do
        if grep -q "service: ${service}" "$config" 2>/dev/null; then
            local scenario_id=$(basename "$config" .yaml)
            scenarios+=("$scenario_id")
        fi
    done
    
    echo "${scenarios[@]}"
}

# Run a single scenario
run_scenario() {
    local scenario="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local result_file="${RESULTS_DIR}/${scenario}_${timestamp}.json"
    
    # Find the bundle (search recursively since bundles are nested by service/category)
    local bundle=""
    bundle=$(find "${ROOT_DIR}/dist" -name "${scenario}.bundle.js" -type f 2>/dev/null | head -1)
    
    if [ -z "$bundle" ]; then
        # Try partial match (e.g., bl01 matches bl01-golden-baseline.bundle.js)
        bundle=$(find "${ROOT_DIR}/dist" -name "${scenario}*.bundle.js" -type f 2>/dev/null | head -1)
    fi
    
    if [ -z "$bundle" ]; then
        log_error "Scenario bundle not found for: $scenario"
        log_info "Available bundles:"
        find "${ROOT_DIR}/dist" -name "*.bundle.js" -type f 2>/dev/null | head -10
        return 1
    fi
    
    log_info "Running scenario: $scenario"
    log_info "  Bundle: $bundle"
    log_info "  Profile: $PROFILE"
    log_info "  Environment: $ENV"
    
    mkdir -p "$RESULTS_DIR"
    
    if [ "$K8S_MODE" = true ]; then
        run_scenario_k8s "$scenario" "$bundle"
    else
        run_scenario_local "$scenario" "$bundle" "$result_file"
    fi
}

# Run scenario locally
run_scenario_local() {
    local scenario="$1"
    local bundle="$2"
    local result_file="$3"
    
    ENV="$ENV" PROFILE="$PROFILE" k6 run \
        --out json="$result_file" \
        $K6_ARGS \
        "$bundle"
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        log_info "Scenario $scenario completed successfully"
        log_info "Results: $result_file"
    else
        log_error "Scenario $scenario failed with exit code: $exit_code"
    fi
    
    return $exit_code
}

# Run scenario in Kubernetes
run_scenario_k8s() {
    local scenario="$1"
    local bundle="$2"
    local testrun_name="test-${scenario}-$(date +%s)"
    
    # Create ConfigMap with the test script
    kubectl create configmap "${testrun_name}-script" \
        --from-file=test.js="$bundle" \
        -n k6-perf-testing \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create TestRun
    cat <<EOF | kubectl apply -f -
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: $testrun_name
  namespace: k6-perf-testing
spec:
  parallelism: $PARALLELISM
  script:
    configMap:
      name: ${testrun_name}-script
      file: test.js
  runner:
    env:
      - name: ENV
        value: "$ENV"
      - name: PROFILE
        value: "$PROFILE"
EOF

    log_info "TestRun created: $testrun_name"
    log_info "Monitor with: kubectl get testrun $testrun_name -n k6-perf-testing -w"
    log_info "Logs: kubectl logs -l k6_cr=$testrun_name -n k6-perf-testing -f"
    
    # Wait for completion
    log_info "Waiting for test to complete..."
    kubectl wait --for=condition=TestRunCompleted testrun/$testrun_name -n k6-perf-testing --timeout=1h
    
    # Get results
    log_info "Test completed. Check logs for results."
}

# Run all scenarios for a service
run_all_scenarios() {
    local service="$1"
    local scenarios=($(find_service_scenarios "$service"))
    
    if [ ${#scenarios[@]} -eq 0 ]; then
        log_error "No scenarios found for service: $service"
        exit 1
    fi
    
    log_info "Found ${#scenarios[@]} scenarios for service: $service"
    
    local passed=0
    local failed=0
    local results=()
    
    for scenario in "${scenarios[@]}"; do
        log_status "Running scenario: $scenario"
        if run_scenario "$scenario"; then
            ((passed++))
            results+=("✓ $scenario")
        else
            ((failed++))
            results+=("✗ $scenario")
        fi
        echo ""
    done
    
    # Summary
    echo ""
    log_status "Test Summary"
    echo "────────────────────────────────────────"
    echo "Service: $service"
    echo "Total:   ${#scenarios[@]}"
    echo "Passed:  $passed"
    echo "Failed:  $failed"
    echo ""
    for result in "${results[@]}"; do
        echo "  $result"
    done
    echo "────────────────────────────────────────"
    
    [ $failed -eq 0 ] && return 0 || return 1
}

# Main
main() {
    parse_args "$@"
    
    # Validate arguments
    if [ -z "$SCENARIO" ] && [ -z "$SERVICE" ]; then
        echo "Service Test Runner"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --scenario <name>     Run specific scenario (e.g., bl01-golden-baseline)"
        echo "  --service <name>      Run scenarios for a service"
        echo "  --all-scenarios       Run all scenarios for the service"
        echo "  --profile <name>      Test profile (smoke, load, stress, soak)"
        echo "  --env <name>          Environment (rancher, minikube, local)"
        echo "  --k8s                 Run in Kubernetes mode"
        echo "  --parallelism <n>     K8s parallelism (default: 4)"
        echo "  --skip-cluster-check  Skip cluster load verification"
        echo "  --k6-args <args>      Additional k6 arguments"
        echo ""
        echo "Examples:"
        echo "  $0 --scenario bl01-golden-baseline --profile load --env rancher"
        echo "  $0 --service client-oppy-configuration --all-scenarios --profile smoke"
        echo "  $0 --scenario bl01-golden-baseline --k8s --parallelism 4"
        echo ""
        echo "Note: Ensure cluster load is running before running tests."
        echo "      Use: ./load-cluster.sh start --profile p95 --env rancher"
        exit 1
    fi
    
    # Check cluster load
    check_cluster_load
    
    # Check bundle exists
    if [ ! -d "${ROOT_DIR}/dist" ]; then
        log_info "Building bundles..."
        cd "$ROOT_DIR" && npm run bundle
    fi
    
    # Run tests
    if [ -n "$SCENARIO" ]; then
        run_scenario "$SCENARIO"
    elif [ -n "$SERVICE" ]; then
        if [ "$ALL_SCENARIOS" = true ]; then
            run_all_scenarios "$SERVICE"
        else
            log_error "Specify --all-scenarios or use --scenario for a specific test"
            exit 1
        fi
    fi
}

main "$@"
