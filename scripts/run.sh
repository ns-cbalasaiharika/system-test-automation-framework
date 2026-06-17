#!/usr/bin/env bash
set -euo pipefail

# ─── K6 Performance Test Runner ──────────────────────────────────────────────
# Config-driven runner that resolves scenario, profile, and environment.
#
# Usage:
#   ./scripts/run.sh --scenario bl01 --profile smoke --env local
#   ./scripts/run.sh --scenario bl01                    # defaults: profile=load, env=local
#   ./scripts/run.sh --all --profile smoke              # run all scenarios with smoke
#   ./scripts/run.sh --category baseline --profile smoke
#   ./scripts/run.sh --priority P0 --profile smoke

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$FRAMEWORK_ROOT/config"
SCENARIOS_DIR="$FRAMEWORK_ROOT/scenarios"
RESULTS_DIR="$FRAMEWORK_ROOT/results"

# ─── Defaults ────────────────────────────────────────────────────────────────
SCENARIO=""
PROFILE="load"
ENV_NAME="local"
RUN_ALL=false
CATEGORY=""
PRIORITY=""
K6_EXTRA_ARGS=""

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
    --k6-args)       K6_EXTRA_ARGS="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --scenario, -s <id>    Scenario prefix (e.g., bl01, sf01)"
      echo "  --profile, -p <name>   Load profile: smoke|load|stress|soak|spike (default: load)"
      echo "  --env, -e <name>       Environment: local|staging|production (default: local)"
      echo "  --all, -a              Run all discovered scenarios"
      echo "  --category, -c <cat>   Filter by category: baseline|single-fault|..."
      echo "  --priority <P0|P1|P2>  Filter by priority"
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
if [[ "$RUN_ALL" == "false" && -z "$SCENARIO" && -z "$CATEGORY" && -z "$PRIORITY" ]]; then
  fail "Specify --scenario, --all, --category, or --priority"
  exit 1
fi

if [[ ! -f "$CONFIG_DIR/profiles/$PROFILE.json" ]]; then
  fail "Profile not found: $CONFIG_DIR/profiles/$PROFILE.json"
  exit 1
fi

if [[ ! -f "$CONFIG_DIR/environments/$ENV_NAME.json" ]]; then
  fail "Environment not found: $CONFIG_DIR/environments/$ENV_NAME.json"
  exit 1
fi

command -v k6 >/dev/null 2>&1 || { fail "k6 not installed (brew install k6)"; exit 1; }

mkdir -p "$RESULTS_DIR"

# ─── Discover Scenarios ──────────────────────────────────────────────────────
discover_scenarios() {
  local scenarios=()

  for config_file in "$CONFIG_DIR/scenarios"/*.json; do
    [[ "$(basename "$config_file")" == "_template.json" ]] && continue

    local id category priority
    id=$(python3 -c "import json; print(json.load(open('$config_file'))['id'])" 2>/dev/null || echo "")
    category=$(python3 -c "import json; print(json.load(open('$config_file'))['category'])" 2>/dev/null || echo "")
    priority=$(python3 -c "import json; print(json.load(open('$config_file'))['priority'])" 2>/dev/null || echo "")

    if [[ -n "$SCENARIO" ]]; then
      local prefix="${SCENARIO,,}"
      local file_prefix
      file_prefix=$(basename "$config_file" .json | cut -d'-' -f1-2 | tr '[:upper:]' '[:lower:]')
      [[ "$file_prefix" != *"$prefix"* ]] && continue
    fi

    if [[ -n "$CATEGORY" && "$category" != "$CATEGORY" ]]; then
      continue
    fi

    if [[ -n "$PRIORITY" && "$priority" != "$PRIORITY" ]]; then
      continue
    fi

    scenarios+=("$(basename "$config_file" .json)")
  done

  echo "${scenarios[@]}"
}

# ─── Resolve Script Path ─────────────────────────────────────────────────────
resolve_script() {
  local scenario_id="$1"
  local config_file="$CONFIG_DIR/scenarios/${scenario_id}.json"

  if [[ ! -f "$config_file" ]]; then
    echo ""
    return
  fi

  local category
  category=$(python3 -c "import json; print(json.load(open('$config_file'))['category'])" 2>/dev/null || echo "")

  local script_path="$SCENARIOS_DIR/$category/$scenario_id.js"
  if [[ -f "$script_path" ]]; then
    echo "$script_path"
  else
    echo ""
  fi
}

# ─── Run Single Scenario ─────────────────────────────────────────────────────
run_single() {
  local scenario_id="$1"
  local script_path
  script_path=$(resolve_script "$scenario_id")

  if [[ -z "$script_path" ]]; then
    fail "Script not found for scenario: $scenario_id"
    return 1
  fi

  local config_file="$CONFIG_DIR/scenarios/${scenario_id}.json"
  local name
  name=$(python3 -c "import json; print(json.load(open('$config_file'))['name'])" 2>/dev/null || echo "$scenario_id")

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "Scenario: ${BOLD}$name${NC} ($scenario_id)"
  log "Profile:  $PROFILE | Env: $ENV_NAME"
  log "Script:   $script_path"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  local exit_code=0
  k6 run \
    -e "ENV=$ENV_NAME" \
    -e "PROFILE=$PROFILE" \
    $K6_EXTRA_ARGS \
    "$script_path" 2>&1 || exit_code=$?

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
