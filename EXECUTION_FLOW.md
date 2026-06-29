# Main Test Loop Execution Flow

## Overview
The main test loop in the TypeScript scenario file demonstrates how k6 repeatedly executes operations based on weighted traffic distribution. Here's the complete flow:

---

## 1. K6 Execution Model

K6 runs the **default exported function** repeatedly for 35 seconds (smoke profile):

```typescript
// scenarios/client-oppy/baseline/bl01-golden-baseline.ts

export default function (): void {
  runOperation(handlers, config);
}
```

**K6 Control**: K6 calls this function multiple times in the 35-second window (as fast as possible)

---

## 2. `runOperation()` - The Core Loop Logic

**File**: `lib/scenario-runner.ts:15-27`

```typescript
export function runOperation(
  operations: OperationHandlers,
  config: RuntimeConfig,
  options: RunOperationOptions = {}
): void {
  // 📍 STEP 1: RANDOMLY SELECT AN OPERATION
  const operation = weightedSelect(config.trafficMix);
  
  // 📍 STEP 2: GET THE HANDLER FUNCTION FOR THAT OPERATION
  const handler = operations[operation];

  // 📍 STEP 3: EXECUTE THE HANDLER (makes HTTP request)
  if (handler) {
    handler();
  } else {
    console.warn(`Unknown operation: ${operation}`);
  }

  // 📍 STEP 4: APPLY THINK TIME (pause between requests)
  if (!options.skipThinkTime) {
    thinkTime(config);
  }
}
```

---

## 3. STEP 1: Weighted Random Selection

**Function**: `weightedSelect()` in `lib/utils.ts:40-52`

```typescript
/**
 * Select an operation based on weighted traffic mix percentages.
 * trafficMix: { "listConfigs": 25, "getConfigById": 25, ... }
 * Returns the key of the selected operation.
 */
export function weightedSelect(trafficMix: TrafficMix): string {
  const roll = Math.random() * 100;  // Generate random 0-100
  let cumulative = 0;

  for (const [operation, weight] of Object.entries(trafficMix)) {
    cumulative += weight;
    if (roll < cumulative) {
      return operation;  // ✅ Selected operation
    }
  }

  const ops = Object.keys(trafficMix);
  return ops[ops.length - 1];
}
```

**Traffic Mix (from config)**:
```yaml
trafficMix:
  listConfigs: 25          # 0-25%
  getConfigById: 25        # 25-50%
  getVersions: 10          # 50-60%
  getPlatforms: 10         # 60-70%
  createConfig: 15         # 70-85%
  updateConfig: 10         # 85-95%
  deleteConfig: 5          # 95-100%
```

**Example**: If `Math.random() * 100 = 42.5`
- Cumulative: 0 → 25 (25 < 42.5? NO)
- Cumulative: 25 → 50 (50 < 42.5? YES) ✅ **Returns "getConfigById"**

---

## 4. STEP 2: Operation Handlers Factory

**Function**: `createClientOppyHandlers()` in `lib/scenario-runner.ts:50-92`

Creates a map of handler functions:

```typescript
export function createClientOppyHandlers(ops: ClientOppyOperations): OperationHandlers {
  const handlers: OperationHandlers = {};

  if (list) {
    handlers.listConfigs = () => list.list();  // ← Handler function
  }

  if (crud) {
    handlers.getConfigById = () => {
      const id = crud.getRandomId();
      if (id) {
        crud.getById(id);  // ← Makes HTTP GET /client/config/{id}
      } else {
        crud.getById(1);
      }
    };

    handlers.createConfig = () => crud.create();     // ← POST request

    handlers.updateConfig = () => {
      const id = crud.getRandomId();
      if (id) crud.update(id);  // ← PATCH request
    };

    handlers.deleteConfig = () => {
      const deletableIds = crud.getDeletableIds();
      if (deletableIds.length > 0) {
        const id = deletableIds[randomInt(0, deletableIds.length - 1)];
        crud.delete(id);  // ← DELETE request
      }
    };
  }

  if (versions) {
    handlers.getVersions = () => versions.getVersions();  // ← GET request
  }

  if (platforms) {
    handlers.getPlatforms = () => platforms.getPlatforms();  // ← GET request
  }

  return handlers;  // Map of { [operationName]: function }
}
```

**Result**: Mapping like this:
```javascript
{
  listConfigs: [Function],
  getConfigById: [Function],
  createConfig: [Function],
  updateConfig: [Function],
  deleteConfig: [Function],
  getVersions: [Function],
  getPlatforms: [Function]
}
```

---

## 5. STEP 3: Execute the Handler (HTTP Request + Measurement)

### Example: `getConfigById` Handler

When selected, it executes:
```typescript
handlers.getConfigById = () => {
  const id = crud.getRandomId();
  if (id) {
    crud.getById(id);  // ← Calls ConfigCrudOperation.getById()
  } else {
    crud.getById(1);
  }
};
```

### Inside `ConfigCrudOperation.getById()` - File: `operations/client-oppy/config-crud.ts:33-42`

```typescript
/**
 * Get a configuration by ID.
 */
getById(id: string | number): OperationResult<ClientConfig> {
  // 🔴 MAKES HTTP REQUEST
  const { response, ok } = this.client.get(`/client/config/${id}`, {
    tags: { endpoint: 'GET /client/config/{id}' },
  });
  
  // 📊 MEASURES LATENCY
  getByIdLatency.add(response.timings.duration);
  
  const data = ok ? parseBody<{ data: ClientConfig }>(response)?.data : undefined;
  return { response, ok, data };
}
```

**What happens**:
1. Makes HTTP GET request to `/client/config/{id}`
2. Receives response with timing info
3. **Adds duration to k6 Trend metric** `getByIdLatency`
4. Returns result

### Metrics Collection - File: `lib/metrics.ts:1-20`

```typescript
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// K6 will collect these and compare against thresholds
export const listLatency = new Trend('latency_get_configs', true);           // Trend = percentiles
export const getByIdLatency = new Trend('latency_get_config_by_id', true);
export const createLatency = new Trend('latency_post_config', true);
export const updateLatency = new Trend('latency_patch_config', true);
export const deleteLatency = new Trend('latency_delete_config', true);

export const configsCreated = new Counter('configs_created');                // Counter = total count
export const configsDeleted = new Counter('configs_deleted');
export const configsUpdated = new Counter('configs_updated');

export const errorRate = new Rate('errors');                                 // Rate = percentage
```

**K6 Trend metric**: Records all latency values and computes p50, p95, p99
- Used for SLO validation (from config):
```yaml
slos:
  latency_get_config_by_id:
    p50: 50       # If p50 > 50ms → FAIL
    p95: 200      # If p95 > 200ms → FAIL
    p99: 500      # If p99 > 500ms → FAIL
```

---

## 6. STEP 4: Think Time Pause

**Function**: `thinkTime()` in `lib/utils.ts:24-29`

```typescript
/**
 * Apply think time between operations based on config.
 */
export function thinkTime(config: RuntimeConfig): void {
  const minMs = config.thinkTime.minMs || 100;  // Default: 100ms
  const maxMs = config.thinkTime.maxMs || 300;  // Default: 300ms
  const ms = randomInt(minMs, maxMs);           // Random between 100-300
  sleep(ms / 1000);                             // Sleep in seconds (k6 API)
}
```

**From config** (`config/environments/minikube-cluster.yaml`):
```yaml
defaults:
  thinkTime:
    minMs: 100
    maxMs: 300
```

**Pause duration**: 100-300ms random pause between each operation

---

## 7. Complete Execution Timeline (35 seconds - Smoke Profile)

```
Time    Action                                    K6 VUs        Metrics Collected
────────────────────────────────────────────────────────────────────────────────
0s      ┌─────────────────────────────────┐
        │ Setup Phase                     │ VUs: 0→1        seedConfigs() = 10 records
5s      └─────────────────────────────────┘
        ┌─────────────────────────────────────────┐
        │ Main Test Loop (Ramp UP)               │ VUs: 1→1
        │                                        │
10s     │ Iteration 1: SELECT(23) → getConfigById│ 1 VU        latency_get_config_by_id: 45ms
        │   - HTTP GET /client/config/{id}      │            
        │   - RECORD: latency = 45ms            │
        │   - SLEEP: 150ms                      │
        │                                        │
        │ Iteration 2: SELECT(72) → createConfig│ 1 VU        latency_post_config: 180ms
        │   - HTTP POST /client/config          │
        │   - RECORD: latency = 180ms           │
        │   - RECORD: configs_created++         │
        │   - SLEEP: 200ms                      │
        │                                        │
        │ Iteration 3: SELECT(44) → listConfigs │ 1 VU        latency_get_configs: 95ms
        │   - HTTP GET /client/config           │
        │   - RECORD: latency = 95ms            │
        │   - SLEEP: 120ms                      │
        │                                        │
        │ Iteration 4: SELECT(7) → getVersions  │ 1 VU        latency_get_versions: 78ms
        │   - HTTP GET /client/versions         │
        │   - RECORD: latency = 78ms            │
        │   - SLEEP: 180ms                      │
        │                                        │
        │ ... (many more iterations) ...         │
        │                                        │
30s     │ (Main loop continues until 30s)       │ 1 VU
        │                                        │
        └─────────────────────────────────────────┘
        ┌────────────────┐
        │ Ramp DOWN      │                       VUs: 1→0
35s     │ Teardown Phase │                       cleanupConfigs() = deleted
        └────────────────┘
        
        ┌──────────────────────────────────────────┐
        │ RESULT SUMMARY                           │
        │ latency_get_config_by_id:                │
        │   p50: 52ms ✓ (SLO: 50ms) ✗ EXCEEDED   │
        │   p95: 198ms ✓ (SLO: 200ms) ✓ PASS      │
        │   p99: 485ms ✓ (SLO: 500ms) ✓ PASS      │
        │                                          │
        │ errors: 0 ✓                              │
        │                                          │
        │ Overall: FAIL (p50 exceeded)            │
        └──────────────────────────────────────────┘
```

---

## 8. Complete Call Stack

```
K6 Runtime (Executes default function repeatedly for 35s)
  ↓
  default() [scenarios/client-oppy/baseline/bl01-golden-baseline.ts:57]
    ↓
    runOperation(handlers, config)  [lib/scenario-runner.ts:15]
      ↓
      ① weightedSelect(config.trafficMix)  [lib/utils.ts:40]
         → Returns: "getConfigById"
      ↓
      ② handlers["getConfigById"]()  [lib/scenario-runner.ts:20-22]
         → Executes the handler function
           ↓
           crud.getById(randomId)  [operations/client-oppy/config-crud.ts:33]
             ↓
             this.client.get("/client/config/{id}")
               ↓
               HTTP GET request to K8s service
               ↓
               Response with timing: { duration: 45ms, ... }
             ↓
             getByIdLatency.add(45)  [lib/metrics.ts:12]
               → K6 collects this value for p50/p95/p99 calculation
             ↓
             return { response, ok, data }
      ↓
      ③ thinkTime(config)  [lib/utils.ts:24]
         → randomInt(100, 300) = 150ms
         → sleep(0.150)  [K6 sleep function]
      
      [Wait 150ms]
      
      [Loop back to ① for next iteration]
```

---

## 9. Traffic Mix Distribution Example

**Over 35 seconds, if ~40 iterations occur**:

```
Operation               Weight  Expected Count   Actual
─────────────────────────────────────────────────────────
listConfigs             25%     ~10 calls       10  → 10 latency measurements
getConfigById           25%     ~10 calls       10  → 10 latency measurements
getVersions             10%     ~4 calls        4   → 4 latency measurements
getPlatforms            10%     ~4 calls        5   → 5 latency measurements
createConfig            15%     ~6 calls        5   → 5 latency measurements + 5 configs_created
updateConfig            10%     ~4 calls        4   → 4 latency measurements
deleteConfig             5%     ~2 calls        2   → 2 latency measurements
─────────────────────────────────────────────────────────
TOTAL                  100%     ~40 iterations  40

K6 calculates:
  latency_get_configs: p50=98ms, p95=510ms, p99=899ms
    vs SLO: p50≤100✓, p95≤500✗FAIL, p99≤1000✓

  latency_get_config_by_id: p50=48ms, p95=198ms, p99=450ms
    vs SLO: p50≤50✓, p95≤200✓, p99≤500✓ → PASS

  configs_created: 5 (counter)
  configs_deleted: 2 (counter)
  
Result: FAIL (latency_get_configs p95 exceeded SLO)
```

---

## 10. Key Takeaways

| Component | Purpose | File |
|-----------|---------|------|
| **weightedSelect()** | Random operation selection based on traffic mix | `lib/utils.ts:40` |
| **Handlers Map** | Maps operation names to executable functions | `lib/scenario-runner.ts:50` |
| **CRUD/List Operations** | Execute HTTP requests and measure latency | `operations/client-oppy/*.ts` |
| **Trend Metrics** | Collect latency values & compute p50/p95/p99 | `lib/metrics.ts` |
| **thinkTime()** | Pause 100-300ms between operations | `lib/utils.ts:24` |
| **Thresholds** | Define pass/fail criteria | `config/scenarios/client-oppy/bl01-golden-baseline.yaml` |

---

## 11. Full BL-01 Scenario Source Code

**File**: `scenarios/client-oppy/baseline/bl01-golden-baseline.ts`

```typescript
import { loadConfig, buildScenarioOptions } from '../../../lib/config-loader';
import { buildThresholds } from '../../../lib/thresholds';
import { runOperation, createClientOppyHandlers } from '../../../lib/scenario-runner';
import { createResultsPipeline } from '../../../lib/results-pipeline';
import { ConfigCrudOperation } from '../../../operations/client-oppy/config-crud';
import { ConfigListOperation } from '../../../operations/client-oppy/config-list';
import { ConfigVersionsOperation } from '../../../operations/client-oppy/config-versions';
import { ConfigPlatformsOperation } from '../../../operations/client-oppy/config-platforms';
import { seedConfigs, cleanupConfigs, waitForReady } from '../../../helpers/setup-teardown';
import type { K6Options } from '../../../types/config';

// 1️⃣ LOAD SCENARIO CONFIG
const config = loadConfig('bl01-golden-baseline');
// Result: {
//   scenario: { name: 'BL-01', id: 'bl01', ...},
//   trafficMix: { listConfigs: 25, getConfigById: 25, ... },
//   slos: { latency_get_configs: { p50: 100, p95: 500, p99: 1000 }, ... },
//   thinkTime: { minMs: 100, maxMs: 300 }
// }

// 2️⃣ BUILD K6 OPTIONS
export const options: K6Options = {
  scenarios: buildScenarioOptions(config),
  // Result: {
  //   ramping-vus: {
  //     executor: 'ramping-vus',
  //     startVUs: 0,
  //     stages: [
  //       { duration: '10s', target: 1 },  // Ramp UP
  //       { duration: '20s', target: 1 },  // Sustain
  //       { duration: '5s', target: 0 }    // Ramp DOWN
  //     ]
  //   }
  // }
  thresholds: buildThresholds(config),
  // Result: {
  //   'latency_get_configs': ['p95<=500', 'p99<=1000', ...],
  //   'latency_get_config_by_id': ['p50<=50', 'p95<=200', ...],
  //   'errors': ['rate<=0.001'],
  //   ...
  // }
  setupTimeout: '60s',
  teardownTimeout: '60s',
};

// 3️⃣ CREATE OPERATION INSTANCES
const crud = new ConfigCrudOperation(config);
const list = new ConfigListOperation(config);
const versions = new ConfigVersionsOperation(config);
const platforms = new ConfigPlatformsOperation(config);

// 4️⃣ CREATE HANDLERS
const handlers = createClientOppyHandlers({
  crud,
  list,
  versions,
  platforms,
});

// 5️⃣ SETUP PHASE (runs once before test)
export function setup(): SetupData {
  console.log(`[${config.scenario.name}] Setup: Checking service readiness...`);
  const ready = waitForReady(config.baseUrl, 30);
  if (!ready) {
    console.warn(`[${config.scenario.name}] Service not ready, proceeding anyway...`);
  }
  
  console.log(`[${config.scenario.name}] Setup: Seeding test data...`);
  const seededIds = seedConfigs(config.baseUrl, config.headers, 10);
  console.log(`[${config.scenario.name}] Seeded ${seededIds.length} configs`);

  return { seededIds };
}

// 6️⃣ MAIN TEST LOOP (executed repeatedly for 35s)
export default function (): void {
  runOperation(handlers, config);
  // This is called ~40 times in the 35-second window
  // Each call:
  //   - Selects random operation (weighted)
  //   - Executes HTTP request
  //   - Measures latency
  //   - Sleeps 100-300ms
}

// 7️⃣ TEARDOWN PHASE (runs once after test)
export function teardown(_data: SetupData): void {
  console.log(`[${config.scenario.name}] Teardown: Cleaning up test data...`);
  const deleted = cleanupConfigs(config.baseUrl, config.headers);
  console.log(`[${config.scenario.name}] Cleaned up ${deleted} configs`);
}

// 8️⃣ RESULTS PIPELINE (post-processing)
export const handleSummary = createResultsPipeline(config);
```

---

## Summary

**The main test loop works by:**

1. **Randomizing operations** every ~500-800ms (request + think time)
2. **Selecting weighted operations** to achieve 70:30 read:write mix
3. **Executing HTTP requests** while measuring latency
4. **Collecting metrics** (trends, counters, rates)
5. **Validating against SLOs** using k6 thresholds
6. **Failing the test** if any threshold is exceeded

This repeats for 35 seconds in the smoke profile, generating enough data to validate performance.
