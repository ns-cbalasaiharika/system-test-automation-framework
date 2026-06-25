# Downloader Scenario Configs

YAML configuration files for Downloader scenarios.

## What to Add Here

Each scenario in `scenarios/downloader/` needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/downloader/dl01-golden-baseline.ts` → `config/workloads/downloader/dl01-golden-baseline.yaml`

## Required Fields

```yaml
id: DL-01
name: Downloader Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for Downloader service

service: downloader

trafficMix:
  listDownloads: 70
  triggerDownload: 30

slos:
  latency_list_downloads:
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
