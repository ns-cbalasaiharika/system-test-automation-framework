# Minikube Setup for Client-Oppy System Tests

This setup runs **client-oppy services in minikube** while using **docker-compose for infrastructure** (MariaDB, Redis, Kafka).

**Infrastructure source:** https://github.com/netSkope/client-oppy/tree/develop/docker/dev

## Quick Start (Automated)

```bash
# Set path to client-oppy repo
export CLIENT_OPPY_PATH=/path/to/client-oppy

# Run full setup + test (one command!)
./scripts/minikube-setup.sh

# Or run steps separately:
./scripts/minikube-setup.sh --setup-only   # Setup infrastructure + minikube + deploy
./scripts/minikube-setup.sh --test-only    # Run k6 test
./scripts/minikube-setup.sh --cleanup      # Cleanup everything
```

## Manual Setup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Desktop                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  docker-compose (client-oppy/docker/dev)            │   │
│  │  • MariaDB      (localhost:3307)                    │   │
│  │  • Redis        (localhost:6379)                    │   │
│  │  • Kafka        (localhost:9092)                    │   │
│  │  • Zookeeper                                        │   │
│  │  • Provisioner mock (localhost:6099)                │   │
│  │  • Addonman mock    (localhost:6098)                │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↑                                   │
│            host.minikube.internal                           │
│                         ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Minikube                                           │   │
│  │  • client-oppy-configuration (:6010)                │   │
│  │  • client-oppy-orchestrator  (:6020)                │   │
│  │  • client-oppy-steering      (:6030)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker Desktop
- minikube (`brew install minikube`)
- helm (`brew install helm`)
- helmfile (`brew install helmfile`)
- k6 (`brew install k6`)
- Network access to `artifactory-rd.netskope.io` (anonymous read)

## Manual Step-by-Step Setup

### 1. Start Infrastructure (Docker Compose)

Clone and start infrastructure from: https://github.com/netSkope/client-oppy/tree/develop/docker/dev

```bash
# Clone client-oppy repo (if not already)
git clone https://github.com/netSkope/client-oppy.git

# Start infrastructure
cd client-oppy/docker/dev
docker-compose up -d

# Verify all containers are healthy
docker ps --format "table {{.Names}}\t{{.Status}}" | grep client-oppy
```

### 2. Start Minikube

```bash
# Start with CNI bridge (required for networking)
minikube start --driver=docker --cni=bridge --cpus=4 --memory=8192
```

### 3. Pull and Load Images

```bash
# Pull images (anonymous access)
docker pull --platform linux/amd64 artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-configuration:latest
docker pull --platform linux/amd64 artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-orchestrator:latest
docker pull --platform linux/amd64 artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-steering:latest

# Load into minikube
minikube image load artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-configuration:latest
minikube image load artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-orchestrator:latest
minikube image load artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-steering:latest
```

### 4. Deploy Services

```bash
cd system-test-automation-framework/k8s/minikube

# Set path to client-oppy repo (required for helm charts)
export CLIENT_OPPY_PATH=/path/to/client-oppy

helmfile sync
```

### 5. Verify Deployment

```bash
kubectl get pods -n client-oppy
# All pods should be 1/1 Running
```

## Running K6 Tests

### Option 1: Local K6 (Simple)

Run k6 on your machine with port-forwarding:

```bash
cd system-test-automation-framework

# Port-forward the service
kubectl port-forward -n client-oppy svc/client-oppy-configuration 6010:80 &

# Run test
npm run bundle
k6 run dist/scenarios/client-oppy/baseline/bl01-golden-baseline.bundle.js \
  --env ENV=minikube-local --env SCENARIO_ID=bl01-golden-baseline
```

### Option 2: Distributed K6 (In-Cluster)

Run multiple k6 pods in parallel inside the cluster:

```bash
# 1. Deploy k6-operator (if not already)
export CLIENT_OPPY_PATH=/path/to/client-oppy
cd system-test-automation-framework/k8s/minikube
helmfile sync -l tier=k6

# 2. Create test script ConfigMap
kubectl create configmap k6-test-script -n client-oppy --from-literal=test.js='
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 3,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = "http://client-oppy-configuration.client-oppy.svc.cluster.local:80";

export default function () {
  let res = http.get(`${BASE_URL}/api/v1/ready`);
  check(res, {
    "status is 200": (r) => r.status === 200,
  });
  sleep(0.5);
}
'

# 3. Create TestRun with parallelism
kubectl apply -n client-oppy -f - <<EOF
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: distributed-test
spec:
  parallelism: 3  # Run 3 k6 pods in parallel
  script:
    configMap:
      name: k6-test-script
      file: test.js
EOF

# 4. Watch the test run
kubectl get pods -n client-oppy -w

# 5. Get results
kubectl logs -n client-oppy -l k6_cr=distributed-test

# 6. Cleanup
kubectl delete testrun distributed-test -n client-oppy
kubectl delete configmap k6-test-script -n client-oppy
```

**Note:** For distributed testing, use cluster-internal URLs (port 80):
- `http://client-oppy-configuration.client-oppy.svc.cluster.local:80`
- NOT localhost with port-forward

## Files

| File | Purpose |
|------|---------|
| `helmfile.yaml` | Orchestrates service deployments |
| `client-oppy-configuration-values.yaml` | Configuration service helm values |
| `client-oppy-orchestrator-values.yaml` | Orchestrator service helm values |
| `client-oppy-steering-values.yaml` | Steering service helm values |
| `k6-operator-values.yaml` | (Optional) K6 operator for in-cluster tests |

## Cleanup

```bash
# Remove services from minikube
export CLIENT_OPPY_PATH=/path/to/client-oppy
helmfile destroy

# Stop minikube
minikube stop

# Stop infrastructure
cd $CLIENT_OPPY_PATH/docker/dev
docker-compose down
```

## Troubleshooting

### Pod not starting
```bash
kubectl describe pod -n client-oppy <pod-name>
kubectl logs -n client-oppy <pod-name>
```

### Can't connect to Docker infra
```bash
# Verify host.minikube.internal resolves
minikube ssh "nc -zv host.minikube.internal 9092"
```

### Image pull issues
```bash
# Images must be pre-loaded (pullPolicy: Never)
minikube image ls | grep client-oppy
```
