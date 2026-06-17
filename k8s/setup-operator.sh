#!/usr/bin/env bash
set -euo pipefail

# ─── K6 Operator Setup ───────────────────────────────────────────────────────
# One-time setup script for any K8s cluster (Minikube, Rancher, EKS, etc.)
# Installs k6-operator and creates the perf-testing namespace.
#
# Usage:
#   ./k8s/setup-operator.sh                  # Install with defaults
#   ./k8s/setup-operator.sh --method helm    # Install via Helm
#   ./k8s/setup-operator.sh --uninstall      # Remove operator

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METHOD="${1:-bundle}"  # bundle | helm
ACTION="install"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[setup]${NC} $*"; }
ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --method)    METHOD="$2"; shift 2 ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --help|-h)
      echo "Usage: $0 [--method bundle|helm] [--uninstall]"
      exit 0
      ;;
    *) shift ;;
  esac
done

command -v kubectl >/dev/null 2>&1 || fail "kubectl not found"

# ─── Verify cluster connectivity ─────────────────────────────────────────────
log "Checking cluster connectivity..."
kubectl cluster-info >/dev/null 2>&1 || fail "Cannot connect to cluster. Check your kubeconfig."
CONTEXT=$(kubectl config current-context)
ok "Connected to cluster: $CONTEXT"

if [[ "$ACTION" == "uninstall" ]]; then
  log "Uninstalling k6-operator..."
  if [[ "$METHOD" == "helm" ]]; then
    helm uninstall k6-operator --namespace k6-operator-system 2>/dev/null || true
  else
    kubectl delete -f https://github.com/grafana/k6-operator/releases/latest/download/bundle.yaml 2>/dev/null || true
  fi
  kubectl delete namespace k6-perf-testing 2>/dev/null || true
  ok "k6-operator removed."
  exit 0
fi

# ─── Install k6-operator ─────────────────────────────────────────────────────
log "Installing k6-operator (method: $METHOD)..."

case "$METHOD" in
  bundle)
    kubectl apply -f https://github.com/grafana/k6-operator/releases/latest/download/bundle.yaml
    ;;
  helm)
    helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
    helm repo update
    helm upgrade --install k6-operator grafana/k6-operator \
      --namespace k6-operator-system \
      --create-namespace \
      --wait
    ;;
  *)
    fail "Unknown method: $METHOD (use 'bundle' or 'helm')"
    ;;
esac

# ─── Wait for operator to be ready ──────────────────────────────────────────
log "Waiting for k6-operator to be ready..."
kubectl wait --for=condition=available deployment/k6-operator-controller-manager \
  --namespace k6-operator-system \
  --timeout=120s 2>/dev/null || {
  log "Operator may still be starting. Check: kubectl get pods -n k6-operator-system"
}

# ─── Create perf-testing namespace ───────────────────────────────────────────
log "Creating k6-perf-testing namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml"

# ─── Apply RBAC ─────────────────────────────────────────────────────────────
log "Applying RBAC..."
kubectl apply -f "$SCRIPT_DIR/supporting/rbac.yaml"

ok "Setup complete!"
echo ""
echo "  Cluster:   $CONTEXT"
echo "  Namespace: k6-perf-testing"
echo "  Operator:  k6-operator-system"
echo ""
echo "  Next steps:"
echo "    make run-k8s SCENARIO=bl01 ENV=minikube PARALLELISM=2"
echo ""
