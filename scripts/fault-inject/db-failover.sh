#!/usr/bin/env bash
set -euo pipefail

# Fault injection: MariaDB RW node failover
# Kills the primary node to trigger Galera failover

NAMESPACE="${NAMESPACE:-default}"
DB_LABEL="${DB_LABEL:-app=mariadb,role=primary}"
GRACE_PERIOD="${GRACE_PERIOD:-0}"

echo "[fault-inject] Killing MariaDB primary (namespace=$NAMESPACE, label=$DB_LABEL)..."
kubectl delete pod -l "$DB_LABEL" -n "$NAMESPACE" --grace-period="$GRACE_PERIOD"
echo "[fault-inject] MariaDB primary killed. Galera will elect new primary."

if [[ "${WAIT_READY:-true}" == "true" ]]; then
  echo "[fault-inject] Waiting for new primary..."
  sleep 5
  kubectl wait --for=condition=ready pod -l "$DB_LABEL" -n "$NAMESPACE" --timeout=300s
  echo "[fault-inject] New primary ready."
fi
