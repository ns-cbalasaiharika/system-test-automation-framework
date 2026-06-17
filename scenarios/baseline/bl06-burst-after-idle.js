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
import { seedConfigs, cleanupConfigs, waitForReady } from "../../helpers/setup-teardown.js";

const SCENARIO_ID = "bl06";
const SCENARIO_NAME = "BL-06";

const config = loadConfig("bl06-burst-after-idle");

export const options = {
  scenarios: {
    burst_after_idle: config.scenario.customExecutor,
  },
  thresholds: buildThresholds(config.slos, config.thresholdMultiplier),
  setupTimeout: "60s",
  teardownTimeout: "60s",
};

const crud = new ConfigCrudOperation(config);
const list = new ConfigListOperation(config);
const versions = new ConfigVersionsOperation(config);
const platforms = new ConfigPlatformsOperation(config);

const handlers = createClientOppyHandlers({
  crud,
  list,
  versions,
  platforms,
});

export function setup() {
  console.log(`[${SCENARIO_NAME}] Setup: Checking service readiness...`);
  const ready = waitForReady(config.baseUrl, 30);
  if (!ready) {
    console.warn(`[${SCENARIO_NAME}] Service not ready, proceeding anyway...`);
  }

  console.log(`[${SCENARIO_NAME}] Setup: Seeding test data...`);
  const seededIds = seedConfigs(config.baseUrl, config.headers, 10);
  console.log(`[${SCENARIO_NAME}] Seeded ${seededIds.length} configs`);

  return { seededIds };
}

export default function () {
  runOperation(handlers, config, { skipThinkTime: true });
}

export function teardown(data) {
  console.log(`[${SCENARIO_NAME}] Teardown: Cleaning up test data...`);
  const deleted = cleanupConfigs(config.baseUrl, config.headers);
  console.log(`[${SCENARIO_NAME}] Cleaned up ${deleted} configs`);
}

export const handleSummary = createHandleSummary(SCENARIO_ID, SCENARIO_NAME);
