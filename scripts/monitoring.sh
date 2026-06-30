#!/bin/bash
# =============================================================================
# MONITORING HELPER
# 
# Start/stop Prometheus and Grafana port-forwards for local access.
#
# Usage:
#   ./scripts/monitoring.sh start    # Start port-forwards
#   ./scripts/monitoring.sh stop     # Stop port-forwards
#   ./scripts/monitoring.sh status   # Check status
#   ./scripts/monitoring.sh urls     # Show access URLs
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROMETHEUS_PORT=9090
GRAFANA_PORT=3000

show_urls() {
    echo ""
    echo "=========================================="
    echo "  MONITORING URLS"
    echo "=========================================="
    echo ""
    echo "  Prometheus: http://localhost:${PROMETHEUS_PORT}"
    echo "  Grafana:    http://localhost:${GRAFANA_PORT}"
    echo ""
    echo "  Grafana Login:"
    echo "    Username: admin"
    echo "    Password: admin123"
    echo ""
    echo "=========================================="
    echo ""
    echo "  Sample Prometheus Queries for k6:"
    echo "    - k6_http_reqs_total"
    echo "    - k6_http_req_duration_seconds"  
    echo "    - histogram_quantile(0.95, k6_http_req_duration_seconds_bucket)"
    echo "    - k6_errors_rate"
    echo "    - rate(k6_http_reqs_total[1m])"
    echo ""
    echo "=========================================="
}

start_monitoring() {
    echo -e "${BLUE}[INFO]${NC} Starting monitoring port-forwards..."
    
    # Kill any existing port-forwards
    pkill -f "port-forward.*${PROMETHEUS_PORT}" 2>/dev/null || true
    pkill -f "port-forward.*${GRAFANA_PORT}" 2>/dev/null || true
    sleep 1
    
    # Check if monitoring namespace exists
    if ! kubectl get namespace monitoring &>/dev/null; then
        echo -e "${RED}[ERROR]${NC} Monitoring namespace not found."
        echo "Install Prometheus first with:"
        echo "  helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace"
        exit 1
    fi
    
    # Start Prometheus port-forward
    nohup kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus ${PROMETHEUS_PORT}:9090 \
        > /tmp/prometheus-pf.log 2>&1 &
    echo $! > /tmp/prometheus-pf.pid
    
    # Start Grafana port-forward
    nohup kubectl port-forward -n monitoring svc/prometheus-grafana ${GRAFANA_PORT}:80 \
        > /tmp/grafana-pf.log 2>&1 &
    echo $! > /tmp/grafana-pf.pid
    
    sleep 3
    
    # Verify
    if curl -s "http://localhost:${PROMETHEUS_PORT}/api/v1/status/runtimeinfo" >/dev/null 2>&1; then
        echo -e "${GREEN}[SUCCESS]${NC} Prometheus is ready"
    else
        echo -e "${YELLOW}[WARN]${NC} Prometheus may not be accessible yet"
    fi
    
    if curl -s "http://localhost:${GRAFANA_PORT}/api/health" >/dev/null 2>&1; then
        echo -e "${GREEN}[SUCCESS]${NC} Grafana is ready"
    else
        echo -e "${YELLOW}[WARN]${NC} Grafana may not be accessible yet"
    fi
    
    show_urls
}

stop_monitoring() {
    echo -e "${BLUE}[INFO]${NC} Stopping monitoring port-forwards..."
    
    pkill -f "port-forward.*${PROMETHEUS_PORT}" 2>/dev/null || true
    pkill -f "port-forward.*${GRAFANA_PORT}" 2>/dev/null || true
    
    rm -f /tmp/prometheus-pf.pid /tmp/grafana-pf.pid 2>/dev/null || true
    
    echo -e "${GREEN}[SUCCESS]${NC} Monitoring port-forwards stopped"
}

check_status() {
    echo ""
    echo "=========================================="
    echo "  MONITORING STATUS"
    echo "=========================================="
    echo ""
    
    # Check Prometheus
    if curl -s "http://localhost:${PROMETHEUS_PORT}/api/v1/status/runtimeinfo" >/dev/null 2>&1; then
        echo -e "  Prometheus: ${GREEN}RUNNING${NC} (http://localhost:${PROMETHEUS_PORT})"
        
        # Count k6 metrics
        k6_metrics=$(curl -s "http://localhost:${PROMETHEUS_PORT}/api/v1/label/__name__/values" 2>/dev/null | \
            grep -o '"k6_[^"]*"' | wc -l | tr -d ' ')
        echo "             ${k6_metrics} k6 metrics available"
    else
        echo -e "  Prometheus: ${RED}NOT RUNNING${NC}"
    fi
    
    # Check Grafana
    if curl -s "http://localhost:${GRAFANA_PORT}/api/health" >/dev/null 2>&1; then
        echo -e "  Grafana:    ${GREEN}RUNNING${NC} (http://localhost:${GRAFANA_PORT})"
    else
        echo -e "  Grafana:    ${RED}NOT RUNNING${NC}"
    fi
    
    echo ""
    echo "=========================================="
    echo ""
    echo "  To start: $0 start"
    echo "  To stop:  $0 stop"
    echo ""
}

case "${1:-}" in
    start)
        start_monitoring
        ;;
    stop)
        stop_monitoring
        ;;
    status)
        check_status
        ;;
    urls)
        show_urls
        ;;
    *)
        echo "Usage: $0 {start|stop|status|urls}"
        echo ""
        echo "Commands:"
        echo "  start   - Start Prometheus and Grafana port-forwards"
        echo "  stop    - Stop port-forwards"
        echo "  status  - Check if monitoring is accessible"
        echo "  urls    - Show access URLs and credentials"
        exit 1
        ;;
esac
