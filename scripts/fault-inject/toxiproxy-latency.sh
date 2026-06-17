#!/usr/bin/env bash
set -euo pipefail

# Fault injection: Add latency via toxiproxy
# Requires toxiproxy deployed and accessible

TOXIPROXY_URL="${TOXIPROXY_URL:-http://localhost:8474}"
PROXY_NAME="${PROXY_NAME:-redis}"
LATENCY_MS="${LATENCY_MS:-100}"
JITTER_MS="${JITTER_MS:-10}"
ACTION="${ACTION:-add}"  # add | remove

case "$ACTION" in
  add)
    echo "[fault-inject] Adding ${LATENCY_MS}ms latency to proxy '$PROXY_NAME'..."
    curl -s -X POST "$TOXIPROXY_URL/proxies/$PROXY_NAME/toxics" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"latency_downstream\",
        \"type\": \"latency\",
        \"stream\": \"downstream\",
        \"attributes\": {\"latency\": $LATENCY_MS, \"jitter\": $JITTER_MS}
      }" | python3 -m json.tool
    echo "[fault-inject] Latency toxic added."
    ;;
  remove)
    echo "[fault-inject] Removing latency toxic from proxy '$PROXY_NAME'..."
    curl -s -X DELETE "$TOXIPROXY_URL/proxies/$PROXY_NAME/toxics/latency_downstream"
    echo "[fault-inject] Latency toxic removed."
    ;;
  *)
    echo "Usage: ACTION=add|remove $0"
    exit 1
    ;;
esac
