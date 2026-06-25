#!/usr/bin/env bash
set -euo pipefail

# ─── K6 Performance Test Runner ──────────────────────────────────────────────
# Config-driven runner that resolves scenario, profile, and environment.
# Runs webpack-bundled TypeScript scenarios with YAML configs.
#
# Usage:
#   ./scripts/run.sh --scenario bl01 --profile smoke --env local
#   ./scripts/run.sh --scenario bl01                    # defaults: profile=load, env=local
#   ./scripts/run.sh --all --profile smoke              # run all scenarios with smoke
#   ./scripts/run.sh --category baseline --profile smoke
#   ./scripts/run.sh --service client-oppy --profile smoke

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$FRAMEWORK_ROOT/config"
DIST_DIR="$FRAMEWORK_ROOT/dist"
RESULTS_DIR="$FRAMEWORK_ROOT/results"

# ─── Defaults ────────────────────────────────────────────────────────────────
SCENARIO=""
PROFILE="load"
ENV_NAME="local"
RUN_ALL=false
CATEGORY=""
PRIORITY=""
SERVICE=""
K6_EXTRA_ARGS=""
SKIP_BUNDLE=false

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[perf]${NC} $*"; }
ok()   { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

# ─── Parse Arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --scenario|-s)   SCENARIO="$2"; shift 2 ;;
    --profile|-p)    PROFILE="$2"; shift 2 ;;
    --env|-e)        ENV_NAME="$2"; shift 2 ;;
    --all|-a)        RUN_ALL=true; shift ;;
    --category|-c)   CATEGORY="$2"; shift 2 ;;
    --priority)      PRIORITY="$2"; shift 2 ;;
    --service)       SERVICE="$2"; shift 2 ;;
    --k6-args)       K6_EXTRA_ARGS="$2"; shift 2 ;;
    --no-bundle)     SKIP_BUNDLE=true; shift ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --scenario, -s <id>    Scenario prefix (e.g., bl01, am-bl01)"
      echo "  --profile, -p <name>   Load profile: smoke|load|stress|soak|spike (default: load)"
      echo "  --env, -e <name>       Environment: local|minikube|rancher|staging (default: local)"
      echo "  --all, -a              Run all discovered scenarios"
      echo "  --category, -c <cat>   Filter by category: baseline|single-fault|..."
      echo "  --service <name>       Filter by service: client-oppy|addonman|..."
      echo "  --priority <P0|P1|P2>  Filter by priority"
      echo "  --no-bundle            Skip webpack bundling (use existing dist/)"
      echo "  --k6-args <args>       Additional k6 CLI arguments"
      echo "  --help, -h             Show this help"
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ─── Validation ──────────────────────────────────────────────────────────────
if [[ "$RUN_ALL" == "false" && -z "$SCENARIO" && -z "$CATEGORY" && -z "$PRIORITY" && -z "$SERVICE" ]]; then
  fail "Specify --scenario, --all, --category, --service, or --priority"
  exit 1
fi

# Validate environment config exists (YAML)
if [[ ! -f "$CONFIG_DIR/environments/$ENV_NAME.yaml" ]]; then
  fail "Environment not found: $CONFIG_DIR/environments/$ENV_NAME.yaml"
  exit 1
fi

# Validate profile config exists (YAML)
if [[ ! -f "$CONFIG_DIR/profiles/$PROFILE.yaml" ]]; then
  fail "Profile not found: $CONFIG_DIR/profiles/$PROFILE.yaml"
  exit 1
fi

command -v k6 >/dev/null 2>&1 || { fail "k6 not installed (brew install k6)"; exit 1; }

mkdir -p "$RESULTS_DIR"

# ─── Bundle if needed ────────────────────────────────────────────────────────
ensure_bundle() {
  if [[ "$SKIP_BUNDLE" == "true" ]]; then
    return
  fi

  if [[ ! -d "$DIST_DIR" ]] || [[ -z "$(find "$DIST_DIR" -name '*.bundle.js' 2>/dev/null | head -1)" ]]; then
    log "No bundles found. Running webpack..."
    (cd "$FRAMEWORK_ROOT" && npm run bundle) || { fail "Webpack bundling failed"; exit 1; }
    ok "Bundling complete"
  fi
}

# ─── Discover Workload Configs ───────────────────────────────────────────────
discover_scenarios() {
  local scenarios=()

  while IFS= read -r -d '' config_file; do
    # Skip READMEs
    [[ "$(basename "$config_file")" == "README.md" ]] && continue

    local id category priority service_name
    id=$(python3 -c "import yaml; print(yaml.safe_load(open('$config_file')).get('id',''))" 2>/dev/null || echo "")
    category=$(python3 -c "import yaml; print(yaml.safe_load(open('$config_file')).get('category',''))" 2>/dev/null || echo "")
    priority=$(python3 -c "import yaml; print(yaml.safe_load(open('$config_file')).get('priority',''))" 2>/dev/null || echo "")
    service_name=$(python3 -c "import yaml; print(yaml.safe_load(open('$config_file')).get('service',''))" 2>/dev/null || echo "")

    # Filter by scenario prefix
    if [[ -n "$SCENARIO" ]]; then
      local prefix="${SCENARIO,,}"
      local file_base
      file_base=$(basename "$config_file" .yaml | tr '[:upper:]' '[:lower:]')
      [[ "$file_base" != *"$prefix"* ]] && continue
    fi

    # Filter by category
    if [[ -n "$CATEGORY" && "$category" != "$CATEGORY" ]]; then
      continue
    fi

    # Filter by priority
    if [[ -n "$PRIORITY" && "$priority" != "$PRIORITY" ]]; then
      continue
    fi

    # Filter by service
    if [[ -n "$SERVICE" && "$service_name" != *"$SERVICE"* ]]; then
      continue
    fi

    scenarios+=("$(basename "$config_file" .yaml)")
  done < <(find "$CONFIG_DIR/workloads" -name '*.yaml' -print0 2>/dev/null)

  echo "${scenarios[@]}"
}

# ─── Find Bundle for Scenario ────────────────────────────────────────────────
find_bundle() {
  local scenario_id="$1"

  # Search dist/ for matching bundle
  local bundle
  bundle=$(find "$DIST_DIR" -name "${scenario_id}*.bundle.js" 2>/dev/null | head -1)

  if [[ -n "$bundle" ]]; then
    echo "$bundle"
    return
  fi

  # Broader search: try partial match
  bundle=$(find "$DIST_DIR" -name "*${scenario_id}*.bundle.js" 2>/dev/null | head -1)
  if [[ -n "$bundle" ]]; then
    echo "$bundle"
    return
  fi

  echo ""
}

# ─── Run Single Scenario ─────────────────────────────────────────────────────
run_single() {
  local scenario_id="$1"
  local bundle_path
  bundle_path=$(find_bundle "$scenario_id")

  if [[ -z "$bundle_path" ]]; then
    fail "Bundle not found for scenario: $scenario_id"
    warn "Run 'npm run bundle' or 'make bundle' first"
    return 1
  fi

  # Get scenario name from workload config
  local name="$scenario_id"
  local config_file
  config_file=$(find "$CONFIG_DIR/workloads" -name "${scenario_id}.yaml" 2>/dev/null | head -1)
  if [[ -n "$config_file" ]]; then
    name=$(python3 -c "import yaml; print(yaml.safe_load(open('$config_file')).get('name','$scenario_id'))" 2>/dev/null || echo "$scenario_id")
  fi

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "Scenario: ${BOLD}$name${NC} ($scenario_id)"
  log "Profile:  $PROFILE | Env: $ENV_NAME"
  log "Bundle:   $(basename "$bundle_path")"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  local exit_code=0
  k6 run \
    -e "ENV=$ENV_NAME" \
    -e "PROFILE=$PROFILE" \
    $K6_EXTRA_ARGS \
    "$bundle_path" 2>&1 || exit_code=$?

  return $exit_code
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║     K6 Performance Test Framework                          ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  log "Environment: $ENV_NAME | Profile: $PROFILE"

  ensure_bundle

  local scenarios
  scenarios=$(discover_scenarios)

  if [[ -z "$scenarios" ]]; then
    fail "No scenarios found matching criteria"
    exit 1
  fi

  local total=0 passed=0 failed=0
  local failed_list=()

  for scenario_id in $scenarios; do
    total=$((total + 1))
    if run_single "$scenario_id"; then
      passed=$((passed + 1))
      ok "$scenario_id"
    else
      failed=$((failed + 1))
      failed_list+=("$scenario_id")
      fail "$scenario_id (threshold violations)"
    fi
  done

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  Total: $total  ${GREEN}Passed: $passed${NC}  ${RED}Failed: $failed${NC}"
  if [[ ${#failed_list[@]} -gt 0 ]]; then
    echo -e "  Failed: ${RED}${failed_list[*]}${NC}"
  fi
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  [[ $failed -eq 0 ]]
}

main
