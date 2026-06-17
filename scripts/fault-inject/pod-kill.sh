#!/usr/bin/env bash
set -euo pipefail

# Fault injection: Kill a specific pod (simulate pod failure/eviction)

NAMESPACE="${NAMESPACE:-default}"
POD_LABEL="${POD_LABEL:-app=client-oppy-configuration}"
GRACE_PERIOD="${GRACE_PERIOD:-30}"
POD_INDEX="${POD_INDEX:-0}"  # which pod to kill (0-based)

PODS=$(kubectl get pods -l "$POD_LABEL" -n "$NAMESPACE" -o name)
POD_NAME=$(echo "$PODS" | sed -n "$((POD_INDEX + 1))p")

if [[ -z "$POD_NAME" ]]; then
  echo "[fault-inject] No pod found at index $POD_INDEX with label $POD_LABEL"
  exit 1
fi

echo "[fault-inject] Killing $POD_NAME (grace=$GRACE_PERIOD)..."
kubectl delete "$POD_NAME" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
echo "[fault-inject] Pod deleted. K8s will reschedule."

if [[ "${WAIT_READY:-true}" == "true" ]]; then
  echo "[fault-inject] Waiting for replacement pod..."
  sleep 5
  kubectl wait --for=condition=ready pod -l "$POD_LABEL" -n "$NAMESPACE" --timeout=120s
  echo "[fault-inject] Replacement pod ready."
fi
