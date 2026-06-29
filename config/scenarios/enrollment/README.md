# Enrollment Scenario Configs

YAML configuration files for Enrollment and Certificate scenarios.

## What to Add Here

Each scenario in `scenarios/enrollment/` needs a corresponding YAML config here.

## File Naming

Match the scenario file name:
- `scenarios/enrollment/en01-golden-baseline.ts` → `config/scenarios/enrollment/en01-golden-baseline.yaml`

## Required Fields

```yaml
id: EN-01
name: Enrollment Golden Baseline
category: baseline
priority: P0
description: Establish performance baselines for Enrollment and Certificate services

service: enrollment-service

trafficMix:
  getEnrollmentStatus: 30
  getCertificate: 25
  enroll: 20
  requestCertificate: 15
  renewCertificate: 10

slos:
  latency_enroll:
    p50: 200
    p95: 1000
    p99: 2000
  latency_request_certificate:
    p50: 500
    p95: 2000
    p99: 5000
  errors:
    rate: 0.001

passCriteria:
  - Enrollment requests < 2s p99
  - Certificate operations < 5s p99 (crypto overhead)
```

## Reference

- See `config/scenarios/client-oppy/bl01-golden-baseline.yaml` for a working example
