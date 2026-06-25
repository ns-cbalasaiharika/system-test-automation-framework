#!/usr/bin/env bash
set -euo pipefail

# ─── K6 Distributed Test Runner (K8s) ────────────────────────────────────────
# Applies TestRun CRD to run k6 tests via the k6-operator in a K8s cluster.
# Uses webpack-bundled scenarios that include all dependencies.
#
# Usage:
#   ./scripts/run-distributed.sh --scenario bl01 --parallelism 4
#   ./scripts/run-distributed.sh --scenario bl01 --profile load --namespace k6-perf
#   ./scripts/run-distributed.sh --scenario bl01 --no-bundle  # skip bundling

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
K8S_DIR="$FRAMEWORK_ROOT/k8s"
DIST_DIR="$FRAMEWORK_ROOT/dist"

SCENARIO=""
PROFILE="load"
ENV_NAME="${ENV:-staging}"
PARALLELISM=4
NAMESPACE="k6-perf-testing"
CLEANUP=false
BASE_URL_OVERRIDE=""
SKIP_BUNDLE=false
TENANT_ID_OVERRIDE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BLUE}[k8s-perf]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --scenario|-s)     SCENARIO="$2"; shift 2 ;;
    --profile|-p)      PROFILE="$2"; shift 2 ;;
    --env|-e)          ENV_NAME="$2"; shift 2 ;;
    --parallelism)     PARALLELISM="$2"; shift 2 ;;
    --namespace|-n)    NAMESPACE="$2"; shift 2 ;;
    --cleanup)         CLEANUP=true; shift ;;
    --base-url)        BASE_URL_OVERRIDE="$2"; shift 2 ;;
    --tenant-id)       TENANT_ID_OVERRIDE="$2"; shift 2 ;;
    --no-bundle)       SKIP_BUNDLE=true; shift ;;
    --help|-h)
      echo "Usage: $0 --scenario <id> [options]"
      echo ""
      echo "Options:"
      echo "  --scenario, -s <id>    Scenario prefix (required, e.g., bl01)"
      echo "  --profile, -p <name>   Load profile (default: load)"
      echo "  --env, -e <name>       Environment (default: staging)"
      echo "  --parallelism <n>      Number of k6 runner pods (default: 4)"
      echo "  --namespace, -n <ns>   K8s namespace (default: k6-perf-testing)"
      echo "  --base-url <url>       Override service URL (for cross-cluster testing)"
      echo "  --tenant-id <id>       Override tenant ID"
      echo "  --no-bundle            Skip webpack bundling (use existing dist/)"
      echo "  --cleanup              Delete TestRun after completion"
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

[[ -z "$SCENARIO" ]] && fail "Specify --scenario"
command -v kubectl >/dev/null 2>&1 || fail "kubectl not found"

# ─── Bundle scenario if needed ───────────────────────────────────────────────
if [[ "$SKIP_BUNDLE" == "false" ]]; then
  log "Bundling scenario with webpack..."
  
  if [[ ! -f "$FRAMEWORK_ROOT/node_modules/.bin/webpack" ]]; then
    log "Installing dependencies..."
    (cd "$FRAMEWORK_ROOT" && npm install)
  fi
  
  (cd "$FRAMEWORK_ROOT" && npm run bundle) || fail "Webpack bundling failed"
  ok "Bundling complete"
fi

# ─── Find bundled scenario ───────────────────────────────────────────────────
BUNDLE_FILE=$(find "$DIST_DIR" -name "${SCENARIO}*.bundle.js" 2>/dev/null | head -1)
if [[ -z "$BUNDLE_FILE" ]]; then
  warn "Bundle not found in dist/, falling back to source file..."
  BUNDLE_FILE=$(find "$FRAMEWORK_ROOT/scenarios" -name "${SCENARIO}*.js" | head -1)
  [[ -z "$BUNDLE_FILE" ]] && fail "Scenario not found: ${SCENARIO}*.js"
  warn "Using unbundled file (may fail if dependencies aren't available)"
fi

BUNDLE_FILENAME=$(basename "$BUNDLE_FILE")
log "Using: $BUNDLE_FILENAME"

# ─── Ensure namespace exists ─────────────────────────────────────────────────
kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || {
  log "Creating namespace $NAMESPACE..."
  kubectl apply -f "$K8S_DIR/namespace.yaml"
}

# ─── Create ConfigMap from bundled scenario ──────────────────────────────────
CM_NAME="k6-scenario-${SCENARIO}"
log "Creating ConfigMap $CM_NAME..."
kubectl create configmap "$CM_NAME" \
  --from-file="test.js=$BUNDLE_FILE" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

# ─── Create ConfigMaps for config files ──────────────────────────────────────
CM_CONFIG_NAME="k6-config-${SCENARIO}"
log "Creating config ConfigMap $CM_CONFIG_NAME..."

# Flatten workload YAML files for ConfigMap (k8s doesn't support nested dirs)
WORKLOADS_TMPDIR=$(mktemp -d)
find "$FRAMEWORK_ROOT/config/workloads" -name '*.yaml' -exec cp {} "$WORKLOADS_TMPDIR/" \;

kubectl create configmap "$CM_CONFIG_NAME" \
  --from-file="$FRAMEWORK_ROOT/config/environments/" \
  --from-file="$FRAMEWORK_ROOT/config/profiles/" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

CM_WORKLOADS_NAME="k6-workloads-${SCENARIO}"
log "Creating workloads ConfigMap $CM_WORKLOADS_NAME..."
kubectl create configmap "$CM_WORKLOADS_NAME" \
  --from-file="$WORKLOADS_TMPDIR/" \
  --namespace="$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

rm -rf "$WORKLOADS_TMPDIR"

# ─── Build env vars section ──────────────────────────────────────────────────
ENV_VARS="      - name: ENV
        value: \"$ENV_NAME\"
      - name: PROFILE
        value: \"$PROFILE\""

if [[ -n "$BASE_URL_OVERRIDE" ]]; then
  ENV_VARS="$ENV_VARS
      - name: BASE_URL
        value: \"$BASE_URL_OVERRIDE\""
fi

if [[ -n "$TENANT_ID_OVERRIDE" ]]; then
  ENV_VARS="$ENV_VARS
      - name: TENANT_ID
        value: \"$TENANT_ID_OVERRIDE\""
fi

# ─── Apply TestRun CRD ───────────────────────────────────────────────────────
TESTRUN_NAME="${SCENARIO}-$(date +%s)"

log "Applying TestRun: $TESTRUN_NAME (parallelism=$PARALLELISM)..."
cat <<EOF | kubectl apply -f -
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: $TESTRUN_NAME
  namespace: $NAMESPACE
  labels:
    scenario: $SCENARIO
    profile: $PROFILE
    env: $ENV_NAME
spec:
  parallelism: $PARALLELISM
  script:
    configMap:
      name: $CM_NAME
      file: test.js
  runner:
    image: grafana/k6:latest
    env:
$ENV_VARS
    resources:
      requests:
        cpu: "500m"
        memory: "512Mi"
      limits:
        cpu: "1000m"
        memory: "1Gi"
    affinity:
      podAntiAffinity:
        preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: k6
              topologyKey: kubernetes.io/hostname
EOF

ok "TestRun $TESTRUN_NAME created"
echo ""
log "Monitor with:"
echo "  kubectl get testrun $TESTRUN_NAME -n $NAMESPACE -w"
echo "  kubectl logs -l k6_cr=$TESTRUN_NAME -n $NAMESPACE -f"
echo ""

# ─── Wait for completion ─────────────────────────────────────────────────────
log "Waiting for test to complete (timeout: 1h)..."
kubectl wait --for=jsonpath='{.status.stage}'=finished \
  "testrun/$TESTRUN_NAME" \
  --namespace="$NAMESPACE" \
  --timeout=3600s 2>/dev/null || {
  warn "Test still running or wait timed out. Check manually."
}

# ─── Show summary ────────────────────────────────────────────────────────────
log "Test completed. Fetching summary..."
kubectl logs -l k6_cr="$TESTRUN_NAME" -n "$NAMESPACE" --tail=50 2>/dev/null || true

if [[ "$CLEANUP" == "true" ]]; then
  log "Cleaning up TestRun $TESTRUN_NAME..."
  kubectl delete testrun "$TESTRUN_NAME" --namespace="$NAMESPACE"
  kubectl delete configmap "$CM_NAME" "$CM_CONFIG_NAME" "$CM_WORKLOADS_NAME" --namespace="$NAMESPACE" 2>/dev/null || true
  ok "Cleaned up"
fi
