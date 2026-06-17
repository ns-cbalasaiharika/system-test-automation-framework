# System Test Plan Derivation Methodology

**From Functional Test Plan → System Test Plan**

| Field | Value |
|---|---|
| **Version** | v1.1 |
| **Date** | 2026-06-10 |
| **Audience** | System QE Engineers |
| **Philosophy** | NS Client Reliability Manifesto — "Discover Failures Before Customers Do" |
| **Worked Example** | NPLAN-4534 (REST APIv2 for Client Configuration) |

---

## What This Document Is

A repeatable, step-by-step formula that transforms any NPLAN functional test plan into a system test plan. It codifies the cognitive process a Principal QE Engineer follows — so any QE engineer can apply it consistently.

**Core principle:** Functional testing asks *"Does the API return the right response?"* System testing asks *"What happens to the customer when the system is under load and something breaks?"*

---

## Table of Contents

1. [Prerequisites — What You Need Before Starting](#1-prerequisites)
2. [The Formula — 8 Steps](#2-the-formula)
   - [Step 1: Extract System Topology](#step-1-extract-system-topology)
   - [Step 2: Build Dependency Map](#step-2-build-dependency-map)
   - [Step 3: Extract Resource Boundaries](#step-3-extract-resource-boundaries)
   - [Step 4: Invert Assumptions](#step-4-invert-assumptions)
   - [Step 5: Generate Scenario Candidates](#step-5-generate-scenario-candidates)
   - [Step 6: Validate Against Historical Incidents (IMF/EIMF)](#step-6-validate-against-historical-incidents)
   - [Step 7: Deduplicate, Merge & Prioritize](#step-7-deduplicate-merge--prioritize)
   - [Step 8: Assess Executability](#step-8-assess-executability)
3. [Scenario Generation — The Cross-Product Logic](#3-scenario-generation)
4. [Deduplication Rules — Functional vs System](#4-deduplication-rules)
5. [Prioritization Framework](#5-prioritization-framework)
6. [Executability Tiering](#6-executability-tiering)
7. [Output Artifacts](#7-output-artifacts)
8. [Worked Example — NPLAN-4534](#8-worked-example)
9. [Checklist — Did You Cover Everything?](#9-checklist)

---

## 1. Prerequisites

Before starting, gather these artifacts. If any are missing, the system test plan will have blind spots.

| # | Artifact | Where to Find It | What You Extract |
|---|---|---|---|
| P1 | **NPLAN Functional Test Plan** | Confluence (test plan page) | Endpoints, functional scenarios, existing perf tests |
| P2 | **Design Document** | Confluence (linked from NPLAN) | Architecture, component interactions, data flows, failure handling |
| P3 | **Codebase** | GitHub repo | HTTP clients (timeouts, retries, circuit breakers), DB config (pool sizes), Kafka config (buffer sizes), error handling patterns |
| P4 | **Deployment Config** | Helm chart + K8s manifests | Replica count, CPU/memory limits, probes, PDB, HPA (or lack thereof), sidecar injectors |
| P5 | **NS Client Reliability Manifesto** | Shared drive / team wiki | Failure taxonomy, 6 dimensions of correctness, 8-step cognitive framework |
| P6 | **Existing Functional Test Cases** (optional) | XLSX/Google Sheet linked from test plan | What's already covered — so you don't duplicate |
| P7 | **Historical IMF/EIMF Incidents** | Jira: `project IN (IMF, EIMF) AND created >= "-12m"` | Real production failure patterns, affected components, root causes, customer impact — used to validate scenarios and adjust priorities |

**Time estimate for full formula execution:** 3-5 days for a complex NPLAN (10+ dependencies), 1-2 days for a simple one (3-5 dependencies).

---

## 2. The Formula

### Step 1: Extract System Topology

**Input:** Design document + codebase
**Output:** Component list + communication diagram (text is fine, no fancy tooling needed)

**Process:**
1. Read the design document end-to-end. List every component mentioned.
2. For each component, classify it:
   - **Service Under Test (SUT)** — the service this NPLAN builds/modifies
   - **Data Store** — DB, cache, message broker
   - **Upstream** — what calls the SUT (API gateway, other services, UI)
   - **Downstream** — what the SUT calls (external APIs, notification services)
   - **Infrastructure** — K8s, Vault, Ingress, DNS
3. Draw every arrow: who calls whom, using what protocol.

**NPLAN-4534 Example:**

```
Upstream:
  WebUI → API Gateway → client-oppy-configuration (SUT)

Data Stores:
  SUT → MariaDB (Galera) [RO pool + RW pool]
  SUT → Redis Cluster [cache + queue]
  SUT → Kafka [async event producer]

Downstream (sync, in request path):
  SUT → um-api-svc [OU/Group/VDI validation — FATAL on failure]
  SUT → addonman [secure UPN — non-fatal]

Downstream (async, post-response):
  SUT → provisioner-pycore /client/config [non-fatal]
  SUT → provisioner-pycore /ad/sync [non-fatal]
  SUT → provisioner-pycore /npa/qdispatcher [non-fatal]

Downstream (read-path):
  SUT → provisioner-pycore /client/goldenversions [fatal for GET /versions only]

Infrastructure:
  Vault Agent Injector → SUT [sidecar, all secrets]
  K8s probes → SUT [liveness: /alive, readiness: /ready]
  flight-service → SUT [feature flags]

Downstream consumers (not called by SUT, but consume SUT's events):
  Kafka topic → client-oppy-orchestrator → Provisioner → Endpoints
```

**Key question at this step:** *How many arrows come out of the SUT?* Each arrow is a failure point. NPLAN-4534 has 12 distinct arrows — that's a complex topology.

---

### Step 2: Build Dependency Map

**Input:** Topology from Step 1 + codebase (HTTP client configs, retry policies, circuit breaker settings)
**Output:** Dependency contract table

For **every arrow** in the topology, fill in this row:

| # | From | To | Protocol | Endpoint/Topic | Timeout | Retry | Circuit Breaker | Failure Mode | Criticality |
|---|---|---|---|---|---|---|---|---|---|
| D1 | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Column definitions:**

| Column | What to Write | Where to Find It |
|---|---|---|
| **Timeout** | Connection + request timeout in seconds | HTTP client config in code, env vars |
| **Retry** | Count + strategy (fixed, exponential, jitter) | HTTP client middleware or wrapper code |
| **Circuit Breaker** | Type + window + probe interval | Library config (e.g., go-zero, hystrix, resilience4j) |
| **Failure Mode** | What happens to the API response when this dependency fails | Error handling in service/handler code |
| **Criticality** | Fatal (blocks response) / Non-fatal (swallowed) / Degraded (partial feature loss) | Same error handling analysis |

**Why every column matters — reading a single row:**

From one dependency row, a system QE engineer immediately knows what to test:

> **Example:** `SUT → um-api-svc | timeout: 10s | retry: none | CB: adaptive (10s window, 1s probe) | failure mode: 400/503 to caller | criticality: FATAL`

This single row tells you to test:
- UM timeout → admin gets timeout error on create
- UM 5xx → no retry → admin gets error on first failure
- UM down for 10s → circuit breaker trips → all writes fail even after UM recovers
- UM recovery → 1s probe delay → how long until writes work again?

**NPLAN-4534 Example (selected rows):**

| # | From | To | Protocol | Timeout | Retry | CB | Failure Mode | Criticality |
|---|---|---|---|---|---|---|---|---|
| D3 | SUT | MariaDB RW | MySQL | pool: 25 max, 10 idle | deadlock: 3x, 2s jitter | none | pool exhaust → 503 | FATAL |
| D4 | SUT | Redis | Redis | conn pool | none | none | cache miss → DB fallback | DEGRADED |
| D5 | SUT | Kafka | Kafka Producer | async, 1000 buffer | none | none | buffer full → event dropped silently | NON-FATAL |
| D6 | SUT | provisioner /config | HTTP POST | 10s | 2x | adaptive (10s, 1s probe) | swallowed, API returns 2xx | NON-FATAL |
| D9 | SUT | um-api-svc | HTTP | 10s | none | adaptive (10s, 1s probe) | 400/503 to caller | FATAL |

---

### Step 3: Extract Resource Boundaries

**Input:** Helm chart + K8s manifests + env vars + code constants
**Output:** Resource boundary table

For every resource limit in the deployment, document:

| Resource | Value | Source | What Happens at Limit |
|---|---|---|---|
| DB connection pool (per pod) | 25 max open, 10 idle | code/env var | All queries queue → timeout → 503 |
| Kafka producer buffer | 1000 messages | code constant | Buffer full → events silently dropped |
| Pod replicas | 4 (prod), no HPA | Helm values | Fixed capacity ceiling, no auto-scale |
| CPU | 500m req / 2 limit | Helm values | Throttling at limit → latency spike |
| Memory | 384Mi req / 768Mi limit, GOMEMLIMIT=690MiB | Helm values + env | OOMKill at limit → pod restart |
| Rate limit (Kong) | 50 req/s standard, 4 req/s bulk | API Gateway config | 429 to caller |
| Readiness probe | /ready checks DB ping only | Helm values | Redis/Kafka down → pod still "ready" (gap) |
| PDB | maxUnavailable: 1 | Helm values | At most 1 pod down during voluntary disruption |

**Key question:** *Which of these limits will be hit first under load?* That's your capacity ceiling scenario.

---

### Step 4: Invert Assumptions

**Input:** Functional test plan + design document
**Output:** Assumption register

Functional tests make implicit assumptions. Every assumption is a scenario to invalidate.

**The inversion technique:**
1. Read each functional test case
2. Ask: *"What must be true about the infrastructure for this test to pass?"*
3. Write down that assumption
4. Invert it: *"What if this assumption is false?"*
5. The inversion is your system test scenario

**Pattern:**

| Functional Test Says | Implicit Assumption | Inversion (System Scenario) |
|---|---|---|
| "POST /config returns 201" | DB is available and fast | What if DB is slow (2s/query)? What if RW node fails? |
| "GET /configs returns list" | Redis cache is warm | What if Redis just restarted? What if cache is evicted? |
| "Bulk delete returns 200" | Transaction completes within timeout | What if 250 IDs lock the table for 10s? What if concurrent writes deadlock? |
| "PATCH /config updates priority" | No other admin is editing the same config | What if 20 admins patch the same config simultaneously? |
| "Config change triggers Kafka event" | Kafka broker is reachable | What if broker is down? How many events are lost? |

**NPLAN-4534 Example — 10 assumptions derived:**

| # | Assumption | Risk If Wrong | Test Category |
|---|---|---|---|
| A1 | API Gateway always injects valid RBAC header | RBAC bypass, unauthorized changes | Security (out of scope for system test) |
| A2 | MariaDB handles concurrent writes safely | Data races, lost writes, priority corruption | Data Integrity Under Load |
| A3 | Kafka events produced for every state change | Downstream gets stale data | Single Fault / E2E Chain |
| A4 | Provisioner calls are truly non-fatal | Silent stale config on endpoints | Single Fault |
| A5 | Redis invalidation is complete after writes | Stale config served | Single Fault / Grey-box |
| A6 | Feature flag rollback preserves data | Data loss during transition | Deployment & Lifecycle |
| A7 | max(priority)+1 doesn't race under concurrent creates | Duplicate priorities | Data Integrity Under Load |
| A8 | Bulk delete is atomic (all-or-nothing) | Orphaned records, priority gaps | Data Integrity Under Load |
| A9 | um-api-svc is always available for validation | Config creation blocked | Single Fault |
| A10 | Legacy PHP and new service never write simultaneously | Split-brain during rollout | Deployment & Lifecycle |

---

### Step 5: Generate Scenario Candidates

**Input:** Dependency map (Step 2) + Resource boundaries (Step 3) + Assumptions (Step 4) + Manifesto failure taxonomy
**Output:** Raw scenario candidate list (will be large — 100+)

This is the mechanical cross-product step. Apply the Manifesto's 5 failure categories to every dependency and resource boundary.

#### The Cross-Product Matrix

For **each dependency (D1-Dn)** and **each resource boundary**, generate scenarios across these 9 categories:

| Category | Generator Question | Example |
|---|---|---|
| **Baseline & Capacity** | What is the system's performance under expected load with zero faults? | Golden run, write-heavy, ramp to breaking point |
| **Single Fault Under Load** | What happens when this ONE dependency fails while system is under normal load? | Redis down + 50 req/s, DB RW failover + 50 req/s |
| **Compound Fault Under Load** | What happens when TWO+ dependencies fail simultaneously under load? | Redis slow + DB RO down + 50 req/s |
| **Data Integrity Under Load** | Can concurrent operations corrupt data? | Priority races, ETag conflicts, bulk delete atomicity |
| **Deployment & Lifecycle** | What happens during routine operational events under load? | Rolling deploy, credential rotation, node drain |
| **Boot Sequence & Recovery** | What is the startup behavior and recovery path? | Partial deps, cold start, thundering herd |
| **Noisy Neighbor & Contention** | Do other services on shared infra impact us? | DB contention, Redis eviction from neighbors |
| **Infrastructure & Observability** | Do our monitoring and protection mechanisms work? | Rate limits, probe gaps, alert fidelity |
| **E2E System Chain** | Does the full data propagation chain work under load? | API → DB → Redis → Kafka → Orchestrator → Endpoint |

#### Generation Rules

**Rule 1: Every FATAL dependency gets a Single Fault scenario.**
If the dependency map says "criticality: FATAL", you MUST have a scenario that kills/slows that dependency under load.

**Rule 2: Every NON-FATAL dependency gets an isolation verification scenario.**
Verify that the API response really is unaffected when non-fatal deps fail.

**Rule 3: Every resource limit gets a saturation scenario.**
Find the exact req/s or concurrency at which the limit is hit.

**Rule 4: Every circuit breaker gets a trip/recovery cycle scenario.**
Verify trip time, recovery time, and whether the CB EXTENDS the outage.

**Rule 5: Every pair of related failures gets a compound fault scenario.**
Pick realistic pairs — e.g., cache + DB (both on read path), or all async paths simultaneously.

**Rule 6: Every deployment operation gets a zero-downtime verification.**
Rolling deploy, credential rotation, node drain, feature flag toggle.

**Rule 7: Multi-tenant isolation is always a scenario.**
If the system is multi-tenant, verify zero cross-tenant data leakage and zero performance interference.

**Rule 8: A soak test is always a scenario.**
Sustained load for 4+ hours minimum. Checks for leaks in memory, goroutines, connections, file descriptors.

**Rule 9: Grey-box correlation is always a scenario.**
For every 2xx API response, verify the data exists in ALL downstream layers (DB, cache, event bus, metrics).

At this stage, you'll have 80-150 raw candidates. That's expected. Step 7 reduces them. But first, validate them against real incidents.

---

### Step 6: Validate Against Historical Incidents (IMF/EIMF)

**Input:** Raw scenario candidates from Step 5 + Historical IMF/EIMF incidents (P7)
**Output:** Scenario list with IMF evidence column + gap findings + priority adjustments

This step is what separates a theoretical test plan from one grounded in production reality. The Manifesto says *"Discover Failures Before Customers Do"* — but customers have ALREADY discovered failures. Those failures are in IMF/EIMF. Your job is to ensure your scenarios would have caught them.

**Process:**

**6a. Fetch all IMF/EIMF incidents for the past 12-24 months:**

```
JQL: project IN (IMF, EIMF) AND created >= "-12m" ORDER BY created DESC
```

Use the Jira API with pagination (100 per page) to get all incidents. For NPLAN-4534, this yielded 626 incidents across 7 pages.

**6b. Categorize incidents by failure pattern:**

For each incident, extract the summary + description and classify it into failure patterns. Use keyword matching:

| Failure Pattern | Keywords to search |
|---|---|
| Redis / Cache | redis, cache miss, cache timeout, valkey, memcache |
| DB / Connection | mariadb, mysql, galera, connection pool, deadlock, connection error |
| Kafka / Event Pipeline | kafka, event pipeline, ingestor, consumer lag, event delay |
| OOM / CrashLoop | oomkill, out of memory, crashloopbackoff, memory leak |
| Deployment / Rollback | rollback, deployment fail, version skew |
| Auth / Vault / Credential | vault, credential, token expir, auth fail, 401, 403 |
| CPU / Resource Exhaustion | cpu usage, high cpu, out of resource, throttl, lbaas |
| Config Update / Push | client config, config update, config push, cfgpusher, addonman |
| Provisioner / PyCore | provisioner, pycore |
| Certificate / PKI / TLS | certificate, ssl error, pki, cert rotation |
| Latency / Timeout / 5xx | timeout, latency, slow, 502, 503, 504, 5xx |
| Probe / Health Check | readiness probe, liveness probe, health check, synthetic |
| Rate Limit / Traffic Spike | rate limit, 429, traffic spike, burst |
| DNS / Network | dns resolution, network connect, connectivity lost |
| Noisy Tenant | traffic increase, one tenant, noisy |

**6c. Map each pattern to your scenario candidates:**

For each failure pattern with incidents, ask: *"Which of my scenarios from Step 5 would have caught this?"* If the answer is "none" — that's a gap. Add a new scenario.

**6d. Calculate direct relevance:**

Classify each pattern as:
- **Directly relevant** — same dependencies, same infra, same failure modes as SUT
- **Analogous** — same infra pattern, different service (e.g., Ceph storage affects all services)
- **Not relevant** — service-specific (e.g., DLP scan failures for a config service)

**6e. Adjust priorities based on frequency:**

| IMF Frequency | Priority Adjustment |
|---|---|
| 10+ incidents in same pattern | Scenario must be P0 (proven recurring risk) |
| 5-9 incidents | Scenario should be at least P1 |
| 1-4 incidents | Maintain current priority |
| Pattern matches but zero incidents | Keep scenario — proactive coverage |

**6f. Add "IMF Evidence" to each scenario:**

For every scenario, document which real incidents it maps to. Format: `EIMF-496 (LON3 Redis reconnect failure — 5th recurrence) | EIMF-71 (Redis sentinels unreachable SV5)`. This becomes a column in the output CSV.

**Gap Analysis Template:**

| Question | If "No" → Action |
|---|---|
| Does every IMF failure pattern have at least one scenario? | Add missing scenario |
| Are any high-frequency patterns (10+) covered only by P1 scenarios? | Bump to P0 |
| Are there incidents directly naming the SUT or its dependencies? | These are P0 evidence — strongest justification |
| Are there recurring patterns (same failure 3+ times)? | Dedicated scenario + investigate if existing tests would catch recurrence |
| Are there patterns our topology doesn't cover? | Possible blind spot in Step 1 — revisit topology |

**NPLAN-4534 Example:**

Analyzed 626 IMF/EIMF incidents. Findings:
- **246 incidents (39%)** fell into directly relevant failure patterns
- **25 incidents** specifically mentioned client config updates or addonman — the exact service
- **5 priority bumps** applied: SF-07, SF-08, SF-09, CF-01, DL-04 (all P1→P0 based on incident frequency)
- **Zero gaps** found — all 19 failure patterns already had scenario coverage from Step 5
- Every scenario got an "IMF Evidence" column citing real incidents

---

### Step 7: Deduplicate, Merge & Prioritize

**Input:** IMF-validated scenario candidates from Step 6 (with IMF evidence + adjusted priorities)
**Output:** Final scenario list (target: 40-70 scenarios)

#### Deduplication Rules

| Rule | Description | Example |
|---|---|---|
| **D1: Remove functional tests** | If a scenario tests API correctness without load or fault injection, it belongs in the functional test plan, not here. | "POST /config with invalid name returns 400" → remove |
| **D2: Remove single-endpoint tests** | If a scenario tests one endpoint's behavior without system-level impact, it's functional. | "PATCH /config updates ETag" → remove (unless under concurrent load) |
| **D3: Merge same-fault-different-endpoint** | If two scenarios inject the same fault but measure different endpoints, merge them into one scenario that measures all affected endpoints. | "Redis down → GET /configs slow" + "Redis down → GET /config/:id slow" → merge into "Redis down → measure all read endpoints" |
| **D4: Merge overlapping load profiles** | If two scenarios use the same load profile and fault, merge. | "50 req/s + DB slow → measure latency" + "50 req/s + DB slow → measure pool" → one scenario measuring both |
| **D5: Absorb into soak** | If a scenario is just "run the baseline longer", absorb it into the soak test. | "4hr baseline for leak detection" is part of the soak, not a separate scenario |

#### Prioritization Framework

Assign priority based on three factors:

```
Priority = f(Customer Impact Severity × Likelihood × Blast Radius)
```

| Priority | Criteria | Example |
|---|---|---|
| **P0** | Any of: data loss/corruption, security breach, total service outage, affects ALL tenants, OR unknown behavior (never tested) | Galera split-brain, cross-tenant leakage, cascading failure |
| **P1** | Partial degradation, affects subset of operations, OR known-designed behavior that needs verification | Redis slow (latency increase), single non-fatal dep failure |
| **P2** | Edge case, low likelihood, OR impact is limited to a single non-critical feature | Ingress controller restart, provisioner read-path timeout |

**Tie-breaking rules:**
- If it's never been tested in any environment → P0 (unknown behavior is the highest risk)
- If the failure mode is "silent" (API returns 2xx but data is wrong/lost) → bump up one level
- If the Manifesto calls it out explicitly → bump up one level

---

### Step 8: Assess Executability

**Input:** Final scenario list from Step 7
**Output:** Tiered execution plan

For each scenario, determine:

| Question | Answer Options |
|---|---|
| What tooling is needed? | k6 only / k6 + kubectl / toxiproxy / ChaosMesh / custom script |
| Do we have environment access? | Yes / Need to request / Not possible in test env |
| How long does it take? | < 1 hour / 1-4 hours / 4+ hours / multi-day |
| Can it be automated for regression? | Yes / Partially / No (manual coordination) |

#### Tier Definitions

| Tier | Description | Tooling | Access Required | Typical % |
|---|---|---|---|---|
| **Tier 1** | Immediately executable | k6 + kubectl | Standard K8s namespace access | 30-40% |
| **Tier 2** | Requires chaos tooling setup | + toxiproxy / ChaosMesh / WireMock | + ability to deploy proxy pods | 25-35% |
| **Tier 3** | Requires infra team coordination | + Vault admin / DBA / platform team | + cross-team access | 30-40% |

**Execution order is always Tier 1 → Tier 2 → Tier 3.** Tier 1 produces the baselines that Tier 2 and 3 compare against.

---

## 3. Scenario Generation — The Cross-Product Logic

This section provides the mechanical recipe for Step 5.

### Input Tables

**Table A — Dependencies (from Step 2):**

| D# | Target | Criticality |
|---|---|---|
| D1 | MariaDB RW | FATAL |
| D2 | MariaDB RO | FATAL |
| D3 | Redis | DEGRADED |
| D4 | Kafka | NON-FATAL |
| D5 | um-api-svc | FATAL |
| ... | ... | ... |

**Table B — Fault Types:**

| F# | Fault | Applicable To |
|---|---|---|
| F1 | Target completely down | All |
| F2 | Target slow (2-10x latency) | All |
| F3 | Target returning errors (5xx) | HTTP dependencies |
| F4 | Target intermittent (50% error rate) | All |
| F5 | Target partitioned (split-brain) | Clustered data stores |

**Table C — Load Profiles:**

| L# | Profile | When to Use |
|---|---|---|
| L1 | Steady state (50 req/s, 70:30 R:W) | Default for all fault scenarios |
| L2 | Write-heavy (90% writes) | DB/Kafka stress |
| L3 | Ramp (10→150 req/s) | Capacity ceiling |
| L4 | Burst after idle | Cold start penalty |
| L5 | Multi-tenant concurrent | Isolation verification |

### Cross-Product Formula

```
Scenario Candidates = (D × F × L) + Baselines + Data Integrity + Deployment + Boot + Noisy Neighbor + E2E
```

Where:
- `D × F × L` = each dependency × each applicable fault × the default load profile (L1) → generates single-fault scenarios
- Apply F5 only to clustered stores (MariaDB Galera, Redis Cluster)
- Apply compound faults only to realistic pairs (same-path dependencies)

### Filtering

After cross-product, filter:
1. Remove combinations where the fault doesn't apply (e.g., split-brain on a single-instance service)
2. Remove combinations where the expected outcome is identical to another scenario
3. Merge same-dependency-different-fault into one scenario with multiple phases (e.g., "UM down → observe → UM slow → observe CB → UM restore → observe recovery")

---

## 4. Deduplication Rules — Functional vs System

The hardest judgment call is: *"Is this a functional test or a system test?"*

### Decision Tree

```
Is there sustained load during the test?
├── No → FUNCTIONAL (remove)
└── Yes
    ├── Is there fault injection or infrastructure manipulation?
    │   ├── Yes → SYSTEM (keep)
    │   └── No
    │       ├── Does it measure system-level metrics (pool utilization, cache hit ratio, GC, goroutines)?
    │       │   ├── Yes → SYSTEM (keep — this is a baseline/capacity test)
    │       │   └── No
    │       │       ├── Does it verify cross-component data consistency (grey-box)?
    │       │       │   ├── Yes → SYSTEM (keep)
    │       │       │   └── No → FUNCTIONAL (remove)
    │       │       └──
    │       └──
    └──
```

### Examples

| Scenario | Load? | Fault? | System Metrics? | Grey-box? | Verdict |
|---|---|---|---|---|---|
| "POST /config with invalid name returns 400" | No | No | No | No | **Functional** — remove |
| "POST /config under 50 req/s with Redis down" | Yes | Yes | Yes | No | **System** — keep |
| "CRUD chain verifying DB + Redis + Kafka consistency" | Yes | No | No | Yes | **System** — keep (grey-box) |
| "50 req/s for 4 hours measuring heap growth" | Yes | No | Yes | No | **System** — keep (leak detection) |
| "ETag conflict on PATCH returns 409" | No | No | No | No | **Functional** — remove |
| "20 concurrent PATCHes on same config under load" | Yes | No | Yes | Yes | **System** — keep (data integrity) |

---

## 5. Prioritization Framework

### The Three Dimensions

```
┌─────────────────────────────────────────────────┐
│           Customer Impact Severity               │
│  ┌──────────┬───────────┬──────────────────────┐ │
│  │ Critical │   High    │      Medium          │ │
│  │ Data loss│ Partial   │ Latency increase,    │ │
│  │ Security │ outage,   │ non-critical feature │ │
│  │ Total    │ silent    │ degraded             │ │
│  │ outage   │ failures  │                      │ │
│  └──────────┴───────────┴──────────────────────┘ │
│                     ×                             │
│              Likelihood                           │
│  ┌──────────┬───────────┬──────────────────────┐ │
│  │ Common   │ Periodic  │      Rare            │ │
│  │ Every    │ Monthly/  │ Once a year or less  │ │
│  │ deploy   │ quarterly │                      │ │
│  └──────────┴───────────┴──────────────────────┘ │
│                     ×                             │
│             Blast Radius                          │
│  ┌──────────┬───────────┬──────────────────────┐ │
│  │ All      │ Single    │ Single feature /     │ │
│  │ tenants  │ tenant /  │ endpoint             │ │
│  │          │ all ops   │                      │ │
│  └──────────┴───────────┴──────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Priority Assignment Matrix

| | Critical Impact | High Impact | Medium Impact |
|---|---|---|---|
| **Common + All tenants** | P0 | P0 | P1 |
| **Common + Single tenant** | P0 | P1 | P1 |
| **Periodic + All tenants** | P0 | P1 | P1 |
| **Periodic + Single tenant** | P1 | P1 | P2 |
| **Rare + All tenants** | P0 | P1 | P2 |
| **Rare + Single tenant** | P1 | P2 | P2 |

### Override Rules

These override the matrix regardless of likelihood:

| Condition | Override To |
|---|---|
| Data loss or corruption possible | P0 |
| Cross-tenant leakage possible | P0 |
| Never been tested before (unknown behavior) | P0 |
| Silent failure (API returns 2xx but system state is wrong) | Bump up 1 level |
| Manifesto explicitly calls it out | Bump up 1 level |
| IMF/EIMF shows 10+ incidents matching this failure pattern (Step 6) | P0 |
| IMF/EIMF shows recurring pattern (same failure 3+ times, unresolved) | Bump up 1 level |

---

## 6. Executability Tiering

### Tier 1 — Immediately Executable

**Tooling:** k6 (or Locust) + kubectl + Prometheus/Grafana access

**Scenario types that fall here:**
- All baseline/capacity tests (just load, no faults)
- Pod kill scenarios (kubectl delete pod)
- Concurrency stress tests (k6 high concurrency)
- Data integrity checks (k6 + post-run DB queries)
- Rolling deployment (helm upgrade during k6 run)
- Rate limit enforcement (k6 overload)
- Graceful shutdown (kubectl + k6)

**Estimated setup time:** 0 days (assumes k6 and kubectl already configured)

### Tier 2 — Requires Chaos Tooling

**Tooling:** Tier 1 + toxiproxy (latency/error injection) + ChaosMesh/LitmusChaos (pod/network faults) + WireMock (dependency stubs)

**Scenario types that fall here:**
- Dependency down/slow (toxiproxy between SUT and dependency)
- Circuit breaker trip/recovery cycles
- Compound faults (multiple toxiproxy rules)
- Kafka/Redis restart under load
- Consumer resilience (restart consumer during event stream)

**Estimated setup time:** 1-2 days

**Setup checklist:**
- [ ] toxiproxy deployed as sidecar or separate pod with routes to all dependencies
- [ ] ChaosMesh CRDs installed in test namespace
- [ ] WireMock instances for each external HTTP dependency
- [ ] Verification: each proxy route tested independently before combining

### Tier 3 — Requires Coordination

**Tooling:** Tier 2 + infra team access + DBA access + Vault admin

**Scenario types that fall here:**
- Galera split-brain (network partition between DB nodes)
- Schema migration during live traffic (DBA runs ALTER TABLE)
- Vault token/secret expiry (Vault admin blocks renewal)
- Node drain (platform team or node-level kubectl access)
- Noisy neighbor (deploy stress pods on same node — needs node affinity control)
- Shared infra contention (another service generating load on shared DB/Redis/Kafka)
- Alert fidelity (access to alerting system — PagerDuty/OpsGenie)
- 72-hour soak (environment reservation for 3 days)

**Estimated setup time:** Variable (1-2 weeks including coordination)

**Coordination checklist:**
- [ ] DBA team aligned on DB-level fault injection window
- [ ] Platform team aligned on node-level operations
- [ ] Vault admin available for secret rotation/expiry tests
- [ ] Shared environment reserved for multi-day soak
- [ ] Other service teams informed if noisy-neighbor tests will generate load on shared infra

---

## 7. Output Artifacts

Every system test plan produced by this methodology should contain:

| # | Artifact | Format | Description |
|---|---|---|---|
| O1 | **System Test Plan Document** | Markdown (.md) | Full plan: topology, dependency map, SLOs, scenario matrix, execution plan |
| O2 | **Scenario CSV** | CSV | Machine-readable scenario list: ID, Category, Scenario, Load Profile, Fault Injection, Expected Outcome, Key Metrics, Customer Impact, Priority |
| O3 | **Dependency Map Table** | In O1 | Every arrow with protocol, timeout, retry, CB, failure mode, criticality |
| O4 | **Resource Boundary Table** | In O1 | Every limit with value, source, and behavior at limit |
| O5 | **Assumption Register** | In O1 | Every assumption with risk-if-wrong and validation status |
| O6 | **SLO Table** | In O1 | Every SLO with target, source (documented/derived/proposed), and measurement method |
| O7 | **Executability Assessment** | In O2 (column) or separate table | Tier 1/2/3 per scenario with tooling requirements |
| O8 | **IMF/EIMF Incident Mapping** | In O1 (appendix) + O2 (column) | Failure pattern → scenario mapping, incident counts, coverage gaps, priority adjustment rationale |

### CSV Schema

```
ID,Category,Scenario,Priority,Preconditions,Test Steps,Verification Steps,Expected Outcome,Pass Criteria,Customer Impact,Execution Tier,Tooling,IMF Evidence
```

---

## 8. Worked Example — NPLAN-4534

This section traces the full formula execution for NPLAN-4534 to show the methodology in action.

### Step 1 Result: Topology

- **SUT:** client-oppy-configuration (Go microservice, K8s deployment)
- **Upstream:** WebUI → Kong API Gateway → SUT
- **Data stores:** MariaDB Galera (RO+RW pools), Redis Cluster, Kafka
- **Fatal downstream:** um-api-svc (write-path validation)
- **Non-fatal downstream:** provisioner-pycore (3 endpoints), addonman, NPA QDispatcher
- **Read-path downstream:** provisioner-pycore /client/goldenversions
- **Infrastructure:** Vault Agent (secrets), K8s probes, flight-service (feature flags)
- **Event consumers:** client-oppy-orchestrator (Kafka consumer)

**Arrow count:** 12 distinct communication paths → complex topology

### Step 2 Result: Dependency Map

12 dependencies documented with full contract details. Key findings:
- um-api-svc is FATAL with NO retry and HAS circuit breaker → CB can EXTEND outage
- Kafka is NON-FATAL with 1000-message buffer → silent event loss under burst
- Readiness probe checks DB only → Redis/Kafka failures create zombie pods

### Step 3 Result: Resource Boundaries

8 resource limits documented. Key findings:
- 25 DB connections per pod × 4 pods = 100 total connections to Galera → saturation point is testable
- No HPA → fixed 4-pod capacity → hard ceiling exists
- GOMEMLIMIT=690MiB with 768Mi K8s limit → narrow OOMKill margin

### Step 4 Result: Assumptions

10 assumptions identified. Most dangerous:
- A7 (priority race) — functional tests don't test concurrent creates
- A3 (Kafka events for every change) — buffer-full silently drops events
- A4 (provisioner non-fatal) — exceptions swallowed, stale config on 100K+ endpoints

### Step 5 Result: Raw Candidates

Cross-product generated ~120 raw scenario candidates.

### Step 6 Result: IMF/EIMF Validation

- **626 incidents** analyzed (IMF + EIMF, June 2024 — June 2026)
- **19 failure patterns** identified via keyword classification
- **246 incidents (39%)** fell into directly relevant patterns
- **25 incidents** specifically referenced client config or addonman
- **5 priority bumps** applied: SF-07 (Pod Kill), SF-08 (Redis Latency), SF-09 (Kafka Broker Degraded), CF-01 (Compound Read Path), DL-04 (Credential Rotation) — all P1→P0
- **Zero coverage gaps** — all failure patterns already had scenario coverage from Step 5
- **IMF Evidence column** added to all 57 scenarios in the CSV
- Top 3 patterns by frequency: Latency/Timeout/5xx (76), Redis/Cache (14), OOM/CrashLoop (12)

### Step 7 Result: Deduplicated & Prioritized

After deduplication: **57 scenarios** (37 P0, 19 P1, 1 P2)

Organized into 9 categories:
- Baseline & Capacity (10)
- Single Fault Under Load (14)
- Compound Fault Under Load (5)
- Data Integrity Under Load (4)
- Deployment & Lifecycle Under Load (7)
- Boot Sequence & Recovery (5)
- Noisy Neighbor & Contention (3)
- Infrastructure & Observability (4)
- E2E System Chain (5)

### Step 8 Result: Executability

- Tier 1 (immediately executable): 20 scenarios (35%)
- Tier 2 (after chaos tooling setup): 16 scenarios (28%)
- Tier 3 (needs infra coordination): 21 scenarios (37%)

### Execution Timeline

| Week | Phase | Scenarios | Deliverable |
|---|---|---|---|
| 1 | Baseline + Tier 1 | BL-01 through BL-10, DI-01 through DI-04, DL-01 | Baseline benchmarks, data integrity results |
| 2 | Chaos tooling setup + Tier 2 start | SF-01 through SF-09, SF-11, SF-13 | Single fault results |
| 3 | Tier 2 complete + Tier 3 start | CF-01 through CF-05, E2E-01 through E2E-04 | Compound fault + E2E results |
| 4 | Tier 3 | BR-01 through BR-05, DL-02 through DL-07, NN-01 through NN-03 | Infrastructure + lifecycle results |
| 5 | Soak + Report | E2E-05 (72hr soak), IO-01 through IO-04 | Soak report + final test report |

---

## 9. Checklist — Did You Cover Everything?

Use this checklist after completing Steps 1-8 to verify completeness. Every "No" is a gap.

### Topology & Dependencies
- [ ] Every component in the design doc appears in the topology
- [ ] Every HTTP client in the codebase has a dependency map row
- [ ] Every data store (DB, cache, message broker) has a dependency map row
- [ ] Every infrastructure component (Vault, probes, ingress) is documented
- [ ] Every downstream consumer of the SUT's events is identified

### Resource Boundaries
- [ ] DB connection pool size documented (from code, not default)
- [ ] Memory limit + GOMEMLIMIT documented (from Helm)
- [ ] CPU limit documented (from Helm)
- [ ] Replica count and HPA policy documented
- [ ] Probe endpoints and what they check documented
- [ ] PDB policy documented
- [ ] Rate limits documented (from API gateway config)
- [ ] Kafka buffer/queue sizes documented (from code)

### Scenario Coverage (per Manifesto)
- [ ] At least 1 baseline/golden-run scenario
- [ ] At least 1 capacity-ceiling/ramp scenario
- [ ] At least 1 soak/leak-detection scenario (4+ hours)
- [ ] Every FATAL dependency has a single-fault scenario
- [ ] Every NON-FATAL dependency has an isolation verification scenario
- [ ] Every circuit breaker has a trip/recovery cycle scenario
- [ ] At least 1 compound-fault scenario (2+ simultaneous failures)
- [ ] At least 1 cascading-failure scenario (fault → cascade → full degradation)
- [ ] Data integrity under concurrent writes tested
- [ ] Multi-tenant isolation tested (zero cross-tenant leakage)
- [ ] Rolling deployment zero-downtime tested
- [ ] Graceful shutdown tested (SIGTERM under load)
- [ ] Boot/startup sequence tested
- [ ] Grey-box correlation tested (API→DB→Cache→Events→Metrics)
- [ ] At least 1 noisy-neighbor scenario (shared infra contention)
- [ ] Alert fidelity tested (alerts fire during known faults)

### Historical Incident Validation (Step 6)
- [ ] All IMF/EIMF incidents from past 12-24 months fetched (paginated, not partial)
- [ ] Incidents categorized into failure patterns (target: 10-20 patterns)
- [ ] Every failure pattern mapped to at least one scenario
- [ ] High-frequency patterns (10+ incidents) have P0 scenarios
- [ ] Incidents directly naming the SUT or its dependencies are cited as P0 evidence
- [ ] Every scenario has an "IMF Evidence" column (even if "No direct IMF match — proactive coverage")
- [ ] Priority bumps from IMF frequency applied (documented with rationale)
- [ ] Gaps identified (patterns with zero scenario coverage) have been addressed with new scenarios

### Prioritization
- [ ] Every P0 scenario has customer impact documented
- [ ] No scenario is P0 just because "it seems important" — justify via impact × likelihood × blast radius
- [ ] Silent failure scenarios (API 2xx but wrong state) are at least P1

### Executability
- [ ] Every scenario has a tier assignment (1/2/3)
- [ ] Tier 3 scenarios have coordination owners identified
- [ ] Execution order starts with Tier 1 (baselines first)
- [ ] Soak test environment reservation is planned

---

## Quick Reference — The Formula in One Page

```
NPLAN Functional Test Plan
         │
         ▼
┌─────────────────────────┐
│  Step 1: Extract        │ Design doc + codebase → component list + arrows
│  System Topology        │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 2: Build          │ For each arrow: protocol, timeout, retry, CB,
│  Dependency Map         │ failure mode, criticality
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 3: Extract        │ Helm + env vars + code constants →
│  Resource Boundaries    │ pool sizes, limits, replica counts
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 4: Invert         │ For each functional test: "What must be true?"
│  Assumptions            │ → Invert → System scenario
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 5: Generate       │ (Dependencies × Faults × Load) + Baselines
│  Scenario Candidates    │ + Data Integrity + Deploy + Boot + E2E
│  (cross-product)        │ → 80-150 raw candidates
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 6: Validate       │ Fetch IMF/EIMF incidents (12-24 months)
│  Against Historical     │ → Categorize by failure pattern
│  Incidents (IMF/EIMF)   │ → Map to scenarios → Fill gaps → Adjust
│                         │   priorities → Add "IMF Evidence" column
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 7: Deduplicate    │ Remove functional, merge overlapping,
│  Merge & Prioritize     │ assign P0/P1/P2 by impact × likelihood × blast
│                         │ + IMF frequency adjustments
│                         │ → 40-70 final scenarios
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│  Step 8: Assess         │ Tier 1 (k6+kubectl) → Tier 2 (chaos tooling)
│  Executability          │ → Tier 3 (infra coordination)
└────────────┬────────────┘
             ▼
    System Test Plan
    + Scenario CSV (with IMF Evidence)
    + Execution Timeline
```
