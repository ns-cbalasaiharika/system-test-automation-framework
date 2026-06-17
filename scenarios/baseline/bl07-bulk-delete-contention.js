import { loadConfig } from "../../lib/config-loader.js";
import { buildThresholds } from "../../lib/thresholds.js";
import {
  runOperation,
  createClientOppyHandlers,
  createHandleSummary,
} from "../../lib/scenario-runner.js";
import { ConfigCrudOperation } from "../../operations/client-oppy/config-crud.js";
import { ConfigListOperation } from "../../operations/client-oppy/config-list.js";
import { ConfigVersionsOperation } from "../../operations/client-oppy/config-versions.js";
import { ConfigPlatformsOperation } from "../../operations/client-oppy/config-platforms.js";
import { BulkDeleteOperation } from "../../operations/client-oppy/bulk-delete.js";
import { seedConfigs, cleanupConfigs, waitForReady } from "../../helpers/setup-teardown.js";

const SCENARIO_ID = "bl07";
const SCENARIO_NAME = "BL-07";

const config = loadConfig("bl07-bulk-delete-contention");
const bulkConfig = config.scenario.bulkDelete || { batchSize: 10, intervalSeconds: 30 };

export const options = {
  scenarios: {
    background_traffic: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "30m",
      preAllocatedVUs: 100,
      exec: "backgroundTraffic",
    },
    bulk_deletes: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: `${bulkConfig.intervalSeconds}s`,
      duration: "30m",
      preAllocatedVUs: 5,
      exec: "bulkDeleteBatch",
    },
  },
  thresholds: buildThresholds(config.slos, config.thresholdMultiplier),
  setupTimeout: "120s",
  teardownTimeout: "120s",
};

const crud = new ConfigCrudOperation(config);
const list = new ConfigListOperation(config);
const versions = new ConfigVersionsOperation(config);
const platforms = new ConfigPlatformsOperation(config);
const bulk = new BulkDeleteOperation(config);

const handlers = createClientOppyHandlers({
  crud,
  list,
  versions,
  platforms,
  bulk,
});

export function setup() {
  console.log(`[${SCENARIO_NAME}] Setup: Checking service readiness...`);
  const ready = waitForReady(config.baseUrl, 30);
  if (!ready) {
    console.warn(`[${SCENARIO_NAME}] Service not ready, proceeding anyway...`);
  }

  console.log(`[${SCENARIO_NAME}] Setup: Seeding large dataset for bulk delete test...`);
  const seededIds = seedConfigs(config.baseUrl, config.headers, 100);
  console.log(`[${SCENARIO_NAME}] Seeded ${seededIds.length} configs`);

  return { seededIds };
}

export function backgroundTraffic() {
  runOperation(handlers, config, { skipThinkTime: true });
}

export function bulkDeleteBatch() {
  const ids = crud.getDeletableIds();
  if (ids.length >= bulkConfig.batchSize) {
    const batch = ids.slice(0, bulkConfig.batchSize);
    bulk.bulkDelete(batch);
  }
}

export function teardown(data) {
  console.log(`[${SCENARIO_NAME}] Teardown: Cleaning up test data...`);
  const deleted = cleanupConfigs(config.baseUrl, config.headers);
  console.log(`[${SCENARIO_NAME}] Cleaned up ${deleted} configs`);
}

export const handleSummary = createHandleSummary(SCENARIO_ID, SCENARIO_NAME);
