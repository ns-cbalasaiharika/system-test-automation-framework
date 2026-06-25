# System Test Automation Framework

A config-driven k6 performance testing framework for client-oppy and related services.

## Quick Start

### Prerequisites

```bash
# macOS
brew install k6 node minikube kubectl helm helmfile

# Verify
k6 version && node --version && minikube version
```

### Run a Smoke Test (Local)

```bash
# 1. Install dependencies
npm install

# 2. Run smoke test (bundling happens automatically)
./scripts/run.sh --scenario bl01 --profile smoke --env local
```

> **Note**: The `run.sh` script automatically bundles scenarios if `dist/` is missing. To manually rebuild: `npm run bundle`

### Run in Minikube

**Prerequisites**: Docker login to `artifactory-rd.netskope.io` for client-oppy images.

```bash
# One-command setup and test
./scripts/minikube-quickstart.sh

# Or step by step:
./scripts/minikube-quickstart.sh --deploy-only   # Deploy stack
./scripts/minikube-quickstart.sh --run-only      # Run test
./scripts/minikube-quickstart.sh --teardown      # Cleanup
```

## Project Structure

```
├── scenarios/           # k6 test scenarios (TypeScript)
│   └── client-oppy/
│       └── baseline/    # BL-01 to BL-10 baseline scenarios
├── config/
│   ├── environments/    # Target environment configs (local, minikube, staging)
│   ├── profiles/        # Load profiles (smoke, load, stress, soak)
│   └── workloads/       # Scenario-specific configs (SLOs, traffic mix)
├── lib/                 # Core framework libraries
├── operations/          # Service-specific HTTP operations
├── helpers/             # Setup/teardown utilities
├── scripts/             # Runner scripts
├── k8s/                 # Kubernetes manifests for distributed testing
│   └── minikube/        # Minikube-specific deployment
└── dist/                # Webpack-bundled scenarios (generated)
```

## Running Tests

### Using the Run Script (Recommended)

```bash
# Basic usage
./scripts/run.sh --scenario <id> --profile <name> --env <name>

# Examples
./scripts/run.sh --scenario bl01 --profile smoke --env local
./scripts/run.sh --scenario bl02 --profile load --env minikube
./scripts/run.sh --all --profile smoke --env local     # Run all scenarios

# Options
#   --scenario, -s <id>    Scenario prefix (e.g., bl01, am-bl01)
#   --profile, -p <name>   Load profile: smoke|load|stress|soak|spike
#   --env, -e <name>       Environment: local|minikube|staging|rancher
#   --all, -a              Run all discovered scenarios
#   --category, -c <cat>   Filter by category: baseline|single-fault
```

### Using Make

```bash
make run-smoke SCENARIO=bl01              # Quick validation
make run SCENARIO=bl01 PROFILE=load       # Full load test
make run-all PROFILE=smoke                # Run all scenarios
make bundle                               # Rebuild bundles
make list                                 # List available scenarios
```

### Direct k6 Command

```bash
k6 run -e "ENV=local" -e "PROFILE=smoke" dist/scenarios/client-oppy/baseline/bl01-golden-baseline.bundle.js
```

## Load Profiles

| Profile | Duration | VUs | Use Case |
|---------|----------|-----|----------|
| `smoke` | 35s | 1 | Quick validation, CI |
| `load` | 5m | 10→50→10 | Standard load test |
| `stress` | 10m | 10→100→10 | Find breaking point |
| `soak` | 30m | 20 | Memory leak detection |
| `spike` | 5m | 1→100→1 | Sudden traffic burst |

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

## Minikube Deployment

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     client-oppy namespace                    │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │  configuration  │  │   orchestrator  │  │   steering  │  │
│  │     :6010       │  │      :6020      │  │    :6020    │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │         │
│           └─────────┬──────────┴───────────┬──────┘         │
│                     ▼                      ▼                 │
│           ┌─────────────────┐   ┌─────────────────┐         │
│           │     MariaDB     │   │      Redis      │         │
│           │      :3306      │   │      :6379      │         │
│           └─────────────────┘   └─────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### Deploy with Helmfile

```bash
# 1. Login to Netskope registry
docker login artifactory-rd.netskope.io

# 2. Deploy
cd k8s/minikube
helmfile sync -l tier=infra    # Infrastructure first
helmfile sync -l tier=app      # Then client-oppy services

# Or use the quickstart script
./scripts/minikube-quickstart.sh --deploy-only
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `local` | Target environment (local, minikube, staging) |
| `PROFILE` | `load` | Load profile (smoke, load, stress, soak) |
| `BASE_URL` | from config | Override service URL |
| `TENANT_ID` | from config | Override tenant ID |

### Threshold Configuration

SLOs are defined per-scenario in `config/workloads/<service>/<scenario>.yaml`:

```yaml
slos:
  latency_get_configs:
    p50: 100    # milliseconds
    p95: 500
    p99: 1000
  errors:
    rate: 0.001  # 0.1% max error rate
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

# 3. Update the scenario ID and config references

# 4. Bundle
npm run bundle

# 5. Test
./scripts/run.sh --scenario bl11 --profile smoke --env local
```

### Add a New Service

1. Create operations in `operations/<service-name>/`
2. Create workload configs in `config/workloads/<service-name>/`
3. Add service URL to environment configs
4. Create scenarios in `scenarios/<service-name>/`

## Troubleshooting

### Bundle Not Found

```bash
npm run bundle   # Rebuild bundles
make list        # Verify scenario is discovered
```

### Config Loading Errors

```bash
make lint        # Validate YAML configs
```

### Minikube Issues

```bash
kubectl get pods -n client-oppy              # Check pod status
kubectl logs -f <pod-name> -n client-oppy    # View logs
kubectl describe pod <pod-name> -n client-oppy  # Debug
./scripts/minikube-quickstart.sh --teardown  # Reset cluster
```

## License

Internal use only - Netskope Inc.
