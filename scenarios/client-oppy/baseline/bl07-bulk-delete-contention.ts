import { loadConfig } from '../../../lib/config-loader';
import { buildThresholds } from '../../../lib/thresholds';
import { runOperation, createClientOppyHandlers } from '../../../lib/scenario-runner';
import { createResultsPipeline } from '../../../lib/results-pipeline';
import { ConfigCrudOperation } from '../../../operations/client-oppy/config-crud';
import { ConfigListOperation } from '../../../operations/client-oppy/config-list';
import { ConfigVersionsOperation } from '../../../operations/client-oppy/config-versions';
import { ConfigPlatformsOperation } from '../../../operations/client-oppy/config-platforms';
import { BulkDeleteOperation } from '../../../operations/client-oppy/bulk-delete';
import { BulkStatusOperation } from '../../../operations/client-oppy/bulk-status';
import { seedConfigs, cleanupConfigs, waitForReady } from '../../../helpers/setup-teardown';
import type { K6Options, ScenarioConfig } from '../../../types/config';

interface BulkDeleteScenarioConfig extends ScenarioConfig {
  bulkDelete?: {
    batchSize?: number;
    intervalSeconds?: number;
    pollTimeoutMs?: number;
  };
}

const config = loadConfig('bl07-bulk-delete-contention');
const scenarioConfig = config.scenario as BulkDeleteScenarioConfig;
const bulkConfig = scenarioConfig.bulkDelete || { batchSize: 10, intervalSeconds: 30 };

export const options: K6Options = {
  scenarios: {
    background_traffic: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '30m',
      preAllocatedVUs: 100,
      exec: 'backgroundTraffic',
    },
    bulk_deletes: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: `${bulkConfig.intervalSeconds}s`,
      duration: '30m',
      preAllocatedVUs: 5,
      exec: 'bulkDeleteBatch',
    },
  },
  thresholds: buildThresholds(config),
  setupTimeout: '120s',
  teardownTimeout: '120s',
};

const crud = new ConfigCrudOperation(config);
const list = new ConfigListOperation(config);
const versions = new ConfigVersionsOperation(config);
const platforms = new ConfigPlatformsOperation(config);
const bulk = new BulkDeleteOperation(config);
const bulkStatus = new BulkStatusOperation(config);

const handlers = createClientOppyHandlers({
  crud,
  list,
  versions,
  platforms,
  bulk,
});

interface SetupData {
  seededIds: Array<string | number>;
}

export function setup(): SetupData {
  console.log(`[${config.scenario.name}] Setup: Checking service readiness...`);
  const ready = waitForReady(config.baseUrl, 30);
  if (!ready) {
    console.warn(`[${config.scenario.name}] Service not ready, proceeding anyway...`);
  }

  console.log(`[${config.scenario.name}] Setup: Seeding large dataset for bulk delete test...`);
  const seededIds = seedConfigs(config.baseUrl, config.headers, 100);
  console.log(`[${config.scenario.name}] Seeded ${seededIds.length} configs`);

  return { seededIds };
}

export function backgroundTraffic(): void {
  runOperation(handlers, config, { skipThinkTime: true });
}

export function bulkDeleteBatch(): void {
  const ids = crud.getDeletableIds();
  if (ids.length >= (bulkConfig.batchSize || 10)) {
    const batch = ids.slice(0, bulkConfig.batchSize || 10);
    const result = bulk.bulkDelete(batch);

    if (result.ok && result.data?.jobId) {
      bulkStatus.pollUntilComplete(
        result.data.jobId,
        bulkConfig.pollTimeoutMs || 30_000,
      );
    }
  }
}

export function teardown(_data: SetupData): void {
  console.log(`[${config.scenario.name}] Teardown: Cleaning up test data...`);
  const deleted = cleanupConfigs(config.baseUrl, config.headers);
  console.log(`[${config.scenario.name}] Cleaned up ${deleted} configs`);
}

export const handleSummary = createResultsPipeline(config);
