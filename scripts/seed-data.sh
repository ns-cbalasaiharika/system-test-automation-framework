#!/usr/bin/env bash
set -euo pipefail

# ─── Seed Test Data ──────────────────────────────────────────────────────────
# Pre-seeds the target environment with config data for load testing.
#
# Usage:
#   ./scripts/seed-data.sh                          # local defaults
#   ./scripts/seed-data.sh --count 50 --tenants 10  # custom counts
#   ./scripts/seed-data.sh --cleanup                # remove k6 test data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_URL="${BASE_URL:-http://localhost:6010}"
TENANT_ID="${TENANT_ID:-12345}"
COUNT=10
TENANT_COUNT=1
CLEANUP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)      BASE_URL="$2"; shift 2 ;;
    --tenant)   TENANT_ID="$2"; shift 2 ;;
    --count)    COUNT="$2"; shift 2 ;;
    --tenants)  TENANT_COUNT="$2"; shift 2 ;;
    --cleanup)  CLEANUP=true; shift ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo "  --url <url>         Base URL (default: http://localhost:6010)"
      echo "  --tenant <id>       Tenant ID (default: 12345)"
      echo "  --count <n>         Configs per tenant (default: 10)"
      echo "  --tenants <n>       Number of tenants (default: 1)"
      echo "  --cleanup           Remove k6-created test data"
      exit 0
      ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

HEADERS=(
  -H "Content-Type: application/json"
  -H "x-netskope-user-email: k6-seed@netskope.com"
)

if [[ "$CLEANUP" == "true" ]]; then
  echo "Cleaning up k6 test data..."
  for t in $(seq 1 "$TENANT_COUNT"); do
    tid="$TENANT_ID"
    [[ $TENANT_COUNT -gt 1 ]] && tid="tenant-$t"

    ids=$(curl -s "${HEADERS[@]}" -H "x-netskope-tenantid: $tid" "$BASE_URL/client/config" | \
      python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        for c in data.get('data', []):
            if int(c['id']) > 5 and c.get('configurationName','').startswith('k6-'):
                print(c['id'])
except: pass
" 2>/dev/null || true)

    count=0
    for id in $ids; do
      curl -s -X DELETE "${HEADERS[@]}" -H "x-netskope-tenantid: $tid" "$BASE_URL/client/config/$id" >/dev/null 2>&1
      count=$((count + 1))
    done
    echo "  Tenant $tid: deleted $count configs"
  done
  echo "Done."
  exit 0
fi

echo "Seeding $COUNT configs across $TENANT_COUNT tenant(s)..."
total=0
for t in $(seq 1 "$TENANT_COUNT"); do
  tid="$TENANT_ID"
  [[ $TENANT_COUNT -gt 1 ]] && tid="tenant-$t"

  for i in $(seq 1 "$COUNT"); do
    body=$(cat <<EOF
{"configurationName":"k6-seed-${t}-${i}","targets":[{"type":"user_group","values":[{"id":"seed-grp-${t}-${i}","name":"seed-group-${t}-${i}"}]}]}
EOF
    )
    status=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${HEADERS[@]}" -H "x-netskope-tenantid: $tid" \
      -d "$body" "$BASE_URL/client/config")

    if [[ "$status" == "201" ]]; then
      total=$((total + 1))
    fi
  done
  echo "  Tenant $tid: seeded $COUNT configs"
done

echo "Done. Total created: $total"
