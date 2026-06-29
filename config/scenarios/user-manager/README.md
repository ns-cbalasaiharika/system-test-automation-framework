# User Manager Scenario Configs

YAML configuration files for User Manager scenarios.

**Note:** User Manager is a FATAL dependency for client-oppy write path.

## What to Add Here

Each scenario in `scenarios/user-manager/` needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/user-manager/um01-golden-baseline.ts` → `config/scenarios/user-manager/um01-golden-baseline.yaml`

## Required Fields

```yaml
id: UM-01
name: User Manager Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for User Manager (critical dependency)

service: user-manager

trafficMix:
  listUsers: 30
  getUser: 25
  getGroups: 20
  getUserAttributesOU: 15
  triggerADSync: 10

slos:
  latency_get_user:
    p50: 50
    p95: 200
    p99: 500
  latency_get_groups:
    p50: 100
    p95: 500
    p99: 1000
  errors:
    rate: 0.001

passCriteria:
  - User/Group lookups < 500ms p99 (critical for client-oppy)
  - AD sync triggers successfully
```

## Reference

- See `config/scenarios/client-oppy/bl01-golden-baseline.yaml` for a working example
