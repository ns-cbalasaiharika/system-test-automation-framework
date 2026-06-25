#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Build client-oppy Docker images locally (without artifactory access)
# Uses public base images instead of Netskope artifactory images
#
# Usage:
#   ./scripts/build-local-images.sh                    # Build all
#   ./scripts/build-local-images.sh configuration     # Build one service
# =============================================================================

CLIENT_OPPY_DIR="/Users/cbalasaiharika/Desktop/code/client-oppy"
SERVICE="${1:-all}"

# Public base images (instead of artifactory)
GOLANG_IMAGE="golang:1.22-bookworm"
RUNTIME_IMAGE="debian:bookworm-slim"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[build]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

build_service() {
  local svc="$1"
  local tag="client-oppy-${svc}:local"
  
  log "Building $tag..."
  
  cd "$CLIENT_OPPY_DIR"
  
  docker build \
    --build-arg GOLANG_IMAGE="$GOLANG_IMAGE" \
    --build-arg RUNTIME_IMAGE="$RUNTIME_IMAGE" \
    --build-arg VER="local" \
    --build-arg GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
    --build-arg BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -f "docker/${svc}/Dockerfile" \
    -t "$tag" \
    .
  
  ok "Built $tag"
}

load_to_minikube() {
  local svc="$1"
  local tag="client-oppy-${svc}:local"
  
  log "Loading $tag into minikube..."
  minikube image load "$tag"
  ok "Loaded $tag into minikube"
}

# Check prerequisites
command -v docker >/dev/null 2>&1 || fail "docker not installed"
[[ -d "$CLIENT_OPPY_DIR" ]] || fail "client-oppy repo not found at $CLIENT_OPPY_DIR"

# Build services
if [[ "$SERVICE" == "all" ]]; then
  for svc in configuration orchestrator steering; do
    build_service "$svc"
    if minikube status >/dev/null 2>&1; then
      load_to_minikube "$svc"
    fi
  done
else
  build_service "$SERVICE"
  if minikube status >/dev/null 2>&1; then
    load_to_minikube "$SERVICE"
  fi
fi

echo ""
log "To use in minikube, update values files:"
echo "  image.repository: client-oppy-configuration"
echo "  image.tag: local"
echo "  image.pullPolicy: Never"
