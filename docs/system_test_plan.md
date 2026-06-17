# System Test Plan — NPLAN-4534: REST APIv2 Support for Client Configuration (Client Backend)

| Field | Value |
|---|---|
| **NPLAN** | NPLAN-4534 |
| **Service** | `client-oppy-configuration` |
| **Document Version** | v1.0 — Draft |
| **Date** | 2026-06-08 |
| **Author** | System QE |
| **SOP Reference** | [SOP: NPLAN Backend System Test](https://netskope.atlassian.net/wiki/x/0gC13gE) |
| **Design Document** | [Design Document — NPLAN 4534](https://netskope.atlassian.net/wiki/spaces/CDTBA/pages/6026298043) |
| **Feature Test Plan** | [Test Plan NPLAN-4534](https://netskope.atlassian.net/wiki/spaces/CDTBA/pages/7465795610) |
| **Philosophy** | NS Client Reliability Manifesto — "Discover Failures Before Customers Do" |

---

## Table of Contents

1. [Applicability](#1-applicability)
2. [Entry Criteria](#2-entry-criteria)
3. [System Architecture & Dependency Map](#3-system-architecture--dependency-map)
4. [SLO Definitions & Targets](#4-slo-definitions--targets)
5. [Benchmarking Parameters](#5-benchmarking-parameters)
6. [Test Design — Scenario Matrix](#6-test-design--scenario-matrix)
7. [Soak & Scale Profile](#7-soak--scale-profile)
8. [Execution Plan](#8-execution-plan)
9. [Test Data Plan](#9-test-data-plan)
10. [Environment Specification](#10-environment-specification)
11. [Data Integrity & Consistency](#11-data-integrity--consistency)
12. [Observability & SLO Validation](#12-observability--slo-validation)
13. [Exit Criteria](#13-exit-criteria)
14. [Success Metrics](#14-success-metrics)

---

## 1. Applicability

NPLAN-4534 qualifies for Backend System Test per SOP Section 3 because it meets **all five** triggers:

| SOP Trigger | NPLAN-4534 Relevance |
|---|---|
| Changes to shared contracts or inter-service APIs | New REST API v2 replacing PHP; 9 business endpoints onboarded to API Gateway |
| Modifications to persistence schemas or data models | Uses existing MariaDB tables (`client_config`, `client_config_certs_assoc`, `client_config_jobs`, `global_vars`) with new Go service; new `client_config_jobs` table via migration |
| New or modified resilience mechanisms | Circuit breakers (go-zero adaptive), retries (2x for Provisioner/Addonman), Kafka best-effort publishing, Redis cache+queue, deadlock retries (3x) |
| Critical path services | Client configuration directly controls endpoint policy (fail-close, tunnel protocol, update policy, NPA access) |
| Multi-tenant with control-plane/data-plane coupling | Tenant-scoped DBs; config changes propagate to Data Plane via Kafka→Orchestrator→Provisioner→Endpoints |

---

## 2. Entry Criteria

All items must be satisfied before test execution begins.

| # | Criterion | Owner | Status |
|---|---|---|---|
| EC-1 | Joint planning completed with QE, service owners (`client-oppy` team), and SRE — scenarios, environments, ownership, and expected outcomes aligned | QE Lead | ☐ |
| EC-2 | No open P0 functional defects blocking critical backend flows on target branch | Feature QE | ☐ |
| EC-3 | Feature QE sanity suite passing on target environment; health checks green for all upstream/downstream dependencies | Feature QE | ☐ |
| EC-4 | Environment ready: production-like config, feature flags set, seeded data loaded, observability hooks enabled (Prometheus scraping, ELK/OpenSearch indexing, OTel tracing) | SRE + QE | ☐ |
| EC-5 | Dependency map validated (Section 3 below): upstream/downstream contracts, timeouts, retries, circuit breakers, and backoff policies documented and confirmed with service owners | QE + Dev | ☐ |
| EC-6 | Test data plan complete (Section 9 below): representative tenants, config counts, legacy PHP data seeded, realistic user profiles | QE | ☐ |
| EC-7 | Fault injection tooling validated: Chaos Mesh / tc / iptables rules tested in isolation before applying to test scenarios | QE + SRE | ☐ |
| EC-8 | Grafana dashboards for service health, API performance, and infrastructure metrics accessible and verified | SRE | ☐ |
| EC-9 | Baseline (golden run) metrics captured per Section 5 benchmarking parameters | QE | ☐ |

---

## 3. System Architecture & Dependency Map

### 3.1 Component Inventory

```
                           ┌─────────────────────┐
                           │  Traffic Sources     │
                           │  ┌───────┐ ┌──────┐ │
                           │  │ WebUI │ │ Ext  │ │
                           │  │(NgWeb)│ │ API  │ │
                           │  └───┬───┘ └──┬───┘ │
                           └─────┼─────────┼─────┘
                                 ▼         ▼
                    ┌────────────────────────────┐
                    │   C1: API Gateway (Kong)   │
                    │   Auth, RBAC, Rate Limit   │
                    └────────────┬───────────────┘
                                 ▼
                    ┌────────────────────────────┐
                    │   C2: Nginx Ingress        │
                    └────────────┬───────────────┘
                                 ▼
                    ┌────────────────────────────┐
                    │   C3: K8s Service          │
                    │   (ClusterIP)              │
                    └────────────┬───────────────┘
                                 ▼
          ┌──────────────────────────────────────────┐
          │  C4: client-oppy-configuration Pods      │
          │  (2 nonprod / 4 prod, fixed replicas)    │
          │  ┌──────────────┐  ┌──────────────────┐  │
          │  │  C4a: Vault  │  │  C4b: Go Service │  │
          │  │  Sidecar     │  │  (Gin/Huma)      │  │
          │  └──────────────┘  └──────────────────┘  │
          └──────┬────────┬────────┬───────┬─────────┘
                 │        │        │       │
        ┌────────┘   ┌────┘   ┌────┘  ┌───┘
        ▼            ▼        ▼       ▼
  ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────────────────┐
  │C5:MariaDB│ │C6:Redis│ │C7:   │ │ Downstream APIs  │
  │ Galera   │ │Cache + │ │Kafka │ │                  │
  │ Cluster  │ │Queue   │ │      │ │ C8:  User Manager│
  │          │ │        │ │      │ │ C9:  Provisioner │
  │ RO + RW  │ │        │ │      │ │ C10: Addonman    │
  │ pools    │ │        │ │      │ │ C11: NPA Nexus   │
  └──────────┘ └────────┘ └──┬───┘ └──────────────────┘
                              │
                              ▼
                    ┌────────────────────────────┐
                    │ C12: client-oppy-           │
                    │      orchestrator          │
                    │ (Kafka consumer)           │
                    └────────────┬───────────────┘
                                 ▼
                    ┌────────────────────────────┐
                    │ C13: Data Plane /          │
                    │      Endpoint Clients      │
                    └────────────────────────────┘

  Cross-cutting:
    C14: Kubernetes Infrastructure
    C15: Observability Stack (Prometheus, ELK/OpenSearch, OTel, Grafana)
    C16: Feature Flags & Rollout Mechanisms
```

### 3.2 Formal Dependency Map

| # | Source | Target | Protocol | Endpoint | Timeout | Retry | Circuit Breaker | Failure Mode | Criticality |
|---|---|---|---|---|---|---|---|---|---|
| D1 | API Gateway | client-oppy-configuration | HTTP/HTTPS | All 9 endpoints | Gateway default | None | None | 502/504 to client | CRITICAL — all traffic |
| D2 | client-oppy-configuration | MariaDB RW | TCP (MySQL) | tenant{id}db, core_data | Pool: ConnMaxLifetime | Deadlock retry 3x, 2s jitter | None | 500 on all writes | CRITICAL — write path |
| D3 | client-oppy-configuration | MariaDB RO | TCP (MySQL) | tenant{id}db, core_data | Pool: ConnMaxLifetime | Deadlock retry 3x, 2s jitter | None | 500 on reads | CRITICAL — read path |
| D4 | client-oppy-configuration | Redis | TCP | Cache + Queue keys | Client default | None documented | None | Degraded (fallback to DB) or error | HIGH — cache/queue |
| D5 | client-oppy-configuration | Kafka | TCP | Topic: `client_oppy_config` | Async (buffered) | Best-effort, drops on full | None | Silent event loss | HIGH — DP sync |
| D6 | client-oppy-configuration | User Manager API | HTTP | `/v2/api/{tenantID}/users/attributes/ou`, `/v2/api/{tenantID}/groups`, `/v2/api/{tenantID}/users` | PROVISIONER_TIMEOUT | None documented | go-zero adaptive (10s window, 1s probe) | 400/500 on create/update with targets | CRITICAL — write path validation |
| D7 | client-oppy-configuration | Provisioner-pycore | HTTP | POST `/client/config` | PROVISIONER_TIMEOUT | 2x on 5xx | go-zero adaptive | Non-fatal; DP not notified | MEDIUM — async notification |
| D8 | client-oppy-configuration | Provisioner-pycore | HTTP | POST `/ad/sync` | PROVISIONER_TIMEOUT | 2x on 5xx | go-zero adaptive | Non-fatal; prelogin not synced | MEDIUM — prelogin only |
| D9 | client-oppy-configuration | Provisioner-pycore | HTTP | GET `/client/goldenversions` | PROVISIONER_TIMEOUT | 2x on 5xx | go-zero adaptive | GET /versions fails | HIGH — metadata read path |
| D10 | client-oppy-configuration | Addonman | HTTP | GET `/adconfig?orgkey={key}&capability=1` | Default | 2x on 5xx | go-zero adaptive | Non-fatal; prelogin degraded | LOW — prelogin only |
| D11 | client-oppy-configuration | NPA QDispatcher | HTTP | POST `/npa/qdispatcher` | Default | None documented | go-zero adaptive | Non-fatal; NPA not updated | LOW — secureAccess flag only |
| D12 | Kafka | client-oppy-orchestrator | TCP | Consumer group: `client-oppy-consumer` | N/A | At-least-once | N/A | DP config stale | HIGH — DP sync chain |
| D13 | Vault Agent | client-oppy-configuration | File/Env | DB DSN, AES keys | Init container | K8s restart | N/A | Pod CrashLoopBackOff | CRITICAL — startup |

### 3.2.1 How to Read the Dependency Map — Test Derivation Per Row

Each row in the dependency map directly generates test scenarios. Here is how a system QE engineer derives tests from each row:

**D1 (API Gateway → Service):**
- Gateway rate limit exceeded → admin gets 429; backend never overwhelmed
- Gateway down → all traffic fails 502; backend is healthy but unreachable
- Gateway routes to wrong backend → admin sees wrong data or errors
- Gateway token validation fails → unauthorized request never reaches service

**D2 (Service → MariaDB RW):**
- RW node down → all writes fail 500; admin cannot save configs
- RW node slow (2s) → write latency spikes; connection pool fills up
- Deadlock on concurrent writes → retry succeeds (3x, 2s jitter) transparently; or all 3 fail → admin gets 500
- Connection pool exhausted (25 max) → requests queue; admin sees timeouts

**D3 (Service → MariaDB RO):**
- RO node down → all reads fail 500; admin cannot view configs
- Replication lag → admin creates config, immediate GET doesn't show it (wsrep_sync_wait=1 should prevent this)
- RO slow under load → read latency spikes; wsrep_sync_wait overhead measured

**D4 (Service → Redis):**
- Redis down → does service fallback to DB (slower) or fail (500)? This determines customer impact
- Redis slow (100ms) → every API call adds 100ms; admin sees degraded page load
- Redis memory full → keys evicted; cache miss storm hits DB
- Redis restarts → all pods cold cache; thundering herd on DB

**D5 (Service → Kafka):**
- Kafka broker down → events dropped silently; admin gets 200 but DP never learns about config change
- Internal buffer full (1000 msgs) → new events dropped; no error to admin
- Kafka slow → async publish should NOT block API response; verify
- Kafka partition leader moves → brief gap in events; orchestrator catches up

**D6 (Service → User Manager):**
- UM timeout → admin gets timeout error on create/update
- UM 5xx → no retry → admin gets error on first failure
- UM down for 10s → circuit breaker trips → ALL creates/updates with OU/Group targets fail even after UM recovers
- UM recovery → 1s probe delay → how long until writes work again?

**D7 (Service → Provisioner POST /client/config):**
- Provisioner down → CUD succeeds (non-fatal); admin gets 200 but DP never gets notification
- Provisioner 5xx → 2x retry wastes time; then drops (non-fatal); admin sees slower response
- Provisioner slow (2s) → every CUD adds 2s latency; admin experiences slow saves
- Circuit breaker trips → notifications blocked for 10s+ even after Provisioner recovers

**D8 (Service → Provisioner POST /ad/sync):**
- /ad/sync fails → prelogin user not synced; config saved but tunnel won't establish
- Username change: delete old succeeds, create new fails → user loses prelogin access entirely
- Only triggered when prelogin enabled → most configs unaffected

**D9 (Service → Provisioner GET /client/goldenversions):**
- Provisioner timeout → GET /client/versions returns error; admin cannot see available versions
- Provisioner returns stale data → admin selects outdated version for update policy
- Unlike D7/D8, this is in the CRITICAL READ path (not non-fatal)

**D10 (Service → Addonman):**
- Addonman down → prelogin flow fails silently; config saved but secureUPN not fetched
- Only affects prelogin-enabled configs → low blast radius

**D11 (Service → NPA QDispatcher):**
- NPA down → non-fatal; NPA tunnels not updated with config change
- Only triggered when secureAccess feature flag is ON → very narrow scope

**D12 (Kafka → Orchestrator):**
- Orchestrator consumer lag → DP config updates delayed by minutes/hours
- Orchestrator down > 7 days → events expire from Kafka retention; permanently lost
- Duplicate events from Kafka redelivery → orchestrator must handle idempotently

**D13 (Vault Agent → Service):**
- Vault unavailable at pod startup → pod CrashLoopBackOff; reduced capacity
- DB credentials rotate while running → existing connections work; new connections must use new creds
- AES key rotation → old encrypted data must remain readable

### 3.3 Integration Patterns (Design Doc Section 3.2.C)

Two patterns coexist **simultaneously** for every CUD operation:

1. **Synchronous (Direct API)**: Service → Provisioner/NPA APIs → immediate notification (non-fatal)
2. **Asynchronous (Event-Driven)**: Service → Kafka → Orchestrator → Provisioner → DP (eventual)

Both paths must be validated independently and together. The synchronous path is the legacy bridge; the async path is the target architecture.

---

## 4. SLO Definitions & Targets

### 4.1 Service-Level Objectives

These SLOs are derived from: Design Doc Section 9 (alerting thresholds), API Gateway contract (rate limits), K8s configuration (probes), and scale targets (4K→8K users).

#### 4.1.1 Availability SLO

| SLO | Definition | Target | Measurement Window | Alert Threshold | Source |
|---|---|---|---|---|---|
| **Service Availability** | 1 - (5xx responses / total responses) | **≥ 99.9%** | Rolling 5-minute window | > 1% 5xx (Design Doc Section 9) | **Proposed** — derived from Design Doc "1% 5xx alert"; if 1% triggers alert, SLO must be below. Validate with SRE. |
| **Pod Availability** | Pods ready / desired replicas | **≥ 75%** (3/4 prod) | Continuous | < 75% triggers PDB violation | **Derived** — from Helm chart: 4 replicas, PDB maxUnavailable:1 → minimum 3/4 = 75%. |

#### 4.1.2 Latency SLOs

| Endpoint Category | p50 Target | p95 Target | p99 Target | Rationale | Source |
|---|---|---|---|---|---|
| **Read — single (GET /config/{id})** | ≤ 50ms | ≤ 200ms | ≤ 500ms | Cache hit expected; single DB query on miss | **Proposed** — no documented target. Estimated from architecture (Redis cache + single DB query). Must baseline in golden run. |
| **Read — list (GET /config)** | ≤ 100ms | ≤ 500ms | ≤ 1s | Pagination; query complexity scales with config count | **Proposed** — estimated. Depends on tenant config count and query optimization. |
| **Read — metadata (GET /versions, /platforms)** | ≤ 100ms | ≤ 500ms | ≤ 1s | /versions depends on Provisioner; /platforms is DB-only | **Proposed** — /versions latency is bounded by PROVISIONER_TIMEOUT. |
| **Write — single (POST, PATCH, DELETE)** | ≤ 200ms | ≤ 1s | ≤ 2s | DB write + UM validation + downstream notifications | **Proposed** — estimated from call chain: ~200ms per hop (DB + UM + Provisioner + Kafka). No documented target. |
| **Write — bulk (POST /bulkdelete)** | ≤ 2s | ≤ 5s | ≤ 10s | Up to 250 deletes in single transaction | **Proposed** — estimated from 250 row deletes + priority gap-closure in single transaction. No documented target. |
| **Poll — bulk status (GET /bulkstatus)** | ≤ 50ms | ≤ 200ms | ≤ 500ms | Simple DB read | **Proposed** — single row lookup by job ID. |

> **Note**: All latency targets are **proposed estimates** to be validated during the golden run (Phase 1). No latency SLOs are documented in the Design Document — it only states "p95 > threshold" without defining the threshold. Final targets will be set based on actual golden run measurements and agreed upon with service owners and SRE.

#### 4.1.3 Throughput SLOs

| Metric | Target | Rationale | Source |
|---|---|---|---|
| **Sustained throughput** | ≥ 50 req/s (API Gateway rate limit) | Must handle full rate limit without degradation | **Documented** — API Gateway contract: 50 req/s rate limit in `gateway-contract.yaml`. |
| **Burst tolerance** | Handle 2x burst (100 req/s) for 30s | Design Doc Section 13: "ready for 2x growth (8K users)" | **Documented** — Design Doc Section 13: "ready for at least 2x growth (~8K users)". |
| **Dual traffic source** | WebUI (30 req/s) + API Gateway (20 req/s) simultaneously | Design Doc Section 10: "handle both NgWeb and API Gateway" | **Documented** — Design Doc Section 10: "performant and scalable to handle traffic from both NgWeb and API Gateway". Split ratio is proposed. |

#### 4.1.4 Data Integrity SLOs

| Metric | Target | Rationale | Source |
|---|---|---|---|
| **Write consistency** | 100% — every successful write reflected in subsequent read | No stale reads after successful mutation | **Non-negotiable** — correctness requirement. Architecture supports via wsrep_sync_wait=1 on RO. |
| **Priority sequence integrity** | 100% — contiguous, no gaps, no duplicates after any CUD | Priority management is evaluation-order critical | **Non-negotiable** — Design Doc Section 4.6: priority system is core to config evaluation. |
| **Kafka event delivery** | ≥ 99% of CUD operations produce a Kafka event | Best-effort design allows drops, but must be rare under normal load | **Proposed** — no documented SLO. Codebase uses best-effort with 1000-msg buffer. 99% is an estimate; actual rate depends on Kafka health. |
| **Idempotency correctness** | 100% — bulk delete retry with same token returns existing result | Design Doc Section 4.9 | **Documented** — Design Doc Section 4.9: "retries with same token return existing job status". |

#### 4.1.5 Resilience SLOs

| Metric | Target | Measurement | Source |
|---|---|---|---|
| **MTTR — single pod loss** | ≤ 30s | Time from pod kill to replacement pod ready | **Derived** — K8s defaults: 10s probe period × 3 failures = 30s detection. Replacement pod startup adds more. Actual MTTR must be measured. |
| **MTTR — dependency recovery** | ≤ 60s | Time from dependency restored to service returning to baseline | **Proposed** — estimated from circuit breaker 10s window + 1s probe + propagation. No documented target. |
| **Detection Time — probe-based** | ≤ 30s | Time from failure to readiness probe failure (K8s default: 10s period × 3 failures) | **Derived** — from Helm chart: K8s default probe config (10s period, 3 failure threshold). |
| **Detection Time — alert-based** | ≤ 3 minutes | Time from failure to Grafana alert firing | **Proposed** — estimated from Prometheus scrape interval + alert evaluation window. Depends on Grafana config which needs SRE validation. |
| **Error budget during single failure** | ≤ 1% 5xx | Error rate during single-dependency failure | **Derived** — matches Design Doc Section 9 alert threshold of ">1% 5xx errors". |
| **Graceful degradation** | Non-fatal downstream failures produce 0% 5xx | Provisioner/NPA/Kafka failures must not cause API errors | **Documented** — Design Doc Section 4.8: all downstream notifications marked "Non-fatal". |

#### 4.1.6 Recovery SLOs

| Metric | Target | Measurement | Source |
|---|---|---|---|
| **Recovery success rate** | 100% for P0 scenarios | After failure removed, system returns to full health automatically | **Non-negotiable** — system must self-heal without manual intervention for all P0 scenarios. |
| **Cache rebuild time** | ≤ 5 minutes | Time from Redis restart to cache hit ratio returning to baseline | **Proposed** — no documented target. 5 minutes is an estimate; depends on cache warming strategy and tenant count. Must be measured. |
| **Zero data loss on recovery** | 100% | No configs lost, corrupted, or duplicated after any recovery | **Non-negotiable** — correctness requirement. |
| **Kafka consumer catch-up** | ≤ 10 minutes | After orchestrator restart, consumer processes all pending events | **Proposed** — estimated from topic partition count (3) and expected event volume. No documented target. |

### 4.2 SLO Burn Rate Analysis

> **Source**: All burn rate calculations below are **proposed** — derived from the proposed SLO targets above. These become meaningful only after SLO targets are finalized with SRE.

| SLO | Error Budget (30-day) | Burn Rate Alert (fast) | Burn Rate Alert (slow) |
|---|---|---|---|
| Availability ≥ 99.9% | 43.2 minutes of downtime | 14.4x burn (exhausts in 2 hours) → Page | 3x burn (exhausts in 10 days) → Ticket |
| p95 latency (writes) ≤ 1s | 5% of requests can exceed | 10% of requests exceeding → Page | 7% exceeding → Ticket |
| Event delivery ≥ 99% | 1% events can be dropped | 5% drop rate → Page | 2% drop rate → Ticket |

---

## 5. Benchmarking Parameters

### 5.1 Layer 1 — Service-Level Indicators (Golden Signals)

| Parameter | Collection Method | Baseline Capture | Saturation Signal |
|---|---|---|---|
| Request rate (req/s) by endpoint | Prometheus `http_requests_total` | Per-endpoint during golden run | N/A (input, not output) |
| Latency p50/p90/p95/p99 by endpoint | Prometheus histogram `http_request_duration_seconds` | Per-endpoint during golden run | p95 exceeds SLO target |
| Error rate — 4xx (%) | Prometheus counter by status | Expected rate during golden run | Spike above baseline |
| Error rate — 5xx (%) | Prometheus counter by status | ≈ 0% during golden run | > 0.1% |
| Request queue depth | Gin middleware / Go custom metric | 0 during golden run | > 0 sustained |
| Active connections | Gin metric | Baseline during golden run | Approaching server limit |

### 5.2 Layer 2 — Compute Resources (Pod-Level)

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| CPU utilization (%) | `container_cpu_usage_seconds_total` / limit (2 cores) | > 80% |
| CPU throttle rate | `container_cpu_cfs_throttled_seconds_total` | Any throttling |
| Memory RSS | `container_memory_rss` | > 700Mi (approaching 768Mi limit) |
| Go heap in-use | `go_memstats_heap_inuse_bytes` | > 600MiB (approaching GOMEMLIMIT 690MiB) |
| GC pause time | `go_gc_duration_seconds` | p99 > 10ms |
| GC cycles/sec | `go_gc_duration_seconds_count` rate | Rapid increase under load |
| Goroutine count | `go_goroutines` | Monotonic increase = leak |
| Open file descriptors | `process_open_fds` | Approaching `process_max_fds` |
| Pod restart count | `kube_pod_container_status_restarts_total` | Any > 0 |

### 5.3 Layer 3 — Database (MariaDB Galera)

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| Connection pool — active | `sql.DB.Stats().InUse` (custom metric) | Near 25 (max_open_conns) |
| Connection pool — idle | `sql.DB.Stats().Idle` | 0 idle + wait count > 0 |
| Connection pool — wait count | `sql.DB.Stats().WaitCount` | Any > 0 |
| Connection pool — wait duration | `sql.DB.Stats().WaitDuration` | > 100ms average |
| Query latency — read p50/p95/p99 | Custom instrumentation | p95 > 50ms |
| Query latency — write p50/p95/p99 | Custom instrumentation | p95 > 100ms |
| Deadlock count | MariaDB `Innodb_deadlocks` | Any > 0 |
| Deadlock retry success rate | Custom metric | < 100% |
| Replication lag | `wsrep_local_recv_queue` | > 0 sustained |
| Lock wait time | `Innodb_row_lock_time_avg` | > 50ms |
| `client_config_jobs` row count | Periodic COUNT(*) | Monotonic growth |
| Rows examined per query | Slow query log | Unexpected table scans |

### 5.4 Layer 4 — Redis

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| Cache hit ratio | Redis INFO: `keyspace_hits / (hits + misses)` | < 80% |
| Command latency p50/p95/p99 | Redis SLOWLOG or client instrumentation | p95 > 1ms |
| Memory usage | Redis INFO: `used_memory` / `maxmemory` | > 80% |
| Evicted keys | Redis INFO: `evicted_keys` | > 0 under steady state |
| Connected clients | Redis INFO: `connected_clients` | Near max |
| Commands/sec | Redis INFO: `instantaneous_ops_per_sec` | Baseline comparison |
| Queue depth (if list-based) | LLEN on queue key | Monotonic growth |
| Key count | DBSIZE | Unexpected growth |

### 5.5 Layer 5 — Kafka Producer

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| Internal buffer utilization | Custom metric: `len(channel) / 1000` | > 80% |
| Events published/sec | Prometheus counter | Should track CUD rate |
| Events dropped/sec | Custom metric (channel full / produce error) | > 0 |
| Produce latency p50/p95/p99 | Sarama metrics | p95 > 100ms |
| Produce error rate | Sarama metrics | > 0% |
| Flush time on shutdown | Custom metric (shutdown hook) | > termination grace period |

### 5.6 Layer 6 — Downstream Dependencies

Per dependency (User Manager, Provisioner, Addonman, NPA):

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| Response time p50/p95/p99 | `httpclient` middleware metrics | p95 > dependency timeout |
| Error rate (5xx %) | Same | > 1% |
| Timeout rate | Same | > 0% |
| Retry count | Custom metric | Increasing under load |
| Circuit breaker state | go-zero metrics | Open state triggered |
| Circuit breaker trip count | Custom metric | > 0 |
| Concurrent outbound connections | HTTP transport pool stats | Near max |

### 5.7 Layer 7 — Kubernetes Infrastructure

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| Pod ready count | `kube_deployment_status_replicas_ready` | < desired |
| Pod restart count | `kube_pod_container_status_restarts_total` | > 0 |
| Liveness/readiness probe failures | K8s events | Any failure |
| Node CPU utilization | `node_cpu_seconds_total` | > 80% |
| Node memory available | `node_memory_MemAvailable_bytes` | < 20% free |
| PDB disruptions allowed | `kube_poddisruptionbudget_status_disruptions_allowed` | 0 |
| Ingress 5xx rate | Nginx ingress metrics | > 0 |

### 5.8 Layer 8 — End-to-End Business Metrics

| Parameter | Collection Method | Saturation Signal |
|---|---|---|
| Config propagation latency (CUD → DP applies) | E2E trace or timestamp diff | > 5 minutes |
| Data consistency rate (DB + Redis + Kafka agree) | Grey-box validation script | < 100% |
| Bulk delete completion time | Poll endpoint measurement | > 30s for 250 IDs |
| Priority sequence correctness | Post-test DB query | Any gap or duplicate |
| Event delivery rate | Kafka consumer lag + grey-box | < 99% |
| Stale read rate | Read-after-write verification | > 0% |

---

## 6. Test Design — Scenario Matrix

> **Full scenario data**: All 57 system-level scenarios are maintained in [`system_test_scenarios.csv`](system_test_scenarios.csv) with columns: ID, Category, Scenario, Load Profile, Fault Injection, Expected Outcome / Benchmark, Key Metrics, Priority. The CSV is the source of truth for scenario tracking and execution status.
>
> **Design principle**: Each row = one unique test execution. No duplicates. Functional correctness is covered by Feature QE. Every scenario here runs under production-like load to establish benchmarks, find breaking points, and measure communication pattern resilience between components.

### 6.1 A: Baseline & Capacity Profiling (10 scenarios)

Establish benchmarks — the "known good" system performance numbers and saturation points.

| ID | Scenario | Load Profile | Priority |
|---|---|---|---|
| BL-01 | Golden run baseline — establish all metrics | 50 req/s, 70:30 R:W, 1 hour | P0 |
| BL-02 | Write-heavy profile — DB and Kafka stress | 90% writes, 50 req/s, 30 min | P0 |
| BL-03 | Capacity ceiling — ramp to breaking point | 10→150 req/s linear, 30 min | P0 |
| BL-04 | Step load degradation curve | 25→50→75→100 req/s, 15 min each | P0 |
| BL-05 | Multi-tenant isolation under concurrent load | 50 tenants × 1 req/s, 30 min | P0 |
| BL-06 | Burst after idle — cold pool/cache penalty | 5 min idle → 100 req/s sudden | P1 |
| BL-07 | Bulk delete contention on normal traffic | 50 req/s + 250-ID bulk every 60s | P1 |
| BL-08 | DB connection pool saturation point | Increase until 25-pool exhausted | P0 |
| BL-09 | Leak detection — 4+ hour sustained load | 50 req/s, 4+ hours | P0 |
| BL-10 | Kafka producer throughput baseline | 50 write req/s sustained, 30 min | P1 |

### 6.2 B: Single Fault Under Load (14 scenarios)

Inject ONE fault during sustained load. Measure degradation, blast radius, and recovery. Each validates a specific communication pattern breaking point.

| ID | Scenario | Load | Fault | Priority |
|---|---|---|---|---|
| SF-01 | Redis restart — cache miss storm and rebuild | 50 req/s | Kill Redis → 30s → restart | P0 |
| SF-02 | DB RW node failover — write outage and MTTR | 50 req/s | Kill RW node | P0 |
| SF-03 | DB RO node failure — read degradation | 50 req/s | Kill RO node | P1 |
| SF-04 | Single pod kill — capacity reduction and recovery | 50 req/s | Kill 1 of 4 pods | P0 |
| SF-05 | Kafka broker down — event drops, API isolation | 50 req/s writes | Kill broker → 2 min → restore | P0 |
| SF-06 | User Manager down/slow — write path blocked, CB cycle | 50 req/s writes | UM down → restore; UM slow 5s → CB trip | P0 |
| SF-07 | Provisioner failure — non-fatal, retry, CB behavior | 50 req/s writes | 50% 5xx rate → CB trip | P0 |
| SF-08 | Redis slow — latency propagation to API | 50 req/s | Inject 100ms Redis latency | P0 |
| SF-09 | Kafka slow — async isolation verification | 50 req/s writes | Inject 200ms Kafka latency | P0 |
| SF-10 | Galera split-brain — catastrophic divergence | 50 req/s | Partition Galera cluster | P0 |
| SF-11 | Deadlock storm — same-tenant concurrent writes | 50 req/s + 20 same-tenant | Concentrated writes | P0 |
| SF-12 | Schema migration during live traffic | 50 req/s | ALTER TABLE on active table | P1 |
| SF-13 | Provisioner read-path timeout (/goldenversions) | 50 req/s | Timeout on /goldenversions | P1 |
| SF-14 | Ingress controller restart — re-routing | 50 req/s | Kill ingress pod | P2 |

### 6.3 C: Compound Faults Under Load (5 scenarios)

Multiple simultaneous failures — the most realistic production scenarios. These find cascading failure chains and compound recovery behaviors.

| ID | Scenario | Load | Faults | Priority |
|---|---|---|---|---|
| CF-01 | Redis slow + DB RO down — double read-path degradation | 50 req/s | Redis 100ms + RO node kill | P0 |
| CF-02 | All async paths degraded simultaneously | 50 req/s writes | Kafka + Provisioner + NPA slow | P1 |
| CF-03 | Memory pressure cascade — OOMKill + cache eviction | 50 req/s | OOMKill 1 pod + Redis eviction | P1 |
| CF-04 | Severe capacity loss under burst | 100 req/s | Kill 2 of 4 pods simultaneously | P0 |
| CF-05 | Cascading failure chain — root cause to full degradation | 50 req/s | Inject DB slow (500ms/query) → let cascade | P0 |

### 6.4 D: Data Integrity Under Load (4 scenarios)

Verify zero data corruption during concurrent operations at scale. These are NOT functional correctness tests — they verify the system's concurrency control mechanisms hold under production-like load.

| ID | Scenario | Load | Priority |
|---|---|---|---|
| DI-01 | Concurrent write correctness — priority race, ETag collision, uniqueness check | 50 req/s writes from multiple pods, 30 min | P0 |
| DI-02 | Bulk delete atomicity — 250 IDs + priority gap-closure under writes | 50 req/s + periodic bulk deletes | P0 |
| DI-03 | PBKDF2 CPU impact — burst password operations on other endpoints | 50 req/s with 30% password PATCHes | P1 |
| DI-04 | Graceful shutdown — zero data loss under load | 50 req/s, then SIGTERM one pod | P0 |

### 6.5 E: Deployment & Lifecycle Under Load (7 scenarios)

System behavior during operational changes that happen in production. Each measures whether the change can be performed with zero customer impact.

| ID | Scenario | Load | Lifecycle Event | Priority |
|---|---|---|---|---|
| DL-01 | Rolling deployment — zero-downtime benchmark | 50 req/s | helm upgrade (new image) | P0 |
| DL-02 | Credential/secret rotation — DB + Redis + Kafka | 50 req/s | Rotate each via Vault sequentially | P1 |
| DL-03 | TLS cert expiry — connection failure blast radius | 50 req/s | Let cert expire → renew | P1 |
| DL-04 | Vault token/lease renewal failure — TTL boundary | 50 req/s | Block Vault renewal → observe TTL | P0 |
| DL-05 | All secrets expire simultaneously — cascading failure | 50 req/s | Vault outage during renewal window | P0 |
| DL-06 | Feature flag rollout — dual traffic and rollback | 50 req/s combined | Toggle: dark → on → dual → rollback | P1 |
| DL-07 | Node drain — PDB enforcement and rescheduling | 50 req/s | kubectl drain node with 2 pods | P1 |

### 6.6 F: Boot Sequence & Recovery (5 scenarios)

Cold start, dependency ordering, and disaster recovery. These establish the system's recovery benchmarks.

| ID | Scenario | Condition | Priority |
|---|---|---|---|
| BR-01 | Partial dependency startup — which deps are required? | Start pods with one dependency missing at a time (DB / Redis / Kafka / Vault) | P0 |
| BR-02 | Full cluster cold start — ordered vs unordered | Ordered (DB→Redis→Kafka→Pods) vs all-at-once → compare | P0 |
| BR-03 | All pods restart simultaneously — thundering herd | Kill all 4 pods → measure herd to DB/Redis, time to capacity | P0 |
| BR-04 | Full outage recovery — all down then verify health | All components down → bring up → replay 50 req/s → verify | P0 |
| BR-05 | Pod start with stale Vault secrets | Start pod after rotation completed while pod was down | P1 |

### 6.7 G: Noisy Neighbor & Contention (3 scenarios)

Shared infrastructure competition — realistic in multi-tenant K8s clusters with shared DB/Redis/Kafka.

| ID | Scenario | Load | Contention Source | Priority |
|---|---|---|---|---|
| NN-01 | Node-level compute contention | 50 req/s | CPU/memory-intensive neighbor pods on same node | P1 |
| NN-02 | Shared DB contention | 50 req/s | Heavy queries from other services on same Galera | P0 |
| NN-03 | Shared Redis/Kafka contention | 50 req/s | Other services loading shared Redis and Kafka | P1 |

### 6.8 H: Infrastructure & Observability (4 scenarios)

Platform-level behavior and monitoring validation. Alert fidelity is tested HERE, not as a separate test per fault — during each SF/CF scenario, the corresponding alert is verified as a pass/fail criterion.

| ID | Scenario | Load | What's Validated | Priority |
|---|---|---|---|---|
| IO-01 | Rate limit enforcement — gateway boundary | 60+ req/s sustained (above limit) | 429 behavior; zero backend leak-through; bulk limit (4/s) | P1 |
| IO-02 | Probe gaps — deadlock and partial-dependency detection | 50 req/s + inject deadlock / Redis-down | Known gaps: deadlock passes liveness; Redis-down passes readiness | P1 |
| IO-03 | Alert fidelity — all alerts fire correctly during faults | 50 req/s + inject each fault type | 5xx alert, latency alert, DB alert, Kafka alert all fire within SLO | P0 |
| IO-04 | Grey-box correlation — full data pipeline match | 50 req/s, 30 min | Every 2xx → DB row + Redis key + Kafka event + Prometheus counter match | P0 |

### 6.9 I: E2E System Chain Validation (5 scenarios)

Full system chain under production-like conditions. These are the highest-level integration tests.

| ID | Scenario | Load | What's Validated | Priority |
|---|---|---|---|---|
| E2E-01 | Full CRUD chain + propagation to DP | 50 req/s | Gateway→Service→DB→Redis→Kafka→Orchestrator→DP latency per stage | P0 |
| E2E-02 | Dual notification path — sync + async both fire | 50 req/s writes | Every CUD fires both Provisioner (sync) AND Kafka→Orchestrator (async) | P0 |
| E2E-03 | Multi-tenant isolation under concurrent load | 20 tenants × 5 req/s | Zero cross-tenant leakage; per-tenant latency within 2x of baseline | P0 |
| E2E-04 | Orchestrator consumer resilience — lag, duplicates, ordering | 50 req/s writes | Offset commit, duplicate handling, last-write-wins after restart | P1 |
| E2E-05 | 72-hour soak + periodic chaos | 50 req/s for 72h, fault every 4h | Self-heals each time; no cumulative degradation; no leaks over 72h | P0 |

### 6.10 Scenario Priority Summary

| Priority | Count | Definition |
|---|---|---|
| **P0** | 32 | Must test before GA — system baselines, breaking points, data integrity under load, fault recovery, cascading failures, boot sequence |
| **P1** | 24 | Should test before GA — degradation paths, credential rotation, noisy neighbor, observability, non-critical dependency faults |
| **P2** | 1 | Nice to have — low-impact infra faults (ingress restart) |
| **Total** | **57** | |

---

## 7. Soak & Scale Profile

### 7.1 Objectives

Per Manifesto page 11 (Soak & Scale): *"Running for weeks at scale to find memory leaks, thread exhaustion, and saturation points."*

The soak and scale tests answer:
- **Soak**: Does the system degrade over time? (memory leaks, connection leaks, table growth, cache bloat, GC pressure)
- **Scale**: Where does the system break? (what is the actual capacity ceiling with fixed 4 replicas?)

### 7.2 Load Profiles

#### 7.2.1 Traffic Mix (Production-Realistic)

Based on Design Doc Section 13: "WebUI + API Gateway simultaneously" and typical CRUD ratios:

| Operation | % of Traffic | Rationale |
|---|---|---|
| GET /client/config (list) | 40% | Most common: admin views config page |
| GET /client/config/{id} | 20% | Admin views single config detail |
| POST /client/config | 10% | Config creation |
| PATCH /client/config/{id} | 15% | Config modification (most frequent mutation) |
| DELETE /client/config/{id} | 5% | Config deletion |
| GET /client/versions | 5% | Admin checks available versions |
| GET /client/platforms | 2% | Admin checks platform support |
| POST /client/config/bulkdelete | 1% | Occasional bulk cleanup |
| GET /client/config/bulkstatus | 2% | Polling bulk job |

#### 7.2.2 Tenant Distribution

| Tenant Profile | % of Load | Configs Per Tenant | Description |
|---|---|---|---|
| **Small tenant** | 40% | 1-5 configs | Typical customer |
| **Medium tenant** | 35% | 10-30 configs | Growing customer |
| **Large tenant** | 20% | 50-100 configs | Enterprise customer |
| **Hot tenant** | 5% | 100+ configs | High-activity enterprise |

#### 7.2.3 Special Traffic Patterns

| Pattern | Frequency | Description |
|---|---|---|
| **Prelogin-enabled configs** | 15% of writes | Triggers addonman + /ad/sync flow |
| **Password-containing PATCHes** | 10% of PATCHes | Triggers PBKDF2 hashing (CPU-intensive) |
| **OU/Group target configs** | 60% of creates | Triggers User Manager validation |
| **Concurrent same-tenant writes** | 5% of writes | Two writes to same tenant within 100ms |

### 7.3 Soak Test Profile

| Parameter | Value | Rationale |
|---|---|---|
| **Duration** | **72 hours** (3 days) | Manifesto: "Running for weeks"; 72h minimum to catch daily patterns and slow leaks |
| **Sustained load** | **30 req/s** | 60% of API Gateway limit; comfortable sustained rate |
| **Traffic sources** | WebUI (20 req/s) + API Gateway (10 req/s) | Dual source simulation |
| **Tenant count** | 50 tenants | Representative multi-tenant load |
| **Feature flags** | Production-like (all enabled) | Realistic flag configuration |

#### Soak — What to Monitor Every Hour

| Metric | Expected Behavior | Failure Signal |
|---|---|---|
| **Go heap in-use** | Stable (sawtooth GC pattern, flat trend) | Monotonic increase = memory leak |
| **Goroutine count** | Stable ± 10% | Monotonic increase = goroutine leak |
| **DB connection pool active** | Stable under load | Monotonic increase = connection leak |
| **Redis memory** | Stable (bounded by TTL) | Monotonic increase = keys not expiring |
| **Redis key count** | Stable (bounded by TTL) | Monotonic increase = cache not expiring |
| **`client_config_jobs` row count** | Stable or decreasing (cleanup) | Monotonic increase = cleanup not triggering |
| **Open file descriptors** | Stable | Monotonic increase = FD leak |
| **GC pause p99** | Stable | Increasing = heap growing |
| **p99 latency** | Stable ± 10% | Drift upward = degradation |
| **5xx error rate** | 0% | Any sustained > 0% = regression |
| **Kafka buffer utilization** | < 10% | Increasing = producer backpressure building |
| **Kafka consumer lag** | Stable (near 0) | Increasing = orchestrator falling behind |

#### Soak — Pass Criteria

| Criterion | Threshold |
|---|---|
| Memory (Go heap) trend over 72h | Slope ≤ 0 (no leak) |
| Goroutine count trend over 72h | Slope ≤ 0 (no leak) |
| DB connection pool wait count over 72h | Total = 0 |
| p99 latency drift over 72h | ≤ 10% increase from hour-1 baseline |
| 5xx error rate over 72h | 0% |
| `client_config_jobs` growth | Bounded (cleanup triggers) |
| Redis memory growth | Bounded (TTL-controlled) |
| Pod restarts over 72h | 0 |

### 7.4 Scale Test Profile

#### 7.4.1 Ramp-Up Test (Find the Ceiling)

| Phase | Duration | Load (req/s) | Purpose |
|---|---|---|---|
| **Warm-up** | 10 min | 10 | Establish baseline; warm caches and pools |
| **Phase 1** | 15 min | 25 | 50% of rate limit; measure headroom |
| **Phase 2** | 15 min | 50 | API Gateway rate limit; SLO compliance? |
| **Phase 3** | 15 min | 75 | 1.5x rate limit (some 429s expected) |
| **Phase 4** | 15 min | 100 | 2x target (Design Doc: "ready for 2x growth") |
| **Phase 5** | 15 min | 150 | Find breaking point |
| **Phase 6** | 15 min | 200 | Stress ceiling |
| **Cool-down** | 10 min | 10 | Recovery measurement |

#### 7.4.2 Ramp-Up — Metrics at Each Phase

For each phase, record:

| Metric | Capture Point |
|---|---|
| Throughput achieved (actual req/s) | End of phase |
| Latency p50/p95/p99 per endpoint | End of phase |
| Error rate (5xx) | End of phase |
| CPU utilization per pod | Average over phase |
| Memory per pod | End of phase |
| DB pool active connections | Max during phase |
| DB pool wait count | Total during phase |
| Redis hit ratio | Average over phase |
| Kafka buffer utilization | Max during phase |
| Events dropped | Total during phase |

#### 7.4.3 Ramp-Up — Pass Criteria Per Phase

| Phase | p95 Latency (writes) | 5xx Rate | DB Pool Wait | Kafka Drops |
|---|---|---|---|---|
| Phase 1 (25 req/s) | ≤ 500ms | 0% | 0 | 0 |
| Phase 2 (50 req/s) | ≤ 1s | < 0.1% | 0 | 0 |
| Phase 3 (75 req/s) | ≤ 2s | < 1% | Acceptable | 0 |
| Phase 4 (100 req/s) | ≤ 5s | < 5% | Expected | Acceptable |
| Phase 5+ | Measured | Measured | Measured | Measured |

#### 7.4.4 Burst Test

| Parameter | Value |
|---|---|
| Steady-state load | 30 req/s |
| Burst pattern | 100 req/s for 30 seconds, every 5 minutes |
| Duration | 1 hour |
| Purpose | Simulate real-world burst patterns (e.g., WebUI dashboard refresh) |
| Pass criteria | System returns to baseline within 60s after each burst; no cascading degradation |

#### 7.4.5 Saturation Test

| Parameter | Value |
|---|---|
| Load | Phase at which first SLO breach was observed in ramp-up |
| Duration | 30 minutes sustained at saturation point |
| Purpose | Verify system degrades gracefully (not catastrophically) at capacity |
| Key metric | Error rate stays bounded (< 5%); no data corruption; no pod crashes |

### 7.5 Combined Soak + Chaos Profile

Run after individual soak and scale tests pass:

| Hour | Load | Chaos Injection | Purpose |
|---|---|---|---|
| 0-6 | 30 req/s | None (baseline) | Confirm stability |
| 6-8 | 30 req/s | Redis slow (100ms latency) | Cache degradation under soak |
| 8-10 | 30 req/s | None (recovery) | Verify return to baseline |
| 10-14 | 30 req/s | Kill 1 pod every 2 hours | Rolling restart resilience |
| 14-16 | 30 req/s | Provisioner slow (2s) | Downstream degradation soak |
| 16-18 | 30 req/s | None (recovery) | Verify return to baseline |
| 18-24 | 30 req/s | User Manager intermittent 5xx (10%) | Flaky dependency soak |
| 24-48 | 30 req/s | None | Clean soak after chaos |
| 48-72 | 30 req/s | Kafka broker restart at hour 50 | Event loss and recovery |

---

## 8. Execution Plan

### 8.1 Phased Execution (SOP Section 6.2)

| Phase | Duration | Objective | Prerequisite |
|---|---|---|---|
| **Phase 0: Environment Setup** | 2-3 days | Environment provisioned, data seeded, tooling validated, dashboards verified | Entry criteria (Section 2) met |
| **Phase 1: Golden Run (Baseline)** | 1 day | Capture all benchmarking parameters at 30 req/s with zero faults | Phase 0 complete |
| **Phase 2: Contract Validation** | 2 days | Schema correctness, backward compatibility, API Gateway contract, RBAC enforcement | Phase 1 baseline captured |
| **Phase 3: Single-Fault Injection** | 5-7 days | One failure at a time (Sections 6.5-6.18, all P0 and P1 scenarios); measure impact vs baseline | Phase 2 passed |
| **Phase 4: Data Integrity Drills** | 2-3 days | Concurrent writers, idempotency, priority correctness, event delivery verification | Phase 3 core scenarios passed |
| **Phase 5: Scale Test** | 2 days | Ramp-up (find ceiling), burst, saturation per Section 7.4 | Phase 4 passed |
| **Phase 6: Soak Test** | 3-4 days | 72-hour sustained load per Section 7.3 | Phase 5 passed |
| **Phase 7: Combined Soak + Chaos** | 3-4 days | 72-hour soak with chaos injections per Section 7.5 | Phase 6 passed |
| **Phase 8: Observability Review** | 1-2 days | Alert fidelity, log completeness, trace coverage, runbook validation (Section 12) | All phases complete |
| **Phase 9: Reporting & Sign-off** | 2 days | Compile findings, file defects, regression promotion, sign-off | Phase 8 complete |
| **Total** | **~22-28 days** | | |

### 8.2 Step-by-Step Per Phase

#### Phase 1: Golden Run

1. Deploy service at production-equivalent configuration (4 replicas, production resource limits)
2. Load 30 req/s steady state with production-realistic traffic mix (Section 7.2)
3. Run for 2 hours minimum
4. Capture ALL Layer 1-8 benchmarking parameters (Section 5)
5. Record as baseline for all subsequent comparisons
6. Verify all SLOs (Section 4) are met under baseline conditions
7. If any SLO is breached under baseline, investigate before proceeding

#### Phase 3: Single-Fault Injection

For each P0/P1 scenario:
1. Establish steady-state load (30 req/s)
2. Confirm metrics match golden run baseline (± 5%)
3. Inject single fault
4. Capture metrics during fault
5. Remove fault
6. Capture recovery metrics
7. Record: impact delta from baseline, MTTR, data integrity check
8. Compare against SLO targets (Section 4)

---

## 9. Test Data Plan

### 9.1 Tenant Configuration

| Tenant Type | Count | Configs Per Tenant | Special Data |
|---|---|---|---|
| Small | 20 | 1-5 configs | Standard OU/Group targets |
| Medium | 15 | 10-30 configs | Mixed targets, prelogin enabled |
| Large | 10 | 50-100 configs | All field types, VDI, partner tenant |
| Hot | 3 | 100+ configs | High-concurrency target |
| Legacy | 2 | 10-20 configs | PHP-created: whitespace names, emoji, shadow defaults |

### 9.2 Data Seeding Requirements

| Data Type | Volume | Source |
|---|---|---|
| `client_config` rows | ~2,000 across 50 tenants | Generated with realistic field values |
| `client_config_certs_assoc` rows | ~500 (for prelogin configs) | Generated |
| `client_config_jobs` rows | 50 (mix of completed, processing, stale >7d) | Generated |
| `global_vars` feature flags | All 12+ flags set to production values | From production snapshot |
| `core_data.global_flags` platforms | Production values | From migration 257 |
| OUs/Groups in User Manager | 100+ OUs, 200+ groups | Pre-seeded in UM |
| Legacy PHP data | Whitespace-only names, emoji names, shadow default configs | Manually inserted |

### 9.3 User/API Token Configuration

| Actor | Count | RBAC Role | Traffic Source |
|---|---|---|---|
| Admin users (WebUI) | 20 | Network Admin (rw) | WebUI → API Gateway |
| Read-only users (WebUI) | 5 | Viewer (r) | WebUI → API Gateway |
| API tokens (external) | 10 | Full CRUD | Direct API Gateway |
| API tokens (read-only) | 5 | Read only | Direct API Gateway |

---

## 10. Environment Specification

| Component | Specification | Notes |
|---|---|---|
| **Stack** | Dedicated performance stack (QA01 or STG01) | Isolated from other test traffic |
| **Service replicas** | 4 (production-equivalent) | Fixed; no HPA |
| **Resource limits** | CPU: 500m-2, Memory: 384Mi-768Mi, GOMEMLIMIT=690MiB | Match production |
| **MariaDB** | Galera cluster with RO + RW endpoints | Production-equivalent schema |
| **Redis** | Cluster or standalone matching production | Same maxmemory and eviction policy |
| **Kafka** | 3 partitions, RF=3, 7-day retention | Match production topic config |
| **Orchestrator** | Running and consuming `client_oppy_config` | Full downstream chain |
| **API Gateway** | Configured with production rate limits and RBAC | Same Kong plugins |
| **Observability** | Prometheus scraping, ELK/OpenSearch, OTel tracing enabled | Grafana dashboards accessible |
| **Fault injection** | Chaos Mesh installed; tc/iptables available | Validated in Phase 0 |
| **Feature flags** | `nplan4184_client_config_ngweb_enabled` = ON; all tenant flags production-like | Match production state |

---

## 11. Data Integrity & Consistency

### 11.1 Consistency Model Per Path

| Path | Consistency Model | Verification |
|---|---|---|
| Write (POST/PATCH/DELETE) → immediate GET | **Strong** (same RW node, or RO with wsrep_sync_wait=1) | Read-after-write test; expect written data immediately |
| Write → Kafka event → orchestrator | **Eventual** (async; seconds to minutes) | Grey-box: verify event published + consumed within SLO |
| Write → Redis cache | **Write-through or invalidate** (depends on implementation) | Grey-box: verify cache updated/invalidated on mutation |
| Write → Provisioner notification | **Best-effort** (non-fatal; may be lost) | Grey-box: verify Provisioner received call (or didn't) |

### 11.2 Integrity Checks After Every Test Phase

| Check | Method | Expected Result |
|---|---|---|
| Priority sequence | `SELECT id, priority FROM client_config WHERE tenant_id = X ORDER BY priority` | Contiguous sequence; no gaps; no duplicates; default = -1 |
| JSON blob ↔ DB column sync | Compare `priority` in JSON blob vs `priority` column for all rows | 100% match |
| Password hash preservation | PATCH without password field; verify blob hash unchanged | Hash bytes identical |
| Bulk delete completeness | After bulk delete: verify all target IDs deleted; non-target IDs intact | 100% correct |
| Idempotency correctness | Retry bulk delete with same token; verify no re-execution | Same job status returned |
| Cross-tenant isolation | After multi-tenant load: verify no tenant data leaked to another | 0 cross-tenant rows |

---

## 12. Observability & SLO Validation

### 12.1 Alert Fidelity Testing

| Alert | Trigger Method | Expected Behavior | Verify |
|---|---|---|---|
| >1% 5xx error rate | Kill MariaDB RW node during load | Alert fires within 3 minutes | Grafana + PagerDuty/Slack |
| p95 latency breach | Inject 2s latency to DB | Alert fires within 3 minutes | Same |
| Service health check failure | Kill readiness probe dependency | Alert fires | Same |
| DB connectivity | Partition service from DB | Alert fires | Same |
| Kafka publishing failure | Kill Kafka broker | Alert fires (if implemented) | Same |

### 12.2 Log Verification

| Log Type | What to Verify | Tool |
|---|---|---|
| CUD audit logs | Every mutation has structured log with request ID, tenant, action, user | ELK/OpenSearch query |
| Error logs | 5xx responses logged at Error level with stack trace | ELK filter |
| No sensitive data | Passwords, tokens, PII not present in logs | Regex scan of ELK |
| Correlation ID propagation | Request ID present in all log entries for a single request | Trace ID search |

### 12.3 Trace Verification

| Trace Span | What to Verify |
|---|---|
| Gateway → Service | Parent span from gateway visible |
| Service → DB (RO/RW) | DB query spans with duration |
| Service → Redis | Cache hit/miss tagged |
| Service → Kafka | Produce span with topic and success/failure |
| Service → User Manager | External call span with status |
| Service → Provisioner | External call span with status |

---

## 13. Exit Criteria

| # | Criterion | Owner | Status |
|---|---|---|---|
| EX-1 | All P0 scenarios executed and passed (or findings filed and triaged) | QE | ☐ |
| EX-2 | ≥ 80% of P1 scenarios executed | QE | ☐ |
| EX-3 | All findings documented with standard defect template (Problem Statement, Scenario Reference, Evidence, RCA, Recommended Fix, Severity) | QE | ☐ |
| EX-4 | No open P0 findings without mitigation plan | QE + Dev | ☐ |
| EX-5 | SLOs validated: availability, latency, data integrity, resilience targets met under golden run | QE | ☐ |
| EX-6 | Soak test (72h) passed with no leaks or drift | QE | ☐ |
| EX-7 | Scale test completed: capacity ceiling documented; meets 2x growth target (100 req/s) | QE | ☐ |
| EX-8 | Alerting validated: all alerts fire correctly for simulated failures | QE + SRE | ☐ |
| EX-9 | Regression promotion candidates identified and documented | QE | ☐ |
| EX-10 | Sign-off from QE, service owners, and SRE that risk posture is understood and acceptable | All | ☐ |

---

## 14. Success Metrics

Per Manifesto page 14: "Redefining Success Metrics"

### 14.1 Customer Metrics

| Metric | Target | Measurement |
|---|---|---|
| Escalations prevented | ≥ 3 failure modes discovered pre-release | Count of P0/P1 findings |
| Reproduction success rate | ≥ 90% of scenarios reproducible in test env | Executed / planned scenarios |

### 14.2 Reliability Metrics

| Metric | Target | Measurement |
|---|---|---|
| MTTR (single pod loss) | ≤ 30s | Measured during C14-02 |
| MTTR (dependency recovery) | ≤ 60s | Measured during Phase 3 |
| Detection Time (probe) | ≤ 30s | Measured during C15-01 to C15-04 |
| Detection Time (alert) | ≤ 3 minutes | Measured during C15-01 to C15-04 |
| System Availability under chaos | ≥ 99% | Measured during Phase 7 |

### 14.3 Platform Metrics

| Metric | Target | Measurement |
|---|---|---|
| Recovery success rate | 100% for P0 scenarios | Measured during Phase 3 |
| Scale ceiling | ≥ 100 req/s (2x design target) | Measured during Phase 5 |
| Soak stability (72h) | Zero drift, zero leaks | Measured during Phase 6 |

### 14.4 Quality Metrics

| Metric | Target | Measurement |
|---|---|---|
| Risks identified pre-release | ≥ 5 architectural risks validated | Count from Phase 3-7 |
| Incident patterns converted to automation | 100% of P0 findings → regression | Regression promotion to be tracked separately |
| SLO coverage | All 6 SLO categories validated | Section 4 compliance |

---

## Appendix A: Scenario Priority Quick Reference

| Priority | Count | Execution Phase |
|---|---|---|
| P0 | 37 | Phase 1-4 (baselines in Phase 1; fault injection in Phase 2-4; must complete before Phase 5) |
| P1 | 19 | Phase 3-4 (parallel with P0 where independent) |
| P2 | 1 | Phase 3-4 (time permitting) |

**Priority bumps from IMF analysis** (5 scenarios promoted P1→P0 based on real incident frequency across 626 IMF/EIMFs):
- **SF-07** (Provisioner failure): 17 provisioner/addonman incidents including EIMF-403, EIMF-87, EIMF-265
- **SF-08** (Redis slow/latency propagation): latency is #1 incident class (76 incidents); EIMF-496 recurring
- **SF-09** (Kafka slow/async isolation): event pipeline is #2 pattern (39 incidents)
- **CF-01** (Redis slow + DB RO down): compound latency proven by co-occurring EIMF-496 + EIMF-484
- **DL-04** (Vault token renewal failure): 16 auth/vault incidents including EIMF-57 (4 DCs simultaneously)

## Appendix B: IMF/EIMF Incident Mapping

> **Full mapping data**: [`imf_scenario_mapping.csv`](imf_scenario_mapping.csv) — all 626 IMF/EIMF incidents (Jun 2024 – Jun 2026) analyzed and categorized into 19 failure patterns mapped to our 57 test scenarios.

Comprehensive analysis of **all 626 IMF/EIMF incidents** (285 IMF + 341 EIMF) from the past 24 months. 19 distinct failure patterns were identified, of which **15 are directly relevant** to `client-oppy-configuration`.

### Directly Relevant Patterns (246 incidents across 15 patterns)

| Failure Pattern | Incidents | Example IMFs | Our Scenarios |
|---|---|---|---|
| **Latency / Timeout / 5xx Cascade** | 76 | IMF-1169, EIMF-419, IMF-1141 | SF-03, SF-08, CF-01, CF-05, BL-04 |
| **Kafka / Event Pipeline Failure** | 39 | IMF-1230, EIMF-52, EIMF-489 | SF-05, SF-09, CF-02, E2E-01, E2E-02 |
| **Client Config / Push / Addonman** | 25 | IMF-1361, IMF-1354, IMF-1098, IMF-1122, IMF-1136 | ALL scenarios |
| **CPU / Node Resource Exhaustion** | 21 | EIMF-499, EIMF-430, IMF-1238 | NN-01, NN-02, BL-03, CF-04 |
| **Auth / RBAC / Vault / Credential** | 16 | EIMF-57, EIMF-503, EIMF-109 | DL-04, DL-05, BR-05, IO-01 |
| **Redis / Cache Failure** | 14 | EIMF-496 (5th recurrence), EIMF-71, EIMF-20 | SF-01, SF-08, CF-01, CF-03, BR-03 |
| **DB Connection / Failover** | 14 | EIMF-30, EIMF-484 | SF-02, SF-03, SF-10, BL-08, DI-02 |
| **Provisioner / PyCore** | 9 | EIMF-403, EIMF-87, EIMF-265, EIMF-45 | SF-07, CF-02, E2E-01, E2E-02 |
| **Addonman / Config Distribution** | 8 | IMF-1327, EIMF-326, EIMF-162, EIMF-265 | SF-07, SF-11, CF-02, E2E-01 |
| **Rate Limit / Traffic Spike** | 6 | EIMF-501, EIMF-462 | BL-03, BL-05, IO-01, NN-01 |
| **Probe / Health Check** | 6 | EIMF-423 | IO-02, CF-05, DL-01 |
| **Enrollment / Registration** | 6 | IMF-1072, IMF-1092, IMF-1354 | SF-06, CF-05, E2E-01 |
| **Certificate / PKI / TLS** | 4 | IMF-1103, EIMF-502 | DL-02, DL-04, DL-05 |
| **OOM / CrashLoop** | 3 | EIMF-472, EIMF-425 | CF-03, CF-04, BL-09 |
| **Deployment / Rollback** | 3 | EIMF-502, IMF-1085 | DL-01, DL-03, DL-06 |
| **User Manager / UM** | 1 | EIMF-425 (OOM CrashLoop) | SF-06 |

### Analogous Patterns (69 incidents across 3 patterns)

| Failure Pattern | Incidents | Our Scenarios |
|---|---|---|
| **Ceph / Storage / Disk** | 46 | BR-04, CF-04 |
| **DNS / Network Partition** | 13 | SF-10, BR-01, BR-02, CF-05 |
| **WebUI / Frontend Down** | 10 | CF-05, BR-04 |

### Not Directly Relevant (service-specific)

| Pattern | Incidents |
|---|---|
| DLP-specific | 45 |
| NPA-specific | 40 |
| Clickhouse-specific | 14 |

### Key Findings

**Headline**: **246 of 626 incidents (39%)** fall into failure patterns **directly relevant** to `client-oppy-configuration`. Our 57 test scenarios cover 100% of these patterns.

**Top 5 Takeaways**:

1. **Latency/timeout cascades are the #1 incident class** (76 incidents). Our scenarios SF-03, SF-08, CF-01, CF-05, BL-04 systematically test every latency propagation path.

2. **25 incidents directly involved client config updates or config push** — including IMF-1361 (SJC1 config update failures), IMF-1354 (config updates + enrollments failing), IMF-1098 (SV5 config updates failing), IMF-1122 (cfgpusher directory permission issue across multiple MPs). This is the exact service our plan covers.

3. **Kafka/event pipeline failures are the 2nd most common directly-relevant pattern** (39 incidents). Our service produces to `client_oppy_config` — SF-05, SF-09, and E2E-01/E2E-02 validate event integrity and latency.

4. **EIMF-496** (Redis reconnect failure, 5th recurrence since March 2026) proves that Redis failover + pod reconnect is a **recurring, unresolved production pattern**. Our SF-01 scenario is designed to catch exactly this: does our Go Redis client auto-reconnect after primary failover?

5. **EIMF-425** (um-api-service OOM CrashLoop in ZUR2) directly impacts our write path — UM validation is required for targeted config creates. Our SF-06 scenario simulates exactly this dependency failure.

## Appendix C: References

- [NPLAN-4534 Design Document](https://netskope.atlassian.net/wiki/spaces/CDTBA/pages/6026298043)
- [Test Plan NPLAN-4534 (Feature QE)](https://netskope.atlassian.net/wiki/spaces/CDTBA/pages/7465795610)
- [SOP: NPLAN Backend System Test](https://netskope.atlassian.net/wiki/x/0gC13gE)
- NS Client Reliability Manifesto (v.BOK_FINAL)
- [NPLAN-4534 Feature QE Test Cases (XLSX)](/Users/cbalasaiharika/Downloads/NPLAN-4534%20test%20cases.xlsx)
- [System Test Scenarios (CSV)](system_test_scenarios.csv) — 57 deduplicated scenarios, source of truth for tracking
- [IMF/EIMF → Scenario Mapping (CSV)](imf_scenario_mapping.csv) — all 626 incidents analyzed, 19 failure patterns mapped to scenarios
- `client-oppy` repository: `github.com/netskope/client-oppy`
- API Gateway Contract: `api/openapi/client-oppy-configuration/gateway-contract.yaml`
- Helm Chart: `helm/client-oppy-configuration/`

---

*"System Test QA is not a bug-finding team. We are a Reliability Engineering team. We do not validate features. We validate customer reality."* — NS Client Reliability Manifesto

*"Every system test scenario should trace back to a real incident or a credible near-miss. If it can't, question whether it belongs."* — Appendix B validation
