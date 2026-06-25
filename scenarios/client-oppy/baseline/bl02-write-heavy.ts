import { loadConfig, buildScenarioOptions } from '../../../lib/config-loader';
import { buildThresholds } from '../../../lib/thresholds';
import { runOperation, createClientOppyHandlers } from '../../../lib/scenario-runner';
import { createResultsPipeline } from '../../../lib/results-pipeline';
import { ConfigCrudOperation } from '../../../operations/client-oppy/config-crud';
import { ConfigListOperation } from '../../../operations/client-oppy/config-list';
import { seedConfigs, cleanupConfigs, waitForReady } from '../../../helpers/setup-teardown';
import type { K6Options } from '../../../types/config';

const config = loadConfig('bl02-write-heavy');

export const options: K6Options = {
  scenarios: buildScenarioOptions(config),
  thresholds: buildThresholds(config),
  setupTimeout: '60s',
  teardownTimeout: '60s',
};

const crud = new ConfigCrudOperation(config);
const list = new ConfigListOperation(config);

const handlers = createClientOppyHandlers({ crud, list });

interface SetupData {
  seededIds: Array<string | number>;
}

export function setup(): SetupData {
  console.log(`[${config.scenario.name}] Setup: Checking service readiness...`);
  const ready = waitForReady(config.baseUrl, 30);
  if (!ready) {
    console.warn(`[${config.scenario.name}] Service not ready, proceeding anyway...`);
  }

  console.log(`[${config.scenario.name}] Setup: Seeding test data...`);
  const seededIds = seedConfigs(config.baseUrl, config.headers, 20);
  console.log(`[${config.scenario.name}] Seeded ${seededIds.length} configs`);

  return { seededIds };
}

export default function (): void {
  runOperation(handlers, config);
}

export function teardown(_data: SetupData): void {
  console.log(`[${config.scenario.name}] Teardown: Cleaning up test data...`);
  const deleted = cleanupConfigs(config.baseUrl, config.headers);
  console.log(`[${config.scenario.name}] Cleaned up ${deleted} configs`);
}

export const handleSummary = createResultsPipeline(config);
