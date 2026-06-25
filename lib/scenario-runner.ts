import { weightedSelect, thinkTime, randomInt } from './utils';
import type { RuntimeConfig } from '../types/config';
import type { OperationHandlers, IConfigCrudOperation, IConfigListOperation, IConfigVersionsOperation, IConfigPlatformsOperation, IBulkDeleteOperation } from '../types/operations';

interface RunOperationOptions {
  skipThinkTime?: boolean;
}

/**
 * Shared scenario runner that dispatches operations based on traffic mix.
 * Eliminates code duplication across baseline scenarios.
 */
export function runOperation(
  operations: OperationHandlers,
  config: RuntimeConfig,
  options: RunOperationOptions = {}
): void {
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
 * Client-oppy operation instances for handler creation.
 */
export interface ClientOppyOperations {
  crud?: IConfigCrudOperation;
  list?: IConfigListOperation;
  versions?: IConfigVersionsOperation;
  platforms?: IConfigPlatformsOperation;
  bulk?: IBulkDeleteOperation;
}

/**
 * Create standard client-oppy operation handlers.
 * This is a factory function that creates operation handlers from operation instances.
 */
export function createClientOppyHandlers(ops: ClientOppyOperations): OperationHandlers {
  const { crud, list, versions, platforms, bulk } = ops;

  const handlers: OperationHandlers = {};

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

  if (bulk && crud) {
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
 * Summary data from k6 test run.
 */
export interface SummaryData {
  root_group?: {
    checks_succeeded?: boolean;
  };
  [key: string]: unknown;
}

/**
 * Output specification for handleSummary.
 */
export interface SummaryOutput {
  [path: string]: string;
}

/**
 * Create a standard handleSummary function for k6.
 */
export function createHandleSummary(
  scenarioId: string,
  scenarioName: string
): (data: SummaryData) => SummaryOutput {
  return function handleSummary(data: SummaryData): SummaryOutput {
    const now = new Date().toISOString().replace(/[:.]/g, '-');
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

/**
 * Generic handler factory for creating operation handlers from any service operations.
 * This provides a template for creating handlers for new services.
 * 
 * @example
 * const handlers = createGenericHandlers({
 *   list: () => addonOps.listAddons(),
 *   get: () => addonOps.getAddon(randomId()),
 *   create: () => addonOps.createAddon(),
 *   delete: () => addonOps.deleteAddon(randomId()),
 * });
 */
export function createGenericHandlers(
  operationMap: Record<string, () => void>
): OperationHandlers {
  return { ...operationMap };
}

/**
 * Run multiple operations in sequence with think time between each.
 */
export function runOperationSequence(
  operations: OperationHandlers,
  sequence: string[],
  config: RuntimeConfig
): void {
  for (const operation of sequence) {
    const handler = operations[operation];
    if (handler) {
      handler();
      thinkTime(config);
    }
  }
}

/**
 * Run a single named operation without traffic mix weighting.
 */
export function runNamedOperation(
  operations: OperationHandlers,
  operationName: string,
  config: RuntimeConfig,
  options: RunOperationOptions = {}
): void {
  const handler = operations[operationName];
  if (handler) {
    handler();
    if (!options.skipThinkTime) {
      thinkTime(config);
    }
  } else {
    console.warn(`Unknown operation: ${operationName}`);
  }
}
