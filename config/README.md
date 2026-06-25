# Configuration Directory

This directory contains all configuration files that drive the test framework. The framework is **config-driven** — you can change test behavior without modifying code.

**All config files use YAML format** which supports `#` comments for inline documentation.

## Directory Structure

```
config/
├── environments/          # WHERE to run (service URLs, headers, tenant IDs)
│   ├── local.yaml             # Local development (localhost)
│   ├── minikube.yaml          # Local Kubernetes (minikube)
│   ├── rancher.yaml           # Dedicated performance cluster
│   ├── staging.yaml           # Pre-production
│   └── production.yaml        # Production (READ-ONLY!)
│
├── profiles/              # HOW MUCH load (VUs, duration, ramp pattern)
│   ├── smoke.yaml             # Quick validation (~35s, 1 VU)
│   ├── load.yaml              # Standard load (~63min, 50 VUs)
│   ├── stress.yaml            # Find breaking point (~23min, up to 150 VUs)
│   ├── soak.yaml              # Leak detection (~4hrs, 50 VUs)
│   └── spike.yaml             # Burst handling (~12min, 0→100 VUs)
│
├── workloads/             # WHAT to test (traffic mix, SLOs, pass criteria)
│   ├── client-oppy/           # Client-oppy scenarios (bl01–bl10)
│   ├── addonman/              # Addonman scenarios (placeholder)
│   ├── downloader/            # Downloader scenarios (placeholder)
│   ├── device-classification/ # Device classification scenarios (placeholder)
│   ├── provisioner/           # Provisioner scenarios (placeholder)
│   ├── user-manager/          # User manager scenarios (placeholder)
│   └── enrollment/            # Enrollment scenarios (placeholder)
│
└── cluster-load/          # BACKGROUND CLUSTER LOADING
    ├── cluster-services.yaml  # All services, their APIs, ports, traffic weights
    └── load-profiles.yaml     # Cluster-wide load levels (idle → stress)
```

## Configuration Hierarchy

Configs are merged with the following precedence (lowest → highest):

```
1. Scenario Config    (config/workloads/<service>/<id>.yaml)
        ↓
2. Profile Config     (config/profiles/<profile>.yaml)
        ↓
3. Environment Config (config/environments/<env>.yaml)
        ↓
4. Environment Vars   (ENV, PROFILE, BASE_URL, TENANT_ID)
        ↓
5. CLI Flags          (--vus, --duration via K6_ARGS)
```

## Config Types

### Environments (`config/environments/*.yaml`)

Defines where tests run — service URLs, default headers, tenant IDs.

| Field | Purpose |
|-------|---------|
| `name` | Environment identifier |
| `services` | Map of service name → base URL |
| `defaults.tenantId` | Default tenant ID header |
| `defaults.headers` | Default HTTP headers |
| `defaults.thinkTime` | Delay between requests (`minMs`, `maxMs`) |

### Profiles (`config/profiles/*.yaml`)

Defines how much load to apply — VUs, stages, duration.

| Field | Purpose |
|-------|---------|
| `name` | Profile identifier |
| `executor` | k6 executor type (`ramping-vus`, `constant-arrival-rate`, etc.) |
| `stages` | VU ramp stages `[{duration, target}, ...]` |
| `thresholdMultiplier` | Relaxes SLOs (`1.0` = strict, `5.0` = very lenient) |

### Scenarios (`config/workloads/<service>/*.yaml`)

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
| `faults` | No | Fault injection during test |
| `infrastructureSLOs` | No | Infrastructure metrics (CPU, memory, Kafka lag) |
| `auth` | No | Authentication strategy override |
| `isolation` | No | Test data isolation config |
| `e2eFlows` | No | Multi-service E2E flow definitions |

### Cluster Load (`config/cluster-load/`)

Defines background traffic to simulate production conditions.

**`cluster-services.yaml`** — Declares all backend services with:
- Port, health endpoint
- API operations (method, path, weight)

**`load-profiles.yaml`** — Cluster-wide load levels:

| Profile | Base RPS | Use Case |
|---------|----------|----------|
| `idle` | 1 | Baseline measurements |
| `light` | 10 | Development testing |
| `p50` | 50 | Median daily traffic |
| `p95` | 100 | Peak daily traffic |
| `p99` | 150 | Extreme peaks |
| `stress` | 200 | Beyond capacity |
| `soak` | 100 (4h) | Memory leak detection |

Each profile has per-service multipliers reflecting production traffic patterns.

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

# Optional: config-driven setup
setup:
  wait_for_ready: true
  health_endpoint: /api/v1/ready
  seed_count: 10
  seed_path: /client/config

# Optional: config-driven teardown
teardown:
  cleanup_data: true
  list_path: /client/config
  delete_path: /client/config/{id}

# Optional: fault injection
# faults:
#   - type: pod-restart
#     target: client-oppy-configuration
#     phase: during
#     trigger_at: "50%"

# Optional: infrastructure SLOs
# infrastructureSLOs:
#   cpu_usage:
#     max: 80
#     query: "container_cpu_usage{service='client-oppy'}"
#     unit: "%"

passCriteria:
  - All per-endpoint p99 latencies within SLO
  - Error rate < 0.1%
  - No service restarts during test
```

## Adding New Configurations

### Adding a New Service

1. Add service URLs to each environment config under `services`
2. Create `config/workloads/<service>/` folder
3. Add the service to `config/cluster-load/cluster-services.yaml`
4. Create scenario YAMLs or use the generator:

```bash
npm run generate -- --service my-service --category baseline --id ms-bl01 --name "My Service Baseline"
```

### Adding a New Environment

1. Copy an existing environment YAML (e.g., `local.yaml`)
2. Update `services` with URLs for your environment
3. Set appropriate `tenantId` and `headers`

### Adding a New Profile

1. Copy an existing profile YAML (e.g., `load.yaml`)
2. Define `stages` for your load pattern
3. Set `thresholdMultiplier` based on expected behavior

### Adding a New Scenario

1. Create YAML in `config/workloads/<service>/<id>.yaml`
2. Set `service` field (must exist in environment configs)
3. Define `trafficMix` (must sum to 100)
4. Set `slos` for each latency metric
5. Create matching TypeScript scenario in `scenarios/<service>/<category>/`

## Validation

```bash
# Validate all config files
npm run validate
```

This checks:
- Required fields are present
- YAML is valid and parseable
- Traffic mix sums to 100 (scenarios)
- SLO formats are correct
- Services referenced exist in at least one environment
- Profiles have valid stages and multipliers
