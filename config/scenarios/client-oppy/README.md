# Client-Oppy Scenario Configs

YAML configuration files for Client-Oppy Configuration Service scenarios.

## What to Add Here

Each scenario in `scenarios/baseline/` (and other client-oppy scenario folders) needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/baseline/bl01-golden-baseline.ts` → `config/scenarios/client-oppy/bl01-golden-baseline.yaml`

## Current Scenarios

| ID | Name | Category | Priority |
|----|------|----------|----------|
| BL-01 | Golden Baseline | Baseline | P0 |
| BL-02 | Write-Heavy Profile | Baseline | P0 |
| BL-03 | Capacity Ceiling | Baseline | P0 |
| BL-04 | Step Degradation | Baseline | P1 |
| BL-05 | Multi-Tenant | Baseline | P1 |
| BL-06 | Burst After Idle | Baseline | P1 |
| BL-07 | Bulk Delete Contention | Baseline | P1 |
| BL-08 | DB Pool Saturation | Baseline | P1 |
| BL-09 | Leak Detection | Baseline | P1 |
| BL-10 | Kafka Throughput | Baseline | P1 |

## Required Fields

```yaml
id: BL-01
name: Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for client-oppy configuration service

service: client-oppy-configuration

trafficMix:
  create: 10
  read: 50
  update: 20
  delete: 5
  list: 10
  versions: 5

slos:
  latency_create:
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

- Operations: `operations/client-oppy/`
- Scenarios: `scenarios/baseline/`, `scenarios/single-fault/`, etc.
