import { loadConfig } from "../../lib/config-loader.js";
import { buildThresholds } from "../../lib/thresholds.js";
import { weightedSelect, thinkTime, randomInt } from "../../lib/utils.js";
import { createHandleSummary } from "../../lib/scenario-runner.js";
import { TenantAwareCrudOperation } from "../../operations/client-oppy/tenant-aware-crud.js";

const SCENARIO_ID = "bl05";
const SCENARIO_NAME = "BL-05";

const config = loadConfig("bl05-multi-tenant");
const tenantCount = config.scenario.multiTenant?.tenantCount || 50;

export const options = {
  scenarios: {
    multi_tenant: {
      executor: "per-vu-iterations",
      vus: tenantCount,
      iterations: 1000,
      maxDuration: "30m",
    },
  },
  thresholds: buildThresholds(config.slos, config.thresholdMultiplier),
  setupTimeout: "60s",
  teardownTimeout: "120s",
};

const tenantCrud = new TenantAwareCrudOperation(config);

export function setup() {
  console.log(`[${SCENARIO_NAME}] Multi-tenant test with ${tenantCount} tenants`);
  return { tenantCount };
}

export default function () {
  const tenantId = `tenant-${(__VU % tenantCount) + 1}`;
  const operation = weightedSelect(config.trafficMix);

  switch (operation) {
    case "listConfigs":
      tenantCrud.list(tenantId);
      break;
    case "getConfigById": {
      const id = tenantCrud.getRandomId(tenantId);
      if (id) {
        tenantCrud.getById(tenantId, id);
      } else {
        tenantCrud.getById(tenantId, 1);
      }
      break;
    }
    case "createConfig":
      tenantCrud.create(tenantId);
      break;
    case "updateConfig": {
      const id = tenantCrud.getRandomId(tenantId);
      if (id) tenantCrud.update(tenantId, id);
      break;
    }
    case "deleteConfig": {
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

export function teardown(data) {
  console.log(`[${SCENARIO_NAME}] Teardown: Multi-tenant test completed`);
}

export const handleSummary = createHandleSummary(SCENARIO_ID, SCENARIO_NAME);
