# Provisioner Scenario Configs

YAML configuration files for Provisioner scenarios.

## What to Add Here

Each scenario in `scenarios/provisioner/` needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/provisioner/pv01-golden-baseline.ts` → `config/scenarios/provisioner/pv01-golden-baseline.yaml`

## Required Fields

```yaml
id: PV-01
name: Provisioner Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for Provisioner services

service: provisioner-core

trafficMix:
  getClientConfig: 25
  getBrandingByUPN: 20
  updateStatus: 20
  getTenant: 15
  getGoldenVersions: 10
  pushClientConfig: 10

slos:
  latency_get_client_config:
    p50: 100
    p95: 500
    p99: 1000
  latency_update_status:
    p50: 50
    p95: 200
    p99: 500
  errors:
    rate: 0.001

passCriteria:
  - Client status updates < 500ms p99
  - Config push notifications delivered
```

## Reference

- See `config/scenarios/client-oppy/bl01-golden-baseline.yaml` for a working example
