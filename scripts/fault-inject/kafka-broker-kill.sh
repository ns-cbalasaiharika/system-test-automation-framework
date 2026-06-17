#!/usr/bin/env bash
set -euo pipefail

# Fault injection: Kill Kafka broker pod

NAMESPACE="${NAMESPACE:-default}"
KAFKA_LABEL="${KAFKA_LABEL:-app=kafka}"
GRACE_PERIOD="${GRACE_PERIOD:-0}"
BROKER_INDEX="${BROKER_INDEX:-0}"

PODS=$(kubectl get pods -l "$KAFKA_LABEL" -n "$NAMESPACE" -o name)
POD_NAME=$(echo "$PODS" | sed -n "$((BROKER_INDEX + 1))p")

if [[ -z "$POD_NAME" ]]; then
  echo "[fault-inject] No Kafka broker found at index $BROKER_INDEX"
  exit 1
fi

echo "[fault-inject] Killing Kafka broker $POD_NAME..."
kubectl delete "$POD_NAME" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
echo "[fault-inject] Kafka broker killed."

if [[ "${WAIT_READY:-true}" == "true" ]]; then
  echo "[fault-inject] Waiting for broker restart..."
  sleep 10
  kubectl wait --for=condition=ready pod -l "$KAFKA_LABEL" -n "$NAMESPACE" --timeout=300s
  echo "[fault-inject] Kafka broker ready."
fi
