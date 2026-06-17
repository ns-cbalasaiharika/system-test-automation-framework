import { weightedSelect, thinkTime, randomInt } from "./utils.js";

/**
 * Shared scenario runner that dispatches operations based on traffic mix.
 * Eliminates code duplication across baseline scenarios.
 *
 * @param {Object} operations - Map of operation name to handler function
 * @param {Object} config - Scenario config with trafficMix
 * @param {Object} options - Additional options
 * @param {boolean} options.skipThinkTime - Skip think time after operation
 */
export function runOperation(operations, config, options = {}) {
  const operation = weightedSelect(config.trafficMix);
  const handler = operations[operation];

  if (handler) {
    handler();
  } else {
    console.warn(`Unknown operation: ${operation}`);
  }

  if (!options.skipThinkTime) {
    thinkTime(config);
  }
}

/**
 * Create standard client-oppy operation handlers.
 * This is a factory function that creates operation handlers from operation instances.
 *
 * @param {Object} ops - Operation instances (crud, list, versions, platforms, bulk)
 * @returns {Object} - Map of operation name to handler function
 */
export function createClientOppyHandlers(ops) {
  const { crud, list, versions, platforms, bulk } = ops;

  const handlers = {};

  if (list) {
    handlers.listConfigs = () => list.list();
  }

  if (crud) {
    handlers.getConfigById = () => {
      const id = crud.getRandomId();
      if (id) {
        crud.getById(id);
      } else {
        crud.getById(1);
      }
    };

    handlers.createConfig = () => crud.create();

    handlers.updateConfig = () => {
      const id = crud.getRandomId();
      if (id) crud.update(id);
    };

    handlers.deleteConfig = () => {
      const deletableIds = crud.getDeletableIds();
      if (deletableIds.length > 0) {
        const id = deletableIds[randomInt(0, deletableIds.length - 1)];
        crud.delete(id);
      }
    };
  }

  if (versions) {
    handlers.getVersions = () => versions.getVersions();
  }

  if (platforms) {
    handlers.getPlatforms = () => platforms.getPlatforms();
  }

  if (bulk) {
    handlers.bulkDelete = (batchSize = 10) => {
      const ids = crud.getDeletableIds();
      if (ids.length >= batchSize) {
        bulk.bulkDelete(ids.slice(0, batchSize));
      }
    };
  }

  return handlers;
}

/**
 * Create a standard handleSummary function for k6.
 *
 * @param {string} scenarioId - Scenario identifier (e.g., "bl01")
 * @param {string} scenarioName - Human readable name (e.g., "BL-01")
 * @returns {Function} - handleSummary function for k6
 */
export function createHandleSummary(scenarioId, scenarioName) {
  return function handleSummary(data) {
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    return {
      [`../../results/${scenarioId}_${now}.json`]: JSON.stringify(data, null, 2),
      stdout: JSON.stringify(
        {
          scenario: scenarioName,
          timestamp: new Date().toISOString(),
          pass: !data.root_group || data.root_group.checks_succeeded,
        },
        null,
        2
      ),
    };
  };
}
