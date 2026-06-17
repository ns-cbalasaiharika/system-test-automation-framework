#!/usr/bin/env bash
set -euo pipefail

# Fault injection: Redis restart (simulates cache loss)
# Testkube-ready: atomic, single-purpose, idempotent

NAMESPACE="${NAMESPACE:-default}"
REDIS_LABEL="${REDIS_LABEL:-app=redis}"
GRACE_PERIOD="${GRACE_PERIOD:-0}"

echo "[fault-inject] Killing Redis pod (namespace=$NAMESPACE, label=$REDIS_LABEL)..."
kubectl delete pod -l "$REDIS_LABEL" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
echo "[fault-inject] Redis pod deleted. K8s will restart it."

if [[ "${WAIT_READY:-true}" == "true" ]]; then
  echo "[fault-inject] Waiting for Redis pod to be ready..."
  kubectl wait --for=condition=ready pod -l "$REDIS_LABEL" -n "$NAMESPACE" --timeout=120s
  echo "[fault-inject] Redis pod ready."
fi
