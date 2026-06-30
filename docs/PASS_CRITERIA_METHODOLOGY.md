# PASS Criteria Derivation Methodology

This document defines the standard methodology for deriving PASS/FAIL criteria for system test scenarios.

---

## Overview

PASS criteria should be:
- **Data-driven**: Based on production baselines and SLOs
- **Multi-stack**: Aggregated across ALL production stacks (not just one)
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

## Step 2: Collect Baseline Values (MULTI-STACK)

Baseline values must come from documented sources and should be **aggregated across all production stacks**.

### Primary Sources (in priority order)

1. **Performance Test Reports**
   - Example: Release 137 Performance Test Result
   - Contains: P95 latency, RPS, CPU, Memory per API

2. **SLA/SLO Documents**
   - Example: Netskope Client - Backend Performance Test Requirements
   - Contains: Target thresholds (P95 ≤ 150ms, Error ≤ 0.5%)

3. **Production Dashboards (ALL STACKS)**
   - Example: Grafana/Prism dashboards for AM2, SV5, DFW3, MEL2, IAD, etc.
   - Contains: Real-time and historical metrics per stack

4. **Capacity Assessments (ALL STACKS)**
   - Example: MEL2, AM2, SV5, DFW3 Cluster Capacity Assessments
   - Contains: Burst ratios, peak traffic patterns per stack

5. **Existing Test Plans**
   - Example: Addonman_SystemTest_Regression_TestPlan.xlsx
   - Contains: Success criteria, customer impact

### Multi-Stack Data Aggregation Rules

**CRITICAL**: Do not use data from a single stack. Collect from ALL production stacks and aggregate:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              MULTI-STACK DATA AGGREGATION RULES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Metric Type          │ Aggregation Rule      │ Rationale                   │
│  ─────────────────────┼───────────────────────┼───────────────────────────  │
│  RPS (baseline)       │ MAX across stacks     │ Test at highest load        │
│  Burst ratio          │ MAX across stacks     │ Worst-case spike            │
│  P95/P99 latency      │ P95 across stacks     │ Typical worst-case          │
│  Memory usage         │ MAX across stacks     │ Highest consumption         │
│  Error rate           │ MAX across stacks     │ Worst reliability           │
│  CPU usage            │ P95 across stacks     │ Typical peak                │
│  Recovery time        │ MAX across stacks     │ Slowest recovery            │
│  Connection pool      │ MAX across stacks     │ Highest utilization         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Multi-Stack Matters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHY MULTI-STACK DATA IS CRITICAL                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Different stacks have different characteristics:                           │
│                                                                             │
│  Stack │ Traffic    │ Customer Mix       │ Peak Times      │ Burst Pattern │
│  ──────┼────────────┼────────────────────┼─────────────────┼─────────────  │
│  AM2   │ Lower      │ APAC enterprises   │ APAC business   │ Moderate      │
│  SV5   │ Higher     │ US West tech       │ US business     │ High          │
│  DFW3  │ Medium     │ US Central mixed   │ US business     │ Moderate      │
│  MEL2  │ Medium     │ ANZ enterprises    │ ANZ business    │ Very High     │
│  IAD   │ High       │ US East finance    │ US business     │ High          │
│                                                                             │
│  Using only ONE stack's data will miss:                                     │
│  • Highest traffic patterns (might be SV5 or IAD)                           │
│  • Worst burst ratios (might be MEL2)                                       │
│  • Memory pressure patterns (might be DFW3)                                 │
│  • Regional edge cases                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Stack Data Collection Template

```
Metric: [Burst Ratio]

Stack Data:
  AM2:  [3.2x]  Source: [AM2 Capacity Assessment]   Date: [YYYY-MM-DD]
  SV5:  [4.1x]  Source: [SV5 Capacity Assessment]   Date: [YYYY-MM-DD]
  DFW3: [3.8x]  Source: [DFW3 Capacity Assessment]  Date: [YYYY-MM-DD]
  MEL2: [5.5x]  Source: [MEL2 Capacity Assessment]  Date: [YYYY-MM-DD]
  IAD:  [N/A]   Source: [Not documented]            Date: [N/A]

Aggregated Value: [5.5x]
Aggregation Rule: [MAX across stacks]
Source Stack: [MEL2]
Data Gaps: [IAD burst ratio not documented - ACTION: collect data]
```

### Single-Metric Documentation Template

```
Metric: [P95 Latency]
Baseline Value: [239ms]
Source: [Release 137 Performance Test Result]
Source Link: [https://confluence.netskope.com/...]
Conditions: [30 concurrent users, single API]
Date Collected: [YYYY-MM-DD]
Stacks Included: [AM2, SV5, DFW3, MEL2]
Aggregation: [P95 across all stacks]
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
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PASS CRITERIA FORMULA                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PASS_THRESHOLD = Baseline × Degradation_Factor                             │
│                                                                             │
│  FAIL_THRESHOLD = PASS_THRESHOLD × 2                                        │
│                                                                             │
│  Where:                                                                     │
│    Baseline = MAX/P95 metric from verified sources ACROSS ALL STACKS        │
│    Degradation_Factor = Factor based on test type                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
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

### Latency Metrics (Multi-Stack)

```
Stack Data for P95 Latency:
  AM2:  220ms
  SV5:  255ms
  DFW3: 235ms
  MEL2: 239ms

Aggregated Baseline = P95([220, 255, 235, 239]) = 252ms
(or use MAX = 255ms for conservative approach)

Test Type = Burst (2.0x factor)

PASS = 255ms × 2.0 = 510ms → round to 500ms
FAIL = 500ms × 2.0 = 1000ms → 1s
```

### Burst Ratio (Multi-Stack)

```
Stack Data for Burst Ratio:
  AM2:  3.2x
  SV5:  4.1x
  DFW3: 3.8x
  MEL2: 5.5x
  IAD:  N/A (data gap)

Aggregated Burst Ratio = MAX([3.2, 4.1, 3.8, 5.5]) = 5.5x
Source Stack: MEL2
Data Gap: IAD not documented (action item)

Use 5.5x for burst test sizing
```

### Error Rate Metrics

```
SLO Error Rate = 0.5% (from SLA document - applies to all stacks)
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

### Resource Metrics (Multi-Stack)

```
Stack Data for CPU:
  AM2:  65%
  SV5:  78%
  DFW3: 72%
  MEL2: 70%

Aggregated Baseline = P95([65, 78, 72, 70]) = 77%
(or use MAX = 78% for conservative)

SLO CPU = 80% (from SLA document)
Test Type = Burst (1.25x factor for resources)

PASS = 80% × 1.25 = 100%
FAIL = N/A (CPU can burst, monitor for sustained)
```

---

## Quick Reference Tables

### Latency Thresholds by Test Type

| Test Type | PASS Formula | FAIL Formula | Example (255ms baseline from multi-stack MAX) |
|-----------|--------------|--------------|-----------------------------------------------|
| Baseline | Baseline × 1.0 | PASS × 2 | PASS: 255ms, FAIL: 510ms |
| Burst | Baseline × 2.0 | PASS × 2 | PASS: 510ms, FAIL: 1020ms |
| Chaos | Baseline × 3.0 | PASS × 2 | PASS: 765ms, FAIL: 1530ms |
| Soak | Baseline × 1.0 | PASS × 1.2 | PASS: 255ms, FAIL: 306ms |
| Stress | Baseline × 2.5 | PASS × 2 | PASS: 638ms, FAIL: 1275ms |

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

## Worked Example: AM-SYS-02 (Burst Traffic Handling) - Multi-Stack

### Input Data (Multi-Stack Collection)

| Metric | AM2 | SV5 | DFW3 | MEL2 | Aggregation | Result | Source |
|--------|-----|-----|------|------|-------------|--------|--------|
| RPS/pod | 176 | 242 | 210 | 195 | MAX | **242** | SV5 |
| Burst ratio | 3.2x | 4.1x | 3.8x | 5.5x | MAX | **5.5x** | MEL2 |
| P95 latency | 220ms | 255ms | 235ms | 239ms | P95 | **252ms** | Multi |
| Memory | 280Mi | 305Mi | 293Mi | 288Mi | MAX | **305Mi** | SV5 |

| Metric | Source | Value |
|--------|--------|-------|
| Error SLO | Backend Test Requirements | ≤ 0.5% |
| Recovery | Industry Standard | 30s |
| Pod Restarts | Addonman Test Plan (HP-02) | "no pod restarts" |

### Calculation

| Metric | Baseline | Test Type | Factor | PASS | FAIL |
|--------|----------|-----------|--------|------|------|
| P99 Latency | 252ms (multi-stack) | Burst | 2.0x | 252 × 2.0 = **<500ms** | 500 × 2 = **>1000ms** |
| Error Rate | 0.5% | Burst | 2.0x | 0.5 × 2.0 = **≤1%** | 1 × 5 = **>5%** |
| Recovery | 30s | Burst | 2.0x | 30 × 2.0 = **<60s** | 60 × 2 = **>120s** |
| Pod Restarts | 0 | Exception | N/A | **= 0** | **> 0** |

### Final PASS Criteria

```
[PASS] p99 <500ms | [PASS] Error rate ≤1% | [PASS] Recovery <60s | [PASS] Zero restarts
[FAIL] p99 >1s | [FAIL] Error rate >5% | [FAIL] Pod restarts | [FAIL] Recovery >120s

Data Sources:
  - P99 baseline: Multi-stack P95 (AM2, SV5, DFW3, MEL2) = 252ms
  - Burst ratio: MAX across stacks = 5.5x (MEL2)
  - RPS baseline: MAX across stacks = 242/pod (SV5)
  - Error SLO: Backend Performance Test Requirements
```

---

## Documenting PASS Criteria in Test Plans

### Required Fields

When documenting PASS criteria in test plan CSVs:

```csv
Pass Criteria,[PASS] metric1 <threshold | [PASS] metric2 <threshold | [FAIL] metric1 >threshold | [FAIL] metric2 >threshold
```

### Traceability (Multi-Stack)

Each threshold should be traceable to source stacks:

```
Threshold: P99 <500ms
Derivation: Multi-stack P95 baseline (252ms) × Degradation Factor (2.0x) = 504ms → rounded to 500ms
Stacks Used: AM2 (220ms), SV5 (255ms), DFW3 (235ms), MEL2 (239ms)
Aggregation: P95 across stacks
Data Gaps: IAD not included (no data available)
Link: <confluence_url>
```

---

## Data Gap Tracking

When collecting multi-stack data, track gaps:

| Stack | Metric | Status | Action |
|-------|--------|--------|--------|
| AM2 | Burst ratio | ❌ Missing | Request from AM2 capacity team |
| IAD | All metrics | ❌ Missing | Schedule IAD capacity assessment |
| SV5 | Memory soak | ❌ Missing | Run 60-min soak test |

**Rule**: If >50% of stacks are missing data for a metric, flag as HIGH PRIORITY data collection before finalizing test plan.

---

## References

1. Release 137 Performance Test Result (User Concurrent = 30)
2. Netskope Client - Backend Performance Test Requirements
3. MEL2 Cluster Capacity Assessment
4. AM2 Cluster Capacity Assessment
5. SV5 Cluster Capacity Assessment
6. DFW3 Cluster Capacity Assessment
7. NPLAN-7032: Capacity Analysis — addonman, pycore-support & ICAAS
8. Addonman_SystemTest_Regression_TestPlan.xlsx
