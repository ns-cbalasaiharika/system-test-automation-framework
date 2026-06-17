# Configuration Directory

This directory contains all configuration files that drive the test framework. The framework is **config-driven** — you can change test behavior without modifying code.

**All config files use YAML format** which supports `#` comments for inline documentation.

## Directory Structure

```
config/
├── environments/     # WHERE to run (service URLs, headers, tenant IDs)
│   ├── local.yaml        # Local development (localhost)
│   ├── minikube.yaml     # Local Kubernetes (minikube)
│   ├── rancher.yaml      # Dedicated perf cluster
│   ├── staging.yaml      # Pre-production
│   └── production.yaml   # Production (READ-ONLY!)
│
├── profiles/         # HOW MUCH load (VUs, duration, ramp pattern)
│   ├── smoke.yaml        # Quick validation (~35s, 1 VU)
│   ├── load.yaml         # Standard load (~63min, 50 VUs)
│   ├── stress.yaml       # Find breaking point (~23min, up to 150 VUs)
│   ├── soak.yaml         # Leak detection (~4hrs, 50 VUs)
│   └── spike.yaml        # Burst handling (~12min, 0→100 VUs)
│
└── scenarios/        # WHAT to test (traffic mix, SLOs, pass criteria)
    ├── bl01-golden-baseline.yaml
    ├── bl02-write-heavy.yaml
    └── ... (10 baseline scenarios)
```

## Configuration Hierarchy

Configs are merged with the following precedence (lowest → highest):

```
1. Scenario Config    (config/scenarios/<id>.json)
        ↓
2. Profile Config     (config/profiles/<profile>.json)
        ↓
3. Environment Config (config/environments/<env>.json)
        ↓
4. Environment Vars   (ENV, PROFILE, BASE_URL, TENANT_ID)
        ↓
5. CLI Flags          (--vus, --duration via K6_ARGS)
```

## Quick Reference

### Selecting Configuration

```bash
# Specify environment and profile
make run SCENARIO=bl01 ENV=minikube PROFILE=load

# Override with environment variables
BASE_URL=http://custom:6010 make run SCENARIO=bl01

# Override via CLI
make run SCENARIO=bl01 K6_ARGS="--vus 10 --duration 5m"
```

### Key Fields by Config Type

#### Environments (`config/environments/*.json`)
| Field | Purpose |
|-------|---------|
| `services` | Map of service name → base URL |
| `defaults.tenantId` | Default tenant ID header |
| `defaults.headers` | Default HTTP headers |
| `defaults.thinkTime` | Delay between requests |

#### Profiles (`config/profiles/*.json`)
| Field | Purpose |
|-------|---------|
| `executor` | k6 executor type (ramping-vus, constant-arrival-rate, etc.) |
| `stages` | VU ramp stages `[{duration, target}, ...]` |
| `thresholdMultiplier` | Relaxes SLOs (1.0=strict, 5.0=very lenient) |

#### Scenarios (`config/scenarios/*.json`)
| Field | Purpose |
|-------|---------|
| `service` | Target service (key from environments) |
| `trafficMix` | Operation weights (must sum to 100) |
| `slos` | Latency/error thresholds |
| `passCriteria` | Human-readable pass/fail conditions |

## Adding New Configurations

### Adding a New Environment

1. Copy `environments/_template.json` to `environments/<name>.json`
2. Update `services` with URLs for your environment
3. Set appropriate `tenantId` and `headers`
4. Adjust `thinkTime` based on environment characteristics

### Adding a New Profile

1. Copy `profiles/_template.json` to `profiles/<name>.json`
2. Define `stages` for your load pattern
3. Set `thresholdMultiplier` based on expected behavior

### Adding a New Scenario

1. Copy `scenarios/_template.json` to `scenarios/<id>-<name>.json`
2. Set unique `id` (e.g., BL-11, SF-15)
3. Define `trafficMix` (must sum to 100)
4. Set `slos` for each metric
5. Create matching script in `scenarios/<category>/`

## Validation

```bash
# Validate all config files
make lint
```

This checks:
- Required fields are present
- YAML is valid
- Traffic mix sums to 100 (scenarios)
- Stages are properly defined (profiles)

## YAML Comment Format

All config files use YAML which supports native `#` comments:

```yaml
# =============================================================================
# Section header comment
# =============================================================================

name: local

services:
  my-service: http://localhost:8080   # Inline comment explaining this field

defaults:
  tenantId: "12345"                   # Override via TENANT_ID env var
  thinkTime:
    minMs: 100                        # Minimum delay (milliseconds)
    maxMs: 300                        # Maximum delay (milliseconds)
```

Comments are ignored by the YAML parser and exist purely for documentation.
