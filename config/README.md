# Configuration Directory

This directory contains all configuration files that drive the test framework. The framework is **config-driven** — you can change test behavior without modifying code.

**All config files use YAML format** which supports `#` comments for inline documentation.

## Directory Structure

```
config/
├── environments/          # WHERE to run (Kubernetes cluster service URLs)
│   ├── minikube-cluster.yaml # k6-operator in Minikube (local development)
│   ├── rancher.yaml          # k6-operator in Rancher (production-like)
│   └── staging.yaml          # k6-operator in Staging
│
├── profiles/              # HOW MUCH load (VUs, duration, ramp pattern)
│   ├── smoke.yaml             # Quick validation (~35s, 1 VU)
│   ├── load.yaml              # Standard load (~63min, 50 VUs)
│   ├── stress.yaml            # Find breaking point (~23min, up to 150 VUs)
│   ├── soak.yaml              # Leak detection (~4hrs, 50 VUs)
│   └── spike.yaml             # Burst handling (~12min, 0→100 VUs)
│
├── scenarios/             # WHAT to test (traffic mix, SLOs, pass criteria)
│   └── client-oppy/           # Client-oppy scenarios (bl01–bl10)
│
└── cluster-load/          # BACKGROUND CLUSTER LOADING
    ├── cluster-services.yaml  # All services, their APIs, ports, traffic weights
    └── load-profiles.yaml     # Cluster-wide load levels (idle → stress)
```

## Testing Approach

All tests run **inside Kubernetes** using **k6-operator**:

```bash
# Run test in Minikube
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster

# Run test with background load in Rancher
./scripts/k6-operator-test.sh --scenario bl01 --env rancher --with-load p95
```

This approach ensures:
- Reliable testing (no port-forward issues)
- Direct pod-to-pod communication
- Consistent behavior across environments

## Configuration Hierarchy

Configs are merged with the following precedence (lowest → highest):

```
1. Scenario Config    (config/scenarios/<service>/<id>.yaml)
        ↓
2. Profile Config     (config/profiles/<profile>.yaml)
        ↓
3. Environment Config (config/environments/<env>.yaml)
        ↓
4. Environment Vars   (ENV, PROFILE)
```

## Config Types

### Environments (`config/environments/*.yaml`)

Defines where tests run — Kubernetes service DNS names, default headers, tenant IDs.

| Environment | Use Case |
|-------------|----------|
| `minikube-cluster` | Local Minikube development |
| `rancher` | Production-like Rancher cluster |
| `staging` | Staging environment |

| Field | Purpose |
|-------|---------|
| `name` | Environment identifier |
| `services` | Map of service name → Kubernetes service URL |
| `defaults.tenantId` | Default tenant ID header |
| `defaults.headers` | Default HTTP headers |
| `defaults.thinkTime` | Delay between requests (`minMs`, `maxMs`) |

### Profiles (`config/profiles/*.yaml`)

Defines how much load to apply — VUs, stages, duration.

| Profile | Duration | VUs | Use Case |
|---------|----------|-----|----------|
| `smoke` | 35s | 1 | Quick validation, CI |
| `load` | 5m | 10→50→10 | Standard load test |
| `stress` | 10m | 10→100→10 | Find breaking point |
| `soak` | 30m | 20 | Memory leak detection |
| `spike` | 5m | 1→100→1 | Sudden traffic burst |

| Field | Purpose |
|-------|---------|
| `name` | Profile identifier |
| `executor` | k6 executor type (`ramping-vus`, `constant-arrival-rate`, etc.) |
| `stages` | VU ramp stages `[{duration, target}, ...]` |
| `thresholdMultiplier` | Relaxes SLOs (`1.0` = strict, `5.0` = very lenient) |

### scenarios (`config/scenarios/<service>/*.yaml`)

Defines what to test — operations, SLOs, faults, setup/teardown.

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | Yes | Unique scenario identifier (e.g., `BL-01`) |
| `name` | Yes | Human-readable name |
| `category` | Yes | `baseline`, `single-fault`, `compound-fault`, `data-integrity`, `deployment`, `e2e` |
| `priority` | Yes | `P0` (critical) – `P3` (nice-to-have) |
| `service` | Yes | Target service (must exist in environment config) |
| `trafficMix` | Yes | Operation weights (must sum to 100) |
| `slos` | Yes | Latency/error thresholds per metric |
| `passCriteria` | No | Human-readable pass/fail conditions |
| `setup` | No | Setup config (health check, seeding) |
| `teardown` | No | Teardown config (cleanup paths) |

### Cluster Load (`config/cluster-load/`)

Defines background traffic to simulate production conditions.

**`cluster-services.yaml`** — Declares all backend services with:
- Port, health endpoint
- API operations (method, path, weight)

**`load-profiles.yaml`** — Cluster-wide load levels:

| Profile | Base RPS | Duration | Use Case |
|---------|----------|----------|----------|
| `idle` | 1 | indefinite | Baseline measurements |
| `light` | 10 | indefinite | Development testing |
| `minikube` | 5 | 2 min | Light Minikube testing |
| `stress` | 200 | indefinite | Beyond capacity |
| `soak` | 100 | 4 hours | Memory leak detection |

Usage with k6-operator:
```bash
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster --with-load light
```

## Scenario YAML Example

```yaml
id: BL-01
name: Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines

service: client-oppy-configuration

trafficMix:
  listConfigs: 40
  getConfigById: 30
  createConfig: 15
  updateConfig: 10
  deleteConfig: 5

slos:
  latency_get_configs:
    p50: 100
    p95: 500
    p99: 1000
  errors:
    rate: 0.001

setup:
  wait_for_ready: true
  health_endpoint: /api/v1/ready
  seed_count: 10
  seed_path: /client/config

teardown:
  cleanup_data: true
  list_path: /client/config
  delete_path: /client/config/{id}

passCriteria:
  - All per-endpoint p99 latencies within SLO
  - Error rate < 0.1%
  - No service restarts during test
```

## Adding New Configurations

### Adding a New Environment

1. Copy an existing environment YAML (e.g., `minikube-cluster.yaml`)
2. Update `services` with Kubernetes service DNS URLs
3. Set appropriate `tenantId` and `headers`

### Adding a New Profile

1. Copy an existing profile YAML (e.g., `load.yaml`)
2. Define `stages` for your load pattern
3. Set `thresholdMultiplier` based on expected behavior

### Adding a New Scenario

1. Create YAML in `config/scenarios/<service>/<id>.yaml`
2. Set `service` field (must exist in environment configs)
3. Define `trafficMix` (must sum to 100)
4. Set `slos` for each latency metric
5. Create matching TypeScript scenario in `scenarios/<service>/<category>/`

## Validation

```bash
# Validate all config files
npx ts-node scripts/validate-config.ts
```

This checks:
- Required fields are present
- YAML is valid and parseable
- Traffic mix sums to 100 (scenarios)
- SLO formats are correct
- Services referenced exist in at least one environment
