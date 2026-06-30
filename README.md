# System Test Automation Framework

A **service-agnostic, config-driven** k6 performance testing framework designed for running **system tests under realistic production load** in Kubernetes clusters.

## Key Features

- **Tests Under Load**: All scenarios run while the cluster is under background load, simulating real production conditions
- **Service Agnostic**: Framework can be extended for any service (currently implements client-oppy scenarios)
- **Scenario Agnostic**: Config-driven approach allows adding new scenarios without code changes
- **k6-operator**: Tests run inside Kubernetes using k6-operator for reliable, scalable execution
- **Cluster Load Generator**: Built-in background load generator to simulate busy production clusters

## Quick Start

### Prerequisites

```bash
# macOS
brew install k6 node minikube kubectl helm helmfile

# Docker login to artifactory
docker login artifactory-rd.netskope.io

# Clone client-oppy repo (required for Helm charts)
git clone <client-oppy-repo> /path/to/client-oppy
export CLIENT_OPPY_PATH=/path/to/client-oppy
```

### One-Command Setup

```bash
# Setup complete Minikube environment for client-oppy services
./scripts/setup-client-oppy-minikube.sh

# Run a test
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster
```

## Project Structure

```
├── scenarios/              # k6 test scenarios (TypeScript)
│   ├── client-oppy/
│   │   └── baseline/       # BL-01 to BL-10 baseline scenarios
│   └── background/         # Cluster load generator
├── config/
│   ├── environments/       # Target environments (minikube-cluster, rancher, staging)
│   ├── profiles/           # Load profiles (smoke, load, stress, soak)
│   ├── workloads/          # Scenario-specific configs (SLOs)
│   └── cluster-load/       # Background load configuration
├── lib/                    # Core framework libraries
├── operations/             # Service-specific HTTP operations
├── helpers/                # Setup/teardown utilities
├── scripts/
│   ├── setup-client-oppy-minikube.sh  # Full environment setup
│   ├── k6-operator-test.sh            # Test runner + load control (PRIMARY)
│   ├── fault-inject/                  # Toxiproxy fault injection
│   └── verify/                        # Data verification scripts
├── k8s/
│   ├── minikube/           # Minikube deployment (Helmfile + values)
│   ├── testrun/            # k6-operator TestRun manifests
│   └── toxiproxy/          # Toxiproxy for fault injection
├── docs/                   # Scenario documentation (CSV)
└── dist/                   # Webpack-bundled scenarios (generated)
```

## Environment Setup

### Minikube Setup Script

The `setup-client-oppy-minikube.sh` script sets up a complete testing environment:

```bash
# Full setup (infrastructure + services + k6-operator)
./scripts/setup-client-oppy-minikube.sh

# Check status
./scripts/setup-client-oppy-minikube.sh --status

# Infrastructure only (MySQL, Kafka, Redis via docker-compose)
./scripts/setup-client-oppy-minikube.sh --infra-only

# Deploy services only (assumes infrastructure is running)
./scripts/setup-client-oppy-minikube.sh --deploy-only

# Teardown everything
./scripts/setup-client-oppy-minikube.sh --teardown
```

### What the Setup Script Does

1. **Validate Resources** - Check Docker CPU/memory, disk space
2. **Start Infrastructure** - MySQL, Kafka, Redis via `docker-compose` from client-oppy repo
3. **Start Minikube** - Create cluster with 6 CPUs, 12GB memory
4. **Pull & Load Images** - From artifactory into Minikube
5. **Deploy Services** - Configuration, Orchestrator, Steering via Helm
6. **Install k6-operator** - For running tests inside the cluster
7. **Deploy Toxiproxy** - For fault injection scenarios
8. **Verify & Seed** - Health checks and test data seeding

### Manual Deployment with Helmfile

If you prefer manual control over deployment:

```bash
# Set client-oppy repo path
export CLIENT_OPPY_PATH=/path/to/client-oppy

# Start infrastructure (MySQL, Kafka, Redis)
cd $CLIENT_OPPY_PATH/docker/dev
docker-compose up -d

# Start Minikube
minikube start --cpus=6 --memory=12288 --driver=docker

# Create PriorityClass (required by client-oppy charts)
kubectl apply -f - <<EOF
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: eng-priority-2000
value: 2000
globalDefault: false
EOF

# Create namespace and image pull secret
kubectl create namespace client-oppy

# Pull and load images
docker pull artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-configuration:latest
docker pull artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-orchestrator:latest
docker pull artifactory-rd.netskope.io/nsclient-release-docker/client-oppy-steering:latest
minikube image load <each-image>

# Deploy services via Helmfile
cd /path/to/system-test-automation-framework/k8s/minikube
helmfile sync -l tier=app    # Deploy client-oppy services
helmfile sync -l tier=k6     # Install k6-operator

# Verify deployment
kubectl get pods -n client-oppy
kubectl get pods -n k6-operator-system
```

## Running Tests

All tests run inside the Kubernetes cluster using **k6-operator**. This ensures:
- Reliable testing (no port-forward issues)
- Direct pod-to-pod communication via Kubernetes DNS
- Consistent approach for Minikube and Rancher

### k6-operator Architecture

The k6-operator uses two Kubernetes namespaces:

| Namespace | Purpose |
|-----------|---------|
| `k6-operator-system` | Control plane — the operator controller that watches for TestRun resources |
| `k6-tests` | Execution area — where test pods are created and run |

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌─────────────────────────┐    ┌─────────────────────────┐ │
│  │  k6-operator-system     │    │  k6-tests               │ │
│  │                         │    │                         │ │
│  │  controller-manager ────┼────▶  scenario-bl01-pod      │ │
│  │  (watches TestRun CRDs) │    │  (runs your k6 script)  │ │
│  └─────────────────────────┘    └─────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────┐                                │
│  │  client-oppy            │◀── Test traffic goes here     │
│  │  (target services)      │                                │
│  └─────────────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

**Check operator status:**
```bash
kubectl get pods -n k6-operator-system    # Operator controller
kubectl get pods -n k6-tests              # Active test pods
kubectl get testrun -n k6-tests           # TestRun resources
```

### Basic Test

```bash
# Run BL01 on Minikube
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster

# Run BL01 on Rancher
./scripts/k6-operator-test.sh --scenario bl01 --env rancher

# Run with specific profile
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster --profile load
```

### Test with Background Load

```bash
# Run BL01 while cluster is under light load (10 RPS)
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster --with-load light

# Run with higher load (100 RPS) on Rancher
./scripts/k6-operator-test.sh --scenario bl01 --env rancher --with-load p95
```

The script automatically:
- Installs k6-operator if missing
- Creates ConfigMaps with test scripts and configs
- Starts background load (if requested)
- Runs the test scenario
- Shows detailed results with thresholds
- Cleans up resources

## Load Profiles

| Profile | Duration | VUs | Use Case |
|---------|----------|-----|----------|
| `smoke` | 35s | 1 | Quick validation, CI |
| `load` | 5m | 10→50→10 | Standard load test |
| `stress` | 10m | 10→100→10 | Find breaking point |
| `soak` | 30m | 20 | Memory leak detection |
| `spike` | 5m | 1→100→1 | Sudden traffic burst |

## Background Load Profiles

Load is **multi-dimensional** — not just RPS. Each profile defines:

| Dimension | Description |
|-----------|-------------|
| **RPS** | Requests per second across all services |
| **VUs** | Concurrent virtual users (affects connection pools) |
| **Traffic Mix** | Read vs write ratio (writes are more expensive) |
| **Payload Size** | Average request/response size in KB |
| **Resource Thresholds** | Expected CPU/memory/DB connections for PASS/FAIL |

### Profile Quick Reference

| Profile | Total RPS | VUs | CPU Warn | Memory Warn | DB Conn | Use Case |
|---------|-----------|-----|----------|-------------|---------|----------|
| `idle` | ~3 | 5 | 20% | 30% | 3 | Baseline measurements |
| `light` | ~35 | 20 | 40% | 50% | 8 | Development testing |
| `minikube` | ~30 | 15 | 60% | 70% | 5 | Local Minikube testing |
| `p50` | ~200 | 50 | 50% | 60% | 15 | Median production |
| `p95` | ~600 | 100 | 60% | 70% | 20 | Peak hours (recommended) |
| `p99` | ~1400 | 150 | 70% | 75% | 23 | Extreme peak |
| `stress` | ~3000 | 200 | 80% | 80% | 25 | Beyond capacity |
| `soak` | ~600 | 100 | 60% | 70% | 20 | 4-hour leak detection |

### Resource Thresholds (Pass/Fail Criteria)

Each load profile includes **monitoring thresholds** that define pass/fail criteria:

```yaml
# Example: p95 profile thresholds
resourceThresholds:
  cpu:
    warn: 60        # Alert if CPU > 60%
    fail: 70        # Test FAILS if CPU > 70%
  memory:
    warn: 70        # Alert if memory > 70% of GOMEMLIMIT
    fail: 80        # Test FAILS if memory > 80%
  dbConnections:
    expected: 20    # Expected active connections
    warn: 23        # Alert if > 23 active (pool is 25)
    fail: 25        # Test FAILS if pool saturates
  kafkaLag:
    warn: 200       # Alert if consumer lag > 200
    fail: 1000      # Test FAILS if lag > 1000
  goroutines:
    warnDelta: 10   # Alert if goroutines increase > 10%
    failDelta: 25   # Test FAILS if increase > 25%
```

See `config/cluster-load/load-profiles.yaml` for complete profile definitions.

## Cluster Load Generator

The framework includes a **cluster load generator** (`scenarios/background/cluster-load-generator.ts`) that simulates realistic production traffic on the cluster before running test scenarios.

### Why Test Under Load?

Testing in isolation can hide performance issues that only appear when the cluster is busy:
- **Resource contention**: CPU, memory, DB connections shared with other workloads
- **Noisy neighbor effects**: Other services impacting your service's performance
- **Realistic latencies**: Network and I/O latencies under actual load

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                                   │
│                                                                          │
│  ┌────────────────────┐     ┌────────────────────┐                      │
│  │  Cluster Load      │     │  Test Scenario     │                      │
│  │  Generator (k6)    │     │  (k6-operator)     │                      │
│  │  100 RPS background│     │  50 RPS scenario   │                      │
│  └─────────┬──────────┘     └─────────┬──────────┘                      │
│            │                          │                                  │
│            └──────────┬───────────────┘                                  │
│                       ▼                                                  │
│            ┌─────────────────────┐                                       │
│            │   Target Services   │  ◄── TOTAL: 150 RPS                  │
│            │   (configuration,   │                                       │
│            │    steering, etc)   │                                       │
│            └─────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### All-in-One (Recommended)

The `k6-operator-test.sh` script handles load control automatically:

```bash
# Load cluster + run scenario (Minikube)
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster --with-load p95

# Load cluster + run scenario (Rancher)
./scripts/k6-operator-test.sh --scenario bl01 --env rancher --with-load p95
```

This will:
1. Start background load at 100 RPS (p95 profile)
2. Run BL01 scenario adding 50 RPS
3. Total cluster load: **150 RPS**
4. Stop background load after scenario completes

### Manual Load Control

For running multiple scenarios under the same load, use manual control:

```bash
# Step 1: Start background load
./scripts/k6-operator-test.sh start-load light --env minikube-cluster

# Step 2: Check load status
./scripts/k6-operator-test.sh load-status

# Step 3: Run multiple scenarios while load is running
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster
./scripts/k6-operator-test.sh --scenario bl02 --env minikube-cluster
./scripts/k6-operator-test.sh --scenario bl03 --env minikube-cluster

# Step 4: Stop background load
./scripts/k6-operator-test.sh stop-load
```

| Command | Description |
|---------|-------------|
| `start-load <profile>` | Start background load with specified profile |
| `stop-load` | Stop the running background load |
| `load-status` | Check if background load is running |

### Load Profile Configuration

Load profiles are defined in `config/cluster-load/load-profiles.yaml` with multi-dimensional specifications:

```yaml
profiles:
  p95:
    description: 95th percentile production traffic (peak hours)
    
    # Throughput
    baseRPS: 100
    serviceMultipliers:
      client-oppy-configuration: 3    # 300 RPS
      client-oppy-steering: 2         # 200 RPS
      client-oppy-orchestrator: 1     # 100 RPS
    
    # Concurrency
    targetVUs: 100
    maxVUs: 300
    
    # Traffic characteristics
    trafficMix:
      read: 70
      write: 30
    avgPayloadKB: 5
    
    # Resource thresholds (PASS/FAIL criteria)
    resourceThresholds:
      cpu:
        warn: 60
        fail: 70
      memory:
        warn: 70
        fail: 80
      dbConnections:
        expected: 20
        warn: 23
        fail: 25
      kafkaLag:
        warn: 200
        fail: 1000
    
    # Timing
    duration: 0              # 0 = run until stopped
    rampUp: 3m
    rampDown: 2m
```

### Service Targets

Services targeted by the load generator are defined in `config/cluster-load/cluster-services.yaml`. Add new services to extend load coverage.

## Monitoring During Tests

When running system tests under load, monitor these key metrics:

### Pre-Test Checklist

Before starting any test scenario:

```bash
□ Capture baseline CPU per pod (should be <40%)
□ Capture baseline Memory per pod (should be <50% of GOMEMLIMIT)
□ Note current goroutine count per pod
□ Verify DB connection pool has headroom (active < 20 of 25)
□ Verify Kafka consumer lag is near 0
□ Verify all pods are Ready with no recent restarts
```

### During Test Monitoring

| Metric | Where to Find | Warn | Fail |
|--------|---------------|------|------|
| **CPU %** | `container_cpu_usage_seconds_total` | >60% | >70% |
| **Memory %** | `container_memory_working_set_bytes` / GOMEMLIMIT | >70% | >80% |
| **Goroutines** | `go_goroutines` | +10% from baseline | +25% from baseline |
| **DB Pool Active** | Service `/metrics` endpoint | >22 active | 25/25 saturated |
| **Kafka Lag** | Consumer group lag | >200 messages | >1000 messages |
| **Error Rate** | k6 summary output | >0.1% | >0.5% |
| **p95 Latency** | k6 summary output | >2x SLO | >3x SLO |

### Prometheus Queries

```promql
# CPU usage per pod
sum(rate(container_cpu_usage_seconds_total{namespace="client-oppy"}[5m])) by (pod)

# Memory as percentage of limit
container_memory_working_set_bytes{namespace="client-oppy"} / 
  container_spec_memory_limit_bytes{namespace="client-oppy"} * 100

# Goroutines (should be flat)
go_goroutines{namespace="client-oppy"}

# Kafka consumer lag
kafka_consumer_group_lag{topic=~"client_oppy.*"}
```

### Test Report Sections

When reporting test results, include:

1. **Load State**: What was the total RPS (background + scenario)?
2. **Resource Utilization**: Max CPU/Memory during test vs thresholds
3. **Latency SLOs**: Per-endpoint p50/p95/p99 vs targets
4. **Error Rate**: Overall and per-endpoint
5. **Resource Stability**: Goroutine/connection trends (flat = good)
6. **Data Integrity**: Any validation failures

## Available Scenarios

| ID | Name | Priority | Description |
|----|------|----------|-------------|
| BL-01 | Golden Baseline | P0 | 70:30 read:write mix, establishes benchmarks |
| BL-02 | Write Heavy | P1 | 30:70 read:write, tests write throughput |
| BL-03 | Capacity Ceiling | P1 | Ramps to find max sustainable load |
| BL-04 | Step Degradation | P1 | Tests graceful degradation |
| BL-05 | Multi-Tenant | P1 | Concurrent tenant isolation |
| BL-06 | Burst After Idle | P2 | Cold-start performance |
| BL-07 | Bulk Delete | P2 | Bulk operation contention |
| BL-08 | DB Pool Saturation | P2 | Connection pool limits |
| BL-09 | Leak Detection | P2 | 30-min soak for memory leaks |
| BL-10 | Kafka Throughput | P2 | Event publishing capacity |

For complete scenario documentation, see `docs/client-oppy-system-test-scenarios.csv`.

## Environment Configuration

| Environment | Use Case |
|-------------|----------|
| `minikube-cluster` | k6-operator in Minikube (local development) |
| `rancher` | k6-operator in Rancher (production-like) |
| `staging` | k6-operator in Staging |

All environments use **k6-operator** running inside the Kubernetes cluster with Kubernetes service DNS for communication.

## Fault Injection

For resilience testing scenarios (S4.x, S9, S10, S14), use Toxiproxy:

```bash
# Deploy Toxiproxy
kubectl apply -f k8s/toxiproxy/deployment-minikube.yaml -n client-oppy

# Use fault injection scripts
./scripts/fault-inject/toxiproxy-latency.sh --target db --latency 500ms
./scripts/fault-inject/db-failover.sh
./scripts/fault-inject/kafka-broker-kill.sh
```

## Development

### Add a New Scenario

```bash
# 1. Create workload config
cp config/workloads/client-oppy/bl01-golden-baseline.yaml \
   config/workloads/client-oppy/bl11-new-scenario.yaml

# 2. Create scenario file
cp scenarios/client-oppy/baseline/bl01-golden-baseline.ts \
   scenarios/client-oppy/baseline/bl11-new-scenario.ts

# 3. Update scenario ID and config references

# 4. Bundle and test
npm run bundle
./scripts/k6-operator-test.sh --scenario bl11 --env minikube-cluster
```

### Bundle Scripts

```bash
npm install          # Install dependencies
npm run bundle       # Bundle all scenarios
npm run bundle:watch # Watch mode for development
```

## Troubleshooting

### Setup Issues

```bash
# Check environment status
./scripts/setup-client-oppy-minikube.sh --status

# View setup logs
cat logs/setup-*.log

# Reset everything and start fresh
./scripts/setup-client-oppy-minikube.sh --teardown
./scripts/setup-client-oppy-minikube.sh
```

### Bundle Not Found

```bash
npm run bundle   # Rebuild bundles
ls dist/         # Verify bundles exist
```

### k6-operator Issues

```bash
# Check operator status
kubectl get pods -n k6-operator-system

# Check test runs
kubectl get testrun -n k6-tests

# View test logs
kubectl logs -n k6-tests -l k6_cr=scenario-bl01 --tail=100
```

### Pod Issues

```bash
kubectl get pods -n client-oppy              # Check pod status
kubectl describe pod <pod-name> -n client-oppy
kubectl logs -f <pod-name> -n client-oppy    # View logs
```

### Config Validation

```bash
npx ts-node scripts/validate-config.ts
```

