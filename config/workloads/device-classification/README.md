# Device Classification Scenario Configs

YAML configuration files for Device Classification scenarios.

## What to Add Here

Each scenario in `scenarios/device-classification/` needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/device-classification/dc01-golden-baseline.ts` → `config/workloads/device-classification/dc01-golden-baseline.yaml`

## Required Fields

```yaml
id: DC-01
name: Device Classification Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for Device Classification services

service: device-classification-evaluator

trafficMix:
  classifyDevice: 40
  batchClassify: 20
  getConfig: 20
  getTags: 10
  updateConfig: 10

slos:
  latency_classify_device:
    p50: 50
    p95: 200
    p99: 500
  latency_batch_classify:
    p50: 200
    p95: 1000
    p99: 2000
  errors:
    rate: 0.001

passCriteria:
  - Single device classification < 500ms p99
  - Batch classification (10 devices) < 2s p99
```

## Reference

- See `config/workloads/client-oppy/bl01-golden-baseline.yaml` for a working example
