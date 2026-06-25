# Toxiproxy for Fault Injection

Toxiproxy is used to inject faults (latency, connection drops, errors) into dependencies during system tests.

## Architecture

```
┌─────────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│  client-oppy-*      │────▶│   Toxiproxy     │────▶│  Actual Service     │
│  (configuration/    │     │  (proxy layer)  │     │  (MariaDB, Kafka,   │
│   steering/orch)    │     │                 │     │   UM, etc.)         │
└─────────────────────┘     └─────────────────┘     └─────────────────────┘
```

## Proxy Mappings

| Proxy Name      | Listen Port | Upstream Service                    |
|-----------------|-------------|-------------------------------------|
| mariadb-rw      | 13306       | MariaDB Primary (RW)                |
| mariadb-ro      | 13307       | MariaDB Readonly (RO)               |
| kafka           | 19092       | Kafka Broker                        |
| user-manager    | 18080       | User Manager API                    |
| provisioner     | 18081       | Provisioner PyCore Oppy             |
| addonman        | 18082       | Addonman Service                    |
| npa-qdispatcher | 18083       | NPA QDispatcher                     |
| ris             | 18084       | RIS (Enrollment)                    |

## Deployment

### Rancher/Production Cluster

```bash
# Deploy Toxiproxy
kubectl apply -f k8s/toxiproxy/configmap.yaml
kubectl apply -f k8s/toxiproxy/deployment.yaml

# Verify deployment
kubectl get pods -l app=toxiproxy
kubectl get svc toxiproxy
```

### Minikube (Local Development)

For Minikube, use the `-minikube` variants which are configured to connect to:
- Infrastructure (MariaDB, Kafka, Redis) via `host.minikube.internal` (Docker Compose)
- Client-oppy services via in-cluster DNS

```bash
# Deploy Toxiproxy to client-oppy namespace
kubectl apply -f k8s/toxiproxy/configmap-minikube.yaml -n client-oppy
kubectl apply -f k8s/toxiproxy/deployment-minikube.yaml -n client-oppy

# Verify deployment
kubectl get pods -n client-oppy -l app=toxiproxy
kubectl get svc -n client-oppy toxiproxy
```

**Minikube Proxies:**

| Proxy Name | Listen Port | Upstream |
|------------|-------------|----------|
| mariadb | 13306 | host.minikube.internal:3306 (Docker Compose) |
| kafka | 19092 | host.minikube.internal:9092 (Docker Compose) |
| redis | 16379 | host.minikube.internal:6379 (Docker Compose) |
| configuration-service | 16010 | client-oppy-configuration:80 |
| orchestrator-service | 16030 | client-oppy-orchestrator:80 |
| steering-service | 16020 | client-oppy-steering:80 |

## Initialize Proxies

After deployment, initialize the proxies:

```bash
# Port-forward to Toxiproxy API
kubectl port-forward svc/toxiproxy 8474:8474 &

# Create proxies from config
curl -X POST http://localhost:8474/populate \
  -H "Content-Type: application/json" \
  -d @k8s/toxiproxy/proxies.json
```

## Usage Examples

### Add Latency to MariaDB

```bash
# Add 500ms latency to all MariaDB RW queries
curl -X POST http://localhost:8474/proxies/mariadb-rw/toxics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "latency_downstream",
    "type": "latency",
    "attributes": {
      "latency": 500,
      "jitter": 50
    }
  }'
```

### Kill Connections to User Manager

```bash
# Drop 100% of connections to User Manager
curl -X POST http://localhost:8474/proxies/user-manager/toxics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reset_peer",
    "type": "reset_peer",
    "attributes": {
      "timeout": 0
    }
  }'
```

### Inject 50% HTTP 500 Errors (via bandwidth limit)

```bash
# Limit bandwidth to simulate slow/failing responses
curl -X POST http://localhost:8474/proxies/provisioner/toxics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "bandwidth_limit",
    "type": "bandwidth",
    "attributes": {
      "rate": 1
    }
  }'
```

### Remove All Toxics (Reset)

```bash
# List and remove all toxics from a proxy
curl http://localhost:8474/proxies/mariadb-rw/toxics | jq -r '.[].name' | \
  xargs -I {} curl -X DELETE http://localhost:8474/proxies/mariadb-rw/toxics/{}
```

## Toxic Types

| Type        | Description                              | Key Attributes        |
|-------------|------------------------------------------|-----------------------|
| latency     | Add delay to requests                    | latency, jitter       |
| bandwidth   | Limit bandwidth (bytes/sec)              | rate                  |
| slow_close  | Delay connection close                   | delay                 |
| timeout     | Stop all data and close after timeout    | timeout               |
| reset_peer  | Reset TCP connection                     | timeout               |
| slicer      | Slice data into smaller bits             | average_size, delay   |
| limit_data  | Close connection after N bytes           | bytes                 |

## Integration with Test Framework

The k6 test framework uses `lib/toxiproxy-client.ts` to programmatically inject faults:

```typescript
import { ToxiproxyClient } from '../lib/toxiproxy-client';

const toxiproxy = new ToxiproxyClient('http://toxiproxy:8474');

// During test setup
await toxiproxy.addLatency('mariadb-rw', 500);

// During test teardown
await toxiproxy.reset('mariadb-rw');
```

## Service Configuration Updates

To route services through Toxiproxy, update the service environment variables:

```yaml
# Example: client-oppy-configuration deployment
env:
  - name: DB_RW_HOST
    value: "toxiproxy.system-test.svc.cluster.local"
  - name: DB_RW_PORT
    value: "13306"
  - name: DB_RO_HOST
    value: "toxiproxy.system-test.svc.cluster.local"
  - name: DB_RO_PORT
    value: "13307"
```

Or use Kubernetes Services with ExternalName to transparently route traffic.
