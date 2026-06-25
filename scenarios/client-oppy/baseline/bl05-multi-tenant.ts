import { loadConfig } from '../../../lib/config-loader';
import { buildThresholds } from '../../../lib/thresholds';
import { weightedSelect, thinkTime, randomInt } from '../../../lib/utils';
import { createResultsPipeline } from '../../../lib/results-pipeline';
import { TenantAwareCrudOperation } from '../../../operations/client-oppy/tenant-aware-crud';
import type { K6Options, ScenarioConfig } from '../../../types/config';

declare const __VU: number;

interface MultiTenantScenarioConfig extends ScenarioConfig {
  multiTenant?: {
    tenantCount?: number;
  };
}

const config = loadConfig('bl05-multi-tenant');
const scenarioConfig = config.scenario as MultiTenantScenarioConfig;
const tenantCount = scenarioConfig.multiTenant?.tenantCount || 50;

export const options: K6Options = {
  scenarios: {
    multi_tenant: {
      executor: 'per-vu-iterations',
      vus: tenantCount,
      iterations: 1000,
      maxDuration: '30m',
    },
  },
  thresholds: buildThresholds(config),
  setupTimeout: '60s',
  teardownTimeout: '120s',
};

const tenantCrud = new TenantAwareCrudOperation(config);

interface SetupData {
  tenantCount: number;
}

export function setup(): SetupData {
  console.log(`[${config.scenario.name}] Multi-tenant test with ${tenantCount} tenants`);
  return { tenantCount };
}

export default function (): void {
  const tenantId = `tenant-${(__VU % tenantCount) + 1}`;
  const operation = weightedSelect(config.trafficMix);

  switch (operation) {
    case 'listConfigs':
      tenantCrud.list(tenantId);
      break;
    case 'getConfigById': {
      const id = tenantCrud.getRandomId(tenantId);
      if (id) {
        tenantCrud.getById(tenantId, id);
      } else {
        tenantCrud.getById(tenantId, 1);
      }
      break;
    }
    case 'createConfig':
      tenantCrud.create(tenantId);
      break;
    case 'updateConfig': {
      const id = tenantCrud.getRandomId(tenantId);
      if (id) tenantCrud.update(tenantId, id);
      break;
    }
    case 'deleteConfig': {
      const ids = tenantCrud.getDeletableIds(tenantId);
      if (ids.length > 0) {
        const id = ids[randomInt(0, ids.length - 1)];
        tenantCrud.delete(tenantId, id);
      }
      break;
    }
    default:
      tenantCrud.list(tenantId);
  }

  thinkTime(config);
}

export function teardown(_data: SetupData): void {
  console.log(`[${config.scenario.name}] Teardown: Multi-tenant test completed`);
}

export const handleSummary = createResultsPipeline(config);
