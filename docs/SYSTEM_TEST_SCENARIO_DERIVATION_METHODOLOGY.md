# System Test Scenario Derivation Methodology

A repeatable framework for deriving system test scenarios for any backend service.

---

## Overview

This methodology produces a standardized CSV of system test scenarios by systematically analyzing the service across multiple dimensions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYSTEM TEST SCENARIO DERIVATION FORMULA                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Scenarios = f(API_Surface, Dependencies, Failure_Modes, Production_Data,  │
│                Escalation_Patterns, Reliability_Principles,                 │
│                Infrastructure_Stress)                                       │
│                                                                             │
│  Where each input contributes specific scenario types:                      │
│    - API_Surface → Baseline & Burst scenarios                               │
│    - Dependencies → Chaos & Integration scenarios                           │
│    - Failure_Modes → Resilience & Recovery scenarios                        │
│    - Production_Data → Load profiles & PASS criteria                        │
│    - Escalation_Patterns → Gap-fill & Edge-case scenarios                   │
│    - Reliability_Principles → Observability & Soak scenarios                │
│    - Infrastructure_Stress → Database, Cache, Storage load scenarios        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Service Discovery (Inputs)

### 1.1 API Surface Analysis

**Goal**: Identify all externally-facing contracts

| Analysis Target | What to Extract | Tools/Commands |
|-----------------|-----------------|----------------|
| Route definitions | Endpoints, methods, versions | `grep -r "app.get\|app.post\|router\|@app.route"` |
| Authentication | Auth types per endpoint | Look for middleware, decorators |
| Rate limits | Limits, quotas | Config files, middleware |
| Request validation | Required params, schemas | OpenAPI specs, validators |
| Response contracts | Status codes, formats | API docs, contract tests |

**Output Table**:

| API Group | Endpoints | Auth Type | Traffic Weight | Critical? |
|-----------|-----------|-----------|----------------|-----------|
| Example | GET /v1/users | JWT | 40% | Yes |

### 1.2 Dependency Mapping

**Goal**: Identify all internal and external dependencies

| Dependency Type | Examples | Discovery Method |
|-----------------|----------|------------------|
| **Databases** | MySQL, MongoDB, PostgreSQL | Config files, ORM imports |
| **Caches** | Redis, Memcached, Valkey | Client imports, config |
| **Message Queues** | Kafka, RabbitMQ, SQS | Producer/consumer imports |
| **Internal Services** | Other microservices | HTTP clients, gRPC stubs |
| **External Services** | AWS, GCS, third-party APIs | SDK imports, env vars |
| **Secrets/Config** | Vault, ConfigMaps | Secret managers |
| **Storage** | S3, GCS, NFS, local disk | File I/O operations |

**Output Table**:

| Dependency | Type | Purpose | Failure Impact | Timeout | Pool Size |
|------------|------|---------|----------------|---------|-----------|
| MySQL | Database | User data | Service down | 30s | 20 |
| Redis | Cache | Session | Auth degraded | 5s | 50 |

### 1.3 Database & Storage Analysis

**Goal**: Deep-dive into data layer characteristics

| Analysis Target | What to Extract | Why It Matters |
|-----------------|-----------------|----------------|
| Connection pool size | Max connections | Pool exhaustion scenarios |
| Query patterns | Read vs Write ratio | Load distribution |
| Transaction scope | Single vs multi-table | Deadlock potential |
| Index usage | Heavy queries | Slow query scenarios |
| Data volume | Table sizes, growth rate | Large dataset handling |
| Replication | Primary-replica setup | Failover scenarios |
| Sharding | Shard key, distribution | Hot shard scenarios |

### 1.4 Configuration Analysis

**Goal**: Identify tunable parameters affecting behavior

| Config Type | Examples | Where to Find |
|-------------|----------|---------------|
| Feature flags | Enable/disable features | Code constants, config files |
| Timeouts | Connection, request, retry | Client configurations |
| Pool sizes | Connection pools, thread pools | Database/HTTP client config |
| Thresholds | Rate limits, circuit breakers | Middleware, config |
| Resource limits | CPU, memory, replicas | K8s manifests, Helm values |
| Batch sizes | Bulk operations | Query configurations |

### 1.5 Health & Observability

**Goal**: Understand monitoring capabilities

| Probe Type | Endpoint | What It Checks |
|------------|----------|----------------|
| Liveness | /health/check | Process alive |
| Readiness | /health/ready | Dependencies up |
| Metrics | /metrics | Prometheus metrics |

---

## Phase 2: Data Collection (External Inputs)

### 2.1 Production Metrics

| Metric | Source | Purpose |
|--------|--------|---------|
| RPS by endpoint | APM dashboards | Load test sizing |
| P50/P95/P99 latency | APM dashboards | PASS criteria baseline |
| Error rates | APM dashboards | PASS criteria baseline |
| Burst patterns | Capacity assessments | Burst scenario sizing |
| Resource utilization | K8s metrics | Resource thresholds |
| **DB query latency** | Database dashboards | DB stress thresholds |
| **DB connection usage** | Database dashboards | Pool exhaustion sizing |
| **Disk I/O** | Infrastructure dashboards | Storage stress thresholds |

### 2.2 SLA/SLO Documents

| Document Type | What to Extract |
|---------------|-----------------|
| Performance test requirements | Target latency, error rate |
| Capacity assessments | Peak traffic, burst ratios |
| Service SLAs | Availability, response time |
| **Database SLAs** | Query latency, connection limits |

### 2.3 Existing Test Plans

| Document Type | What to Extract |
|---------------|-----------------|
| Regression test plans | Customer workflows, traffic weights |
| Performance test results | Baseline measurements |
| Contract tests | API expectations |
| **Database migration tests** | Schema change impacts |

### 2.4 Escalation & Incident Data

| Source | What to Extract |
|--------|-----------------|
| Customer escalations | Root causes, feature gaps |
| IMF/EIMF incidents | Failure patterns, missed scenarios |
| Post-mortems | Systemic issues |
| **Database incidents** | Connection leaks, slow queries, deadlocks |

---

## Phase 3: Scenario Generation Formula

### 3.1 Core Scenario Categories

Every service needs these **10 core scenario categories**:

| # | Category | Purpose | Source Input |
|---|----------|---------|--------------|
| 1 | **Baseline Capacity** | Verify steady-state performance | Production metrics |
| 2 | **Burst Traffic** | Handle traffic spikes | Capacity assessment |
| 3 | **Dependency Chaos** | Survive dependency failures | Dependency map |
| 4 | **Soak/Endurance** | No degradation over time | Reliability principles |
| 5 | **Stress/Saturation** | Graceful degradation at limits | Resource limits |
| 6 | **Recovery** | Return to normal after failures | Health probes |
| 7 | **Observability** | Metrics accuracy under load | Metrics endpoints |
| 8 | **Security/Isolation** | No cross-tenant leakage | Auth analysis |
| 9 | **Database/Storage Stress** | Handle data layer pressure | DB analysis |
| 10 | **Infrastructure Chaos** | Survive infra-level failures | Infra dependencies |

### 3.2 Scenario Generation Rules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCENARIO GENERATION RULES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  API-BASED RULES                                                            │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  FOR each API_Group with Traffic_Weight > 10%:                              │
│      CREATE Baseline scenario                                               │
│      CREATE Burst scenario (if diurnal spike documented)                    │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  DEPENDENCY-BASED RULES                                                     │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  FOR each Critical_Dependency:                                              │
│      CREATE Chaos scenario (dependency down)                                │
│      CREATE Degradation scenario (dependency slow)                          │
│                                                                             │
│  FOR each Cache_Dependency:                                                 │
│      CREATE Cache-miss storm scenario                                       │
│      CREATE Cache rebuild scenario                                          │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  DATABASE & STORAGE RULES (NEW)                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  FOR each Database_Dependency:                                              │
│      CREATE Connection pool exhaustion scenario                             │
│      CREATE Slow query / high latency scenario                              │
│      IF has_replication:                                                    │
│          CREATE Primary-replica failover scenario                           │
│          CREATE Replica lag scenario                                        │
│      IF has_transactions:                                                   │
│          CREATE Concurrent transaction / deadlock scenario                  │
│      IF has_bulk_operations:                                                │
│          CREATE Large batch processing scenario                             │
│                                                                             │
│  FOR each Storage_Dependency (S3, GCS, disk):                               │
│      CREATE Storage unavailable scenario                                    │
│      CREATE Storage high latency scenario                                   │
│      IF large_file_operations:                                              │
│          CREATE Large file handling scenario                                │
│                                                                             │
│  FOR each Message_Queue_Dependency:                                         │
│      CREATE Queue backlog / consumer lag scenario                           │
│      CREATE Queue unavailable scenario                                      │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  INFRASTRUCTURE RULES (NEW)                                                 │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  FOR each Service:                                                          │
│      CREATE Network partition scenario (split-brain)                        │
│      CREATE DNS resolution failure scenario                                 │
│      CREATE Certificate expiry / TLS failure scenario                       │
│      IF uses_connection_pools:                                              │
│          CREATE Connection leak detection scenario (in soak)                │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  GAP-FILL RULES                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  FOR each Escalation_Pattern not covered:                                   │
│      CREATE Gap-fill scenario                                               │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  MANDATORY SCENARIOS (ALWAYS CREATE)                                        │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  ALWAYS CREATE:                                                             │
│      - Soak test (60+ min at baseline)                                      │
│      - Pod failure recovery                                                 │
│      - Multi-tenant isolation (if applicable)                               │
│      - Observability validation                                             │
│      - Connection pool behavior under load                                  │
│      - Memory leak detection (in soak)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Database & Storage Scenario Details

| Scenario Type | What to Test | How to Inject | Metrics to Validate |
|---------------|--------------|---------------|---------------------|
| **Connection Pool Exhaustion** | Service behavior when all DB connections are in use | Slow down DB responses; high concurrent requests | Queue wait time, timeout errors, graceful degradation |
| **Slow Query Simulation** | Impact of slow DB queries on service | Add latency to DB (tc netem, Toxiproxy) | P99 latency increase, timeout handling |
| **Primary-Replica Failover** | Service continuity during DB failover | Kill primary, promote replica | Downtime duration, data consistency, error spike |
| **Replica Lag** | Read-after-write consistency issues | Introduce artificial lag | Stale read errors, retry behavior |
| **Deadlock Handling** | Service behavior during transaction deadlocks | Concurrent conflicting transactions | Retry success, error handling, no hang |
| **Large Result Set** | Memory handling for big queries | Query returning 100K+ rows | Memory usage, streaming behavior, timeout |
| **Bulk Insert/Update** | Performance during batch operations | Large batch write operations | Throughput, transaction timeout, rollback |
| **Storage Unavailable** | Fallback when S3/GCS is down | Block storage endpoint | Graceful error, circuit breaker, retry |
| **Storage High Latency** | Service behavior with slow storage | Add 5-10s latency to storage calls | Request timeout, async handling |
| **Disk I/O Saturation** | Impact of disk pressure | Fill disk, high I/O operations | Write failures, log rotation, recovery |

### 3.4 Infrastructure Chaos Scenario Details

| Scenario Type | What to Test | How to Inject | Metrics to Validate |
|---------------|--------------|---------------|---------------------|
| **Network Partition** | Split-brain behavior | iptables rules, network policies | Leader election, data consistency |
| **DNS Failure** | Service behavior when DNS fails | Block DNS server | Cached resolution, timeout, retry |
| **TLS/Certificate Issues** | Handling of cert problems | Expired/invalid certs | Error handling, no data leak |
| **Connection Leak** | Long-running connection exhaustion | Soak test with monitoring | Pool metrics stable over time |
| **Thread Pool Exhaustion** | Handling of worker thread saturation | High concurrent slow requests | Queue management, rejection |

### 3.5 Priority Assignment Formula

| Priority | Criteria |
|----------|----------|
| **P0** | Customer-facing critical path OR past IMF incident OR data integrity risk |
| **P1** | High-traffic (>20% weight) OR dependency failure OR database chaos |
| **P2** | Edge cases, optimization, secondary paths, infrastructure chaos |

---

## Phase 4: CSV Generation

### 4.1 Standard CSV Schema

```csv
Test ID,Scenario Name,Test Objective,Test Type,Pre-conditions,Test Steps,Expected Results,Pass Criteria,Priority,Dependencies Required,Estimated Duration,Notes
```

### 4.2 Column Definitions

| Column | Description | Example |
|--------|-------------|---------|
| **Test ID** | `{SVC}-SYS-{NN}` format | AM-SYS-01 |
| **Scenario Name** | Descriptive name | Database Connection Pool Exhaustion |
| **Test Objective** | What we're validating | Verify service handles DB pool saturation gracefully |
| **Test Type** | Category from 3.1 | Baseline/Burst/Chaos/Soak/Stress/Recovery/DB-Stress/Infra-Chaos |
| **Pre-conditions** | Required state | Service deployed; DB with pool_size=20; Monitoring enabled |
| **Test Steps** | Numbered actions | 1. Deploy service; 2. Add DB latency; 3. Send concurrent requests; 4. Monitor pool metrics |
| **Expected Results** | Observable outcomes | Graceful queuing; No crashes; Pool recovers after load |
| **Pass Criteria** | PASS/FAIL thresholds | [PASS] Queue wait <5s \| [PASS] No connection errors \| [FAIL] Service crash |
| **Priority** | P0/P1/P2 | P1 |
| **Dependencies Required** | Infrastructure needed | k6; MySQL; Toxiproxy; Prometheus |
| **Estimated Duration** | Test runtime | 20 min |
| **Notes** | Additional context | Based on IMF-12345; Pool size from prod config |

### 4.3 Test ID Naming Convention

```
{SERVICE_PREFIX}-SYS-{SEQUENCE_NUMBER}

Where:
  SERVICE_PREFIX = 2-3 letter service abbreviation
    Examples: AM (addonman), DC (device-classification), PP (provisioner-pycore)
  
  SEQUENCE_NUMBER = 01-99, grouped by category:
    01-09: Baseline scenarios
    10-19: Burst scenarios
    20-29: Dependency Chaos scenarios
    30-39: Soak/Endurance scenarios
    40-49: Stress scenarios
    50-59: Recovery scenarios
    60-69: Observability scenarios
    70-79: Security scenarios
    80-89: Database/Storage stress scenarios (NEW)
    90-99: Infrastructure chaos scenarios (NEW)
```

---

## Phase 5: PASS Criteria Derivation

Reference: `PASS_CRITERIA_METHODOLOGY.md`

### Quick Formula

```
PASS_THRESHOLD = Production_Baseline × Degradation_Factor

Where Degradation_Factor:
  - Baseline test: 1.0x
  - Burst test: 2.0x
  - Chaos test: 3.0x
  - Soak test: 1.0x (but check for drift)
  - Stress test: 2.5x
  - DB Stress test: 3.0x (NEW)
  - Infra Chaos test: 3.0x (NEW)

FAIL_THRESHOLD = PASS_THRESHOLD × 2
```

### Standard Metrics Per Test Type

| Test Type | Metrics to Validate |
|-----------|---------------------|
| Baseline | P95 latency, error rate, CPU, memory |
| Burst | P99 latency, error rate, recovery time, restarts |
| Chaos | Error rate, fallback success, recovery time, cascade |
| Soak | Memory growth, latency drift, error accumulation, **connection pool stability** |
| Stress | Rate limit activation, graceful degradation, no crash |
| Recovery | Time to ready, metric recovery, no data loss |
| **DB Stress** | Connection pool usage, query latency, transaction success, deadlock count |
| **Infra Chaos** | DNS resolution time, TLS handshake, network recovery |

### Database-Specific PASS Criteria

| Metric | PASS | FAIL | Notes |
|--------|------|------|-------|
| Connection pool wait | < 5s | > 30s | Time waiting for connection |
| Active connections | < pool_size | = pool_size sustained | Pool saturation |
| Query P99 | < 3× baseline | > 10× baseline | Slow query impact |
| Deadlock count | = 0 | > 0 | Any deadlock is failure |
| Connection leaks | = 0 over soak | > 0 | Must be zero after test |
| Transaction rollback % | < 5% | > 20% | Failed transactions |
| Replica lag | < 5s | > 30s | Read consistency |

---

## Phase 6: Optimization & Deduplication

### 6.1 Scenario Consolidation Rules

```
IF two scenarios test same dependency failure:
    MERGE into single scenario with multiple validation points

IF scenario has <10% traffic weight AND no escalation history:
    DEFER to P2 or REMOVE

IF scenario duplicates existing integration/contract test:
    MARK as redundant, verify coverage elsewhere

IF database has both read and write paths:
    CREATE separate scenarios for read-heavy vs write-heavy load
```

### 6.2 Final Checklist

Before finalizing CSV:

- [ ] All P0 scenarios are executable in target environment
- [ ] Each scenario has measurable PASS criteria
- [ ] No duplicate coverage across scenarios
- [ ] Gap-fill scenarios address all high-frequency escalations
- [ ] Chaos scenarios cover all critical dependencies
- [ ] **Database stress scenarios cover connection pool, slow queries, failover**
- [ ] **Infrastructure chaos covers network, DNS, TLS**
- [ ] At least one soak test (60+ min) included
- [ ] **Soak test includes connection leak detection**
- [ ] Total scenario count is manageable (<35 for most services)

---

## Appendix A: Service Analysis Checklist

### Codebase Analysis

```bash
# API routes (Node.js)
grep -r "app\.\(get\|post\|put\|delete\|patch\)" --include="*.js"

# API routes (Python Flask/FastAPI)
grep -r "@app\.\(route\|get\|post\)" --include="*.py"
grep -r "@router\." --include="*.py"

# Database connections
grep -r "createPool\|createConnection\|mongoose.connect\|sqlalchemy" --include="*.js" --include="*.py"

# Connection pool config
grep -r "pool\|poolSize\|maxConnections\|connectionLimit" --include="*.json" --include="*.yaml"

# Transaction usage
grep -r "BEGIN\|COMMIT\|ROLLBACK\|transaction\|atomic" --include="*.js" --include="*.py"

# Dependencies (package.json)
cat package.json | jq '.dependencies'

# Dependencies (requirements.txt / pyproject.toml)
cat requirements.txt

# Configuration
find . -name "config*.json" -o -name "*.yaml" -o -name "*.env*"

# Health endpoints
grep -r "health\|ready\|live" --include="*.js" --include="*.py"
```

### External Data Checklist

| Source | Location | Required Info |
|--------|----------|---------------|
| Performance tests | Confluence/Jira | Baseline metrics |
| SLA docs | Confluence | Target thresholds |
| Capacity assessments | Confluence | Burst ratios |
| Escalation tracker | Jira/Excel | Failure patterns |
| Existing test plans | Confluence/Repo | Coverage gaps |
| Production dashboards | Grafana/Prism | Live metrics |
| **Database dashboards** | Grafana/CloudWatch | Query latency, connections |
| **Infrastructure metrics** | K8s dashboards | Pod restarts, network |

---

## Appendix B: Database Scenario Templates

### B.1 Connection Pool Exhaustion

```csv
{SVC}-SYS-80,Database Connection Pool Exhaustion,Verify service handles DB connection pool saturation gracefully without crashing,DB-Stress,Service deployed; DB pool_size={N}; Toxiproxy configured; Monitoring enabled,1. Deploy service with standard pool config; 2. Add 2s latency to DB via Toxiproxy; 3. Send {2×pool_size} concurrent requests; 4. Monitor connection pool metrics; 5. Verify graceful queuing; 6. Remove latency; 7. Verify recovery,[PASS] Requests queue gracefully | [PASS] No connection errors after recovery | [PASS] Pool returns to baseline | [FAIL] Service crash | [FAIL] Connection leak | [FAIL] Unhandled errors,P1,k6; {DB_type}; Toxiproxy; Prometheus,20 min,Pool size from production config
```

### B.2 Database Failover

```csv
{SVC}-SYS-81,Database Primary-Replica Failover,Verify service maintains availability during database failover,DB-Stress,Service deployed; Primary-replica DB setup; Monitoring enabled,1. Run baseline traffic; 2. Kill primary DB; 3. Measure failover time; 4. Verify requests succeed after failover; 5. Check data consistency; 6. Restore primary; 7. Verify normal operation,[PASS] Failover <30s | [PASS] No data loss | [PASS] Error spike <60s | [FAIL] Failover >120s | [FAIL] Data inconsistency | [FAIL] Service crash,P0,k6; {DB_type} with replication; Prometheus,30 min,Critical for data integrity
```

### B.3 Slow Query Simulation

```csv
{SVC}-SYS-82,Database Slow Query Impact,Verify service handles slow database queries without cascading failures,DB-Stress,Service deployed; Toxiproxy configured; Circuit breaker enabled,1. Run baseline traffic; 2. Add 5s latency to DB queries; 3. Monitor service latency and errors; 4. Verify circuit breaker activation; 5. Remove latency; 6. Verify recovery,[PASS] Circuit breaker trips | [PASS] Non-DB requests unaffected | [PASS] Recovery <60s | [FAIL] Cascade to all requests | [FAIL] Service OOM | [FAIL] No recovery,P1,k6; {DB_type}; Toxiproxy; Prometheus,25 min,Tests isolation and circuit breaker
```

---

## Appendix C: Worked Example - Service Analysis to CSV

### Input: New Service "payment-gateway"

**Step 1: API Surface**
```
Found: 12 endpoints across v1/v2
High traffic: POST /v2/process (60%), GET /v2/status (25%)
Auth: JWT + API Key
```

**Step 2: Dependencies**
```
Found: PostgreSQL (primary), Redis (cache), Stripe API (external)
Critical: PostgreSQL, Stripe
DB Config: pool_size=25, timeout=30s, has_replication=true
```

**Step 3: Production Data**
```
RPS: 500 peak, 200 baseline
P95: 120ms baseline
Burst ratio: 3x during sales events
DB query P95: 45ms
DB connections: avg 15, peak 22
```

**Step 4: Generate Scenarios**

| ID | Scenario | Source Rule |
|----|----------|-------------|
| PG-SYS-01 | Baseline capacity | API traffic >10% |
| PG-SYS-10 | Burst traffic (3x) | Documented burst ratio |
| PG-SYS-20 | PostgreSQL failure | Critical dependency |
| PG-SYS-21 | Stripe API timeout | External dependency |
| PG-SYS-22 | Redis cache miss storm | Cache dependency |
| PG-SYS-30 | 60-min soak test | Always include |
| PG-SYS-50 | Pod failure recovery | Always include |
| PG-SYS-70 | Multi-tenant isolation | If applicable |
| **PG-SYS-80** | **DB connection pool exhaustion** | **Database dependency** |
| **PG-SYS-81** | **PostgreSQL failover** | **has_replication=true** |
| **PG-SYS-82** | **Slow query impact** | **Database dependency** |
| **PG-SYS-90** | **Network partition** | **Infrastructure chaos** |

**Result: 12 scenarios covering the service systematically including database stress**

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-29 | System Test Team | Initial methodology |
| 1.1 | 2026-06-29 | System Test Team | Added Database & Infrastructure stress scenarios |
