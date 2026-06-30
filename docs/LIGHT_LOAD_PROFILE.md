# Load Profile: `light` Breakdown

## Command
```bash
./scripts/k6-operator-test.sh start-load light --env minikube-cluster
```

---

## Load Profile Specifications

### Throughput

| Metric | Value |
|--------|-------|
| **Base RPS** | 10 requests per second |
| **Total RPS** | ~35 RPS (across all services) |

#### RPS Distribution by Service

```yaml
baseRPS: 10

serviceMultipliers:
  client-oppy-configuration: 2      # 10 × 2 = 20 RPS
  client-oppy-steering: 1           # 10 × 1 = 10 RPS
  client-oppy-orchestrator: 0.5     # 10 × 0.5 = 5 RPS
```

**Total: 35 RPS across all services**

---

### Concurrency (Virtual Users)

```yaml
targetVUs: 20                        # Target: 20 concurrent virtual users
maxVUs: 50                           # Maximum: 50 concurrent users
```

**Ramp Pattern**:
- **Ramp UP**: 0 → 20 VUs over 30 seconds
- **Sustain**: Hold at 20 VUs (runs until stopped)
- **Ramp DOWN**: 20 → 0 VUs over 30 seconds (when stopped)

---

### Traffic Distribution

```yaml
trafficMix:
  read: 70%                          # GET operations
  write: 30%                         # POST/PATCH/DELETE operations
```

---

### Per-Service Load Details

#### 1. **client-oppy-configuration** → 20 RPS

**Operations** (weighted mix):
```
40% listConfigs              = 8 RPS    [GET /client/config]
30% getConfigById            = 6 RPS    [GET /client/config/{id}]
15% createConfig             = 3 RPS    [POST /client/config]
10% updateConfig             = 2 RPS    [PATCH /client/config/{id}]
5%  deleteConfig             = 1 RPS    [DELETE /client/config/{id}]
─────────────────────────────────────
TOTAL                        = 20 RPS
```

**Breakdown**:
- Read operations: 14 RPS (70%)
- Write operations: 6 RPS (30%)

#### 2. **client-oppy-steering** → 10 RPS

**Operations** (weighted mix):
```
30% listSteeringConfigs      = 3 RPS    [GET /config]
25% getSteeringConfigById    = 2.5 RPS  [GET /config/{id}]
15% createSteeringConfig     = 1.5 RPS  [POST /config]
10% updateSteeringConfig     = 1 RPS    [PUT /config/{id}]
5%  deleteSteeringConfig     = 0.5 RPS  [DELETE /config/{id}]
10% getBypassLogging         = 1 RPS    [GET /settings/bypasslogging]
5%  getStatus                = 0.5 RPS  [GET /api/v1/status]
─────────────────────────────────────
TOTAL                        = 10 RPS
```

**Breakdown**:
- Read operations: 7 RPS (70%)
- Write operations: 3 RPS (30%)

#### 3. **client-oppy-orchestrator** → 5 RPS

**Operations** (health check focused):
```
50% getHealth                = 2.5 RPS  [GET /api/v1/ready]
30% getStatus                = 1.5 RPS  [GET /api/v1/status]
20% getMetrics               = 1 RPS    [GET /metrics]
─────────────────────────────────────
TOTAL                        = 5 RPS
```

**Breakdown**:
- All read operations (100%)

---

## Resource Thresholds (Pass/Fail Criteria)

These are the expected resource levels under `light` load:

### CPU

```yaml
warn: 40%          # Alert if CPU > 40% of pod limit
fail: 60%          # TEST FAILS if CPU > 60% of pod limit
```

**Pod limits**: 4 cores
- ⚠️ Warn at: 1.6 cores
- ❌ Fail at: 2.4 cores

### Memory

```yaml
warn: 50%          # Alert if memory > 50% of pod limit
fail: 70%          # TEST FAILS if memory > 70% of pod limit
```

**Pod limits**: 4GB
- ⚠️ Warn at: 2 GB
- ❌ Fail at: 2.8 GB

### Database Connections

```yaml
expected: 10       # Expected active connections under light load
warn: 20           # Alert if active connections > 20
fail: 30           # TEST FAILS if > 30 active (pool is 30 RW total)
```

### Kafka Consumer Lag

```yaml
warn: 50           # Alert if lag > 50 messages
fail: 200          # TEST FAILS if lag > 200 messages
```

---

## Average Payload

```yaml
avgPayloadKB: 3                      # Average request/response size: 3 KB
```

**Network impact**:
- 35 RPS × 3 KB = ~105 KB/s ingress + egress
- Negligible network impact

---

## Timing

```yaml
duration: 0                          # Run indefinitely (until manually stopped)
rampUp: 30s                          # Gradually add VUs over 30 seconds
rampDown: 30s                        # Gradually remove VUs over 30 seconds
```

**Timeline**:
```
Time        VUs     RPS     Activity
────────────────────────────────────────────────────────
0s          0       0       START: Ramp UP begins
15s         10      17.5    Ramp UP progress (halfway)
30s         20      35      Ramp UP complete, SUSTAIN begins
...         20      35      [SUSTAIN - runs until you run stop-load]
T-30s       20      35      Ramp DOWN begins (when you stop)
T-0s        0       0       Ramp DOWN complete, test ends
```

---

## Example Load Over Time

**Assume you run for 5 minutes**:

```
┌─────────────────────────────────────────────────────────────────┐
│ LIGHT LOAD PROFILE - 5 MINUTE RUN                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VUs    ▁▂▃▄▅▆▇█████████████████████████████▇▆▅▄▃▂▁             │
│        0  10 20                            20 10  0              │
│                                                                  │
│  RPS    ▁▂▃▄▅▆▇█████████████████████████████▇▆▅▄▃▂▁             │
│        0  17.5 35                          35 17.5 0             │
│                                                                  │
│  CPU%   ▁▂▃▄▅▆▇███████████████████████▇▆▅▄▃▂▁                  │
│        0  20  40                        40 20  0                 │
│                                                                  │
│ Time    0s    1m    2m    3m    4m    4:30m   5m                │
│         └────────────────────────────────────────┘              │
│         Ramp   Sustain (background load)   Ramp                 │
│         UP                                  DOWN                │
│         30s    ~4 minutes                  30s                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Total Request Count (for 5-minute run)

```
Ramp UP (30s):        ~90 requests    (average 3 RPS ramping to 35)
Sustain (4m):         8,400 requests  (35 RPS × 240 seconds)
Ramp DOWN (30s):      ~90 requests    (average 17.5 RPS ramping down)
─────────────────────────────────────
Total:                ~8,580 requests over 5 minutes
```

---

## Comparison with Other Profiles

| Dimension | idle | light | minikube | p50 | p95 | stress |
|-----------|------|-------|----------|-----|-----|--------|
| **Total RPS** | ~3 | **35** | ~30 | ~200 | ~600 | ~3000 |
| **VUs** | 5 | **20** | 15 | 50 | 100 | 200 |
| **CPU Warn** | 20% | **40%** | 50% | 50% | 60% | 70% |
| **CPU Fail** | 40% | **60%** | 70% | 70% | 70% | 80% |
| **Memory Warn** | 30% | **50%** | 60% | 60% | 70% | 75% |
| **Memory Fail** | 50% | **70%** | 80% | 75% | 80% | 85% |
| **Use Case** | Baseline | **Dev/QA** | Local Testing | Median Prod | Peak Hours | Find Limits |

---

## Real-World Impact on Services

### client-oppy-configuration (20 RPS)

**Per second**:
- 14 GET requests (list/getById)
- 3 POST requests (create)
- 2 PATCH requests (update)
- 1 DELETE request

**Per minute**:
- 840 GET requests
- 180 POST requests
- 120 PATCH requests
- 60 DELETE requests
- **Total: 1,200 requests/minute**

**Expected database load**:
- ~840 SELECT queries/min (reads)
- ~360 INSERT/UPDATE/DELETE queries/min (writes)
- Avg active DB connections: ~10

### client-oppy-steering (10 RPS)

**Per second**:
- 7 GET requests
- 3 POST/PUT/DELETE requests

**Per minute**:
- 420 GET requests
- 180 write requests
- **Total: 600 requests/minute**

### client-oppy-orchestrator (5 RPS)

**Per second**:
- 5 health/status/metrics queries (read-only)

**Per minute**:
- 300 GET requests
- **Total: 300 requests/minute**

---

## When to Use `light` Profile

✅ **Good for**:
- Development and testing
- Quick validation runs
- CI/CD pipelines
- Local Minikube testing
- Before committing code changes

❌ **Not suitable for**:
- Production performance validation
- Stress testing
- Capacity planning
- Finding bottlenecks

---

## Example Usage

### Run scenario with light background load

```bash
# Start light background load
./scripts/k6-operator-test.sh start-load light --env minikube-cluster

# Check status
./scripts/k6-operator-test.sh load-status

# Run your test scenario (adds 50 RPS, total becomes 85 RPS)
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster

# Stop background load
./scripts/k6-operator-test.sh stop-load
```

### Run multiple scenarios under same load

```bash
# Start once
./scripts/k6-operator-test.sh start-load light --env minikube-cluster

# Run all scenarios
./scripts/k6-operator-test.sh --scenario bl01 --env minikube-cluster
./scripts/k6-operator-test.sh --scenario bl02 --env minikube-cluster
./scripts/k6-operator-test.sh --scenario bl03 --env minikube-cluster

# Stop once
./scripts/k6-operator-test.sh stop-load
```

---

## Monitoring Commands

```bash
# Watch cluster load
kubectl top pods -n client-oppy --containers

# Watch k6 load generator
kubectl logs -f -n k6-tests -l k6_cr=cluster-load

# Check Kubernetes services
kubectl get svc -n client-oppy

# Monitor CPU/Memory
kubectl get pods -n client-oppy -o wide
```

---

## Summary

When you run `./scripts/k6-operator-test.sh start-load light --env minikube-cluster`:

- **35 RPS** of background load starts running
  - 20 RPS to client-oppy-configuration
  - 10 RPS to client-oppy-steering
  - 5 RPS to client-oppy-orchestrator
- **20 virtual users** ramp up over 30 seconds
- **70:30 read:write** traffic mix
- Expected **CPU: 40%**, **Memory: 50%** of pod limits
- Runs indefinitely until you run `stop-load`
- Can run test scenarios on top of this background load
