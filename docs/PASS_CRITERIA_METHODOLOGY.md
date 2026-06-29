# PASS Criteria Derivation Methodology

This document defines the standard methodology for deriving PASS/FAIL criteria for system test scenarios.

---

## Overview

PASS criteria should be:
- **Data-driven**: Based on production baselines and SLOs
- **Consistent**: Same methodology across all services
- **Auditable**: Traceable to source documents

---

## Step 1: Identify Metric Type

| Metric Type | Examples | Unit |
|-------------|----------|------|
| **Latency** | P50, P90, P95, P99 | milliseconds (ms) |
| **Error Rate** | 4xx, 5xx, timeout % | percentage (%) |
| **Resource** | CPU %, Memory % | percentage (%) |
| **Recovery** | Time to recover | seconds (s) |
| **Availability** | Pod restarts, success rate | count / percentage |
| **Throughput** | RPS, TPS | requests/second |

---

## Step 2: Collect Baseline Values

Baseline values must come from documented sources:

### Primary Sources (in priority order)

1. **Performance Test Reports**
   - Example: Release 137 Performance Test Result
   - Contains: P95 latency, RPS, CPU, Memory per API

2. **SLA/SLO Documents**
   - Example: Netskope Client - Backend Performance Test Requirements
   - Contains: Target thresholds (P95 ≤ 150ms, Error ≤ 0.5%)

3. **Production Dashboards**
   - Example: Grafana/Prism dashboards
   - Contains: Real-time and historical metrics

4. **Capacity Assessments**
   - Example: MEL2 Cluster Capacity Assessment
   - Contains: Burst ratios, peak traffic patterns

5. **Existing Test Plans**
   - Example: Addonman_SystemTest_Regression_TestPlan.xlsx
   - Contains: Success criteria, customer impact

### Baseline Documentation Template

```
Metric: [P95 Latency]
Baseline Value: [239ms]
Source: [Release 137 Performance Test Result]
Source Link: [https://confluence.netskope.com/...]
Conditions: [30 concurrent users, single API]
Date Collected: [YYYY-MM-DD]
```

---

## Step 3: Apply Degradation Factor

The degradation factor allows for acceptable performance degradation based on test type.

### Degradation Factor Table

| Test Type | Factor | Rationale |
|-----------|--------|-----------|
| **Baseline/Capacity** | 1.0x | Matches production steady-state |
| **Burst/Spike** | 2.0x | Temporary degradation acceptable during traffic spikes |
| **Chaos/Failure** | 3.0x | Significant degradation expected during dependency failures |
| **Soak/Endurance** | 1.0x | Performance must remain stable over extended duration |
| **Stress** | 2.5x | System pushed beyond normal operational limits |
| **Recovery** | 2.0x | Performance during recovery phase |

### Test Type Definitions

- **Baseline**: Normal production-like traffic, steady-state
- **Burst/Spike**: Sudden traffic increase (e.g., 3-5x diurnal spike)
- **Chaos**: Dependency failure injection (Redis down, backend slow)
- **Soak**: Extended duration test (60+ minutes)
- **Stress**: Beyond capacity limits (rate limiting, pool exhaustion)

---

## Step 4: Calculate PASS and FAIL Thresholds

### Formula

```
┌─────────────────────────────────────────────────────────────┐
│                    PASS CRITERIA FORMULA                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PASS_THRESHOLD = Baseline × Degradation_Factor             │
│                                                             │
│  FAIL_THRESHOLD = PASS_THRESHOLD × 2                        │
│                                                             │
│  Where:                                                     │
│    Baseline = Production metric from verified sources       │
│    Degradation_Factor = Factor based on test type           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Exception Metrics (Binary - No Formula)

These metrics have fixed thresholds regardless of test type:

| Metric | PASS | FAIL | Rationale |
|--------|------|------|-----------|
| Pod restarts | = 0 | > 0 | Restarts indicate design failure |
| Data corruption | = 0 | > 0 | Any corruption is critical |
| Cross-tenant data leakage | = 0 | > 0 | Security violation |
| OOMKill events | = 0 | > 0 | Memory management failure |
| Cascade to other APIs | = No | = Yes | Isolation failure |

---

## Step 5: Per-Metric Calculation Examples

### Latency Metrics

```
Baseline P95 = 239ms (from R137 test report)
Test Type = Burst (2.0x factor)

PASS = 239ms × 2.0 = 478ms → round to 500ms
FAIL = 500ms × 2.0 = 1000ms → 1s
```

### Error Rate Metrics

```
SLO Error Rate = 0.5% (from SLA document)
Test Type = Burst (2.0x factor)

PASS = 0.5% × 2.0 = 1.0%
FAIL = 1.0% × 5.0 = 5.0%  (use 5x for error rates)
```

### Recovery Time Metrics

```
Industry Standard = 30s
Test Type = Burst (2.0x factor)

PASS = 30s × 2.0 = 60s
FAIL = 60s × 2.0 = 120s
```

### Resource Metrics

```
SLO CPU = 80% (from SLA document)
Test Type = Burst (1.25x factor for resources)

PASS = 80% × 1.25 = 100%
FAIL = N/A (CPU can burst, monitor for sustained)
```

---

## Quick Reference Tables

### Latency Thresholds by Test Type

| Test Type | PASS Formula | FAIL Formula | Example (239ms baseline) |
|-----------|--------------|--------------|--------------------------|
| Baseline | Baseline × 1.0 | PASS × 2 | PASS: 239ms, FAIL: 478ms |
| Burst | Baseline × 2.0 | PASS × 2 | PASS: 500ms, FAIL: 1000ms |
| Chaos | Baseline × 3.0 | PASS × 2 | PASS: 720ms, FAIL: 1440ms |
| Soak | Baseline × 1.0 | PASS × 1.2 | PASS: 239ms, FAIL: 287ms |
| Stress | Baseline × 2.5 | PASS × 2 | PASS: 600ms, FAIL: 1200ms |

### Error Rate Thresholds by Test Type

| Test Type | PASS Formula | FAIL Formula | Example (0.5% SLO) |
|-----------|--------------|--------------|---------------------|
| Baseline | SLO × 1.0 | PASS × 5 | PASS: 0.5%, FAIL: 2.5% |
| Burst | SLO × 2.0 | PASS × 5 | PASS: 1.0%, FAIL: 5.0% |
| Chaos | SLO × 5.0 | PASS × 2 | PASS: 2.5%, FAIL: 5.0% |
| Soak | SLO × 1.0 | PASS × 2 | PASS: 0.5%, FAIL: 1.0% |
| Stress | SLO × 3.0 | PASS × 2 | PASS: 1.5%, FAIL: 3.0% |

### Recovery Time Thresholds

| Test Type | PASS | FAIL | Notes |
|-----------|------|------|-------|
| Burst | 60s | 120s | Return to baseline after spike |
| Chaos | 60s | 120s | Recovery after dependency restored |
| Pod Kill | 30s | 60s | New pod joins pool |
| Cache Rebuild | 30s | 60s | Cache hit ratio recovers |

### Resource Thresholds

| Metric | PASS | FAIL | Notes |
|--------|------|------|-------|
| CPU (steady) | ≤ 80% | > 90% | SLO target |
| CPU (burst) | ≤ 100% | N/A | Burst allowed |
| Memory (steady) | ≤ 90% | > 95% | SLO target |
| Memory (soak) | Growth < 10% | Growth > 20% | Leak detection |
| Event Loop Lag | < 60ms | > 100ms | Node.js specific |

---

## Worked Example: AM-SYS-02 (Burst Traffic Handling)

### Input Data

| Source | Document | Value |
|--------|----------|-------|
| Baseline P95 | R137 Performance Test | 239ms @ 264 RPS |
| Error SLO | Backend Test Requirements | ≤ 0.5% |
| Burst Ratio | MEL2 Capacity Assessment | 5.5x |
| Recovery | Industry Standard | 30s |
| Pod Restarts | Addonman Test Plan (HP-02) | "no pod restarts" |

### Calculation

| Metric | Baseline | Test Type | Factor | PASS | FAIL |
|--------|----------|-----------|--------|------|------|
| P99 Latency | 239ms | Burst | 2.0x | 239 × 2.0 = **<500ms** | 500 × 2 = **>1000ms** |
| Error Rate | 0.5% | Burst | 2.0x | 0.5 × 2.0 = **≤1%** | 1 × 5 = **>5%** |
| Recovery | 30s | Burst | 2.0x | 30 × 2.0 = **<60s** | 60 × 2 = **>120s** |
| Pod Restarts | 0 | Exception | N/A | **= 0** | **> 0** |

### Final PASS Criteria

```
[PASS] p99 <500ms | [PASS] Error rate ≤1% | [PASS] Recovery <60s | [PASS] Zero restarts
[FAIL] p99 >1s | [FAIL] Error rate >5% | [FAIL] Pod restarts | [FAIL] Recovery >120s
```

---

## Documenting PASS Criteria in Test Plans

### Required Fields

When documenting PASS criteria in test plan CSVs:

```csv
Pass Criteria,[PASS] metric1 <threshold | [PASS] metric2 <threshold | [FAIL] metric1 >threshold | [FAIL] metric2 >threshold
```

### Traceability

Each threshold should be traceable:

```
Threshold: P99 <500ms
Derivation: Baseline (239ms) × Degradation Factor (2.0x) = 478ms → rounded to 500ms
Source: R137 Performance Test Result
Link: <confluence_url>
```

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-29 | System Test Team | Initial methodology |

---

## References

1. Release 137 Performance Test Result (User Concurrent = 30)
2. Netskope Client - Backend Performance Test Requirements
3. MEL2 Cluster Capacity Assessment
4. NPLAN-7032: Capacity Analysis — addonman, pycore-support & ICAAS
5. Addonman_SystemTest_Regression_TestPlan.xlsx
