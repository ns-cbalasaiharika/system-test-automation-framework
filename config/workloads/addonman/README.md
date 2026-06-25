# Addonman Scenario Configs

YAML configuration files for Addonman scenarios.

## What to Add Here

Each scenario in `scenarios/addonman/` needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/addonman/am01-golden-baseline.ts` → `config/workloads/addonman/am01-golden-baseline.yaml`

## Required Fields

```yaml
id: AM-01
name: Addonman Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for Addonman API Gateway

service: addonman

trafficMix:
  getBranding: 30
  getClientConfig: 30
  updateClientStatus: 20
  getManagedChecks: 20

slos:
  latency_get_branding:
    p50: 100
    p95: 500
    p99: 1000
  errors:
    rate: 0.001

passCriteria:
  - All per-endpoint p99 latencies within SLO
  - Error rate < 0.1%
```

## Reference

- See `config/workloads/client-oppy/bl01-golden-baseline.yaml` for a working example
