# Kubernetes Deployments

This folder contains Kubernetes manifests and Helm configurations for deploying the system test framework.

## Folder Structure

```
k8s/
├── README.md                 # This file
├── helmfile.yaml             # Rancher/production deployment (k6-operator + InfluxDB + Grafana)
├── minikube/                 # Local minikube setup 
│   ├── README.md
│   ├── helmfile.yaml
│   ├── client-oppy-*-values.yaml
│   └── k6-operator-values.yaml
├── supporting/               # RBAC and utility manifests for Rancher
├── testrun/                  # TestRun templates for distributed k6 tests 
│   ├── base-testrun.yaml
│   ├── bl01-testrun.yaml
│   ├── bl01-testrun-minikube.yaml
│   └── kustomization.yaml
└── toxiproxy/                # Fault injection proxy for resilience testing 
    ├── deployment.yaml
    ├── configmap.yaml
    ├── deployment-minikube.yaml
    ├── configmap-minikube.yaml
    └── README.md
```

## When to Use Each

### 1. `minikube/` - Local Development

**Use when:** Running system tests locally on your laptop.

```bash
# Automated setup
export CLIENT_OPPY_PATH=/path/to/client-oppy (Clone https://github.com/netSkope/client-oppy)
./scripts/minikube-setup.sh

# Or manual steps - see minikube/README.md
```

**What it deploys:**
- Client-oppy services (configuration, orchestrator, steering)
- Infrastructure via Docker Compose (MariaDB, Redis, Kafka)
- k6-operator for distributed testing

---

### 2. `helmfile.yaml` (root) - Rancher/Production Cluster

**Use when:** Running system tests on Rancher performance cluster with full metrics collection.

```bash
cd k8s/
helmfile sync
```

**What it deploys:**
- k6-operator: Manages distributed k6 tests
- InfluxDB v2: Stores k6 metrics
- Grafana: Dashboards for visualization

**Note:** Client-oppy services should already be deployed in the Rancher cluster.

---

### 3. `supporting/` - RBAC & Utilities

**Use when:** Rancher cluster has RBAC restrictions and k6 pods need explicit permissions.

| File | Purpose |
|------|---------|
| `rbac.yaml` | ServiceAccount, Role, RoleBinding for k6 runner pods |
| `stress-pod.yaml` | CPU/memory stress testing pod |

```bash
# Apply RBAC if k6 pods fail with permission errors
kubectl apply -f k8s/supporting/rbac.yaml
```

---

### 4. `testrun/` - Distributed Test Templates

**Use when:** Running k6 tests via k6-operator (instead of local k6 CLI).

| File | Purpose |
|------|---------|
| `base-testrun.yaml` | Base TestRun template with common settings (Rancher) |
| `bl01-testrun.yaml` | BL-01 Golden Baseline specific TestRun (Rancher) |
| `bl01-testrun-minikube.yaml` | BL-01 TestRun adapted for Minikube |
| `kustomization.yaml` | Kustomize overlay for customization |

```bash
# Ensure k6-perf-testing namespace exists
kubectl create namespace k6-perf-testing

# Create ConfigMap with test script
kubectl create configmap k6-scenario-bl01 \
  --from-file=bl01-golden-baseline.js=dist/scenarios/client-oppy/baseline/bl01-golden-baseline.bundle.js \
  -n k6-perf-testing

# Apply TestRun (use -minikube variant for local testing)
kubectl apply -f k8s/testrun/bl01-testrun-minikube.yaml

# Watch execution
kubectl get pods -n k6-perf-testing -w
kubectl get testrun -n k6-perf-testing
```

---

### 5. `toxiproxy/` - Fault Injection

**Use when:** Running resilience/chaos testing scenarios (S4, S5, S13, S14).

| File | Purpose |
|------|---------|
| `deployment.yaml` | Toxiproxy pod (Rancher cluster) |
| `configmap.yaml` | Proxy configs pointing to Rancher services |
| `deployment-minikube.yaml` | Toxiproxy pod (Minikube) |
| `configmap-minikube.yaml` | Proxy configs for Docker Compose + Minikube services |
| `README.md` | Usage instructions |

**Supported fault scenarios:**
- S4: Database connection failure
- S5: Database failover/recovery
- S13: Kafka network partition
- S14: Certificate expiry handling

```bash
# Deploy Toxiproxy (Minikube)
kubectl apply -f k8s/toxiproxy/configmap-minikube.yaml -n client-oppy
kubectl apply -f k8s/toxiproxy/deployment-minikube.yaml -n client-oppy

# Port-forward API
kubectl port-forward -n client-oppy svc/toxiproxy 8474:8474

# Inject 500ms latency on configuration service
curl -X POST http://localhost:8474/proxies/configuration-service/toxics \
  -H "Content-Type: application/json" \
  -d '{"name":"latency_test","type":"latency","attributes":{"latency":500}}'

# Remove toxic
curl -X DELETE http://localhost:8474/proxies/configuration-service/toxics/latency_test

# Deploy Toxiproxy (Rancher)
kubectl apply -f k8s/toxiproxy/
```

---

## Quick Reference

| Scenario | Use This |
|----------|----------|
| Local laptop testing | `minikube/` + `scripts/minikube-setup.sh` |
| Rancher cluster with metrics | `helmfile.yaml` (root) |
| Distributed k6 tests | `testrun/` templates |
| Fault injection tests | `toxiproxy/` |
| RBAC-restricted cluster | `supporting/rbac.yaml` |

