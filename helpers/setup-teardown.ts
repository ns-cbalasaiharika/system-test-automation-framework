import http from 'k6/http';
import { sleep } from 'k6';
import type { CreateConfigPayload, ListConfigsResponse, ClientConfig } from '../types/operations';
import type { RuntimeConfig } from '../types/config';

// =============================================================================
// Generic Service-Agnostic Setup/Teardown
// =============================================================================

/**
 * Configuration-driven seed data function.
 * Uses setup config from scenario YAML.
 */
export function seedData(
  config: RuntimeConfig,
  count?: number
): Array<string | number> {
  const setupConfig = config.scenario.setup;
  const seedCount = count ?? setupConfig?.seed_count ?? 0;
  
  if (seedCount === 0) return [];
  
  const seedPath = setupConfig?.seed_path || '/api/v1/items';
  const seedTemplate = setupConfig?.seed_template || {};
  const dataPrefix = config.isolation.data_prefix || config.testRunId;
  
  const created: Array<string | number> = [];

  for (let i = 0; i < seedCount; i++) {
    const body = {
      ...seedTemplate,
      name: `${dataPrefix}-${i}-${Date.now()}`,
      _k6_test_run: config.testRunId,
    };

    const res = http.post(
      `${config.baseUrl}${seedPath}`, 
      JSON.stringify(body), 
      { headers: config.headers }
    );
    
    if (res.status >= 200 && res.status < 300) {
      try {
        const data = JSON.parse(res.body as string);
        const id = data.id || data.data?.id;
        if (id) {
          created.push(id);
        }
      } catch {
        // Ignore parse errors
      }
    }

    sleep(0.1);
  }

  return created;
}

/**
 * Configuration-driven cleanup function.
 * Uses teardown config from scenario YAML.
 */
export function cleanupData(
  config: RuntimeConfig,
  createdIds?: Array<string | number>
): number {
  const teardownConfig = config.scenario.teardown;
  
  if (teardownConfig?.cleanup_data === false) return 0;
  
  const listPath = teardownConfig?.list_path || '/api/v1/items';
  const deletePath = teardownConfig?.delete_path || '/api/v1/items/{id}';
  const testDataFilter = teardownConfig?.test_data_filter || config.testRunId;
  
  // If we have specific IDs, delete those
  if (createdIds && createdIds.length > 0) {
    return deleteByIds(config, deletePath, createdIds);
  }
  
  // Otherwise, list and filter
  const listRes = http.get(`${config.baseUrl}${listPath}`, { headers: config.headers });
  
  if (listRes.status !== 200) return 0;

  let deleted = 0;
  
  try {
    const body = JSON.parse(listRes.body as string);
    const items = Array.isArray(body) ? body : (body.data || body.items || []);
    
    const deletable = items
      .filter((item: Record<string, unknown>) => {
        // Filter by test run ID marker
        if (item._k6_test_run === testDataFilter) return true;
        // Filter by name prefix
        const name = String(item.name || '');
        if (name.startsWith(testDataFilter)) return true;
        return false;
      })
      .map((item: Record<string, unknown>) => item.id);

    deleted = deleteByIds(config, deletePath, deletable);
  } catch {
    // Ignore errors
  }

  return deleted;
}

/**
 * Delete items by their IDs
 */
function deleteByIds(
  config: RuntimeConfig,
  deletePathTemplate: string,
  ids: Array<string | number>
): number {
  let deleted = 0;
  
  for (const id of ids) {
    const deletePath = deletePathTemplate.replace('{id}', String(id));
    const res = http.del(`${config.baseUrl}${deletePath}`, null, { headers: config.headers });
    if (res.status >= 200 && res.status < 300) deleted++;
    sleep(0.05);
  }
  
  return deleted;
}

// =============================================================================
// Client-Oppy Specific Functions (for backward compatibility)
// =============================================================================

/**
 * Pre-seeds the target environment with test configs.
 * Call from scenario setup() function.
 * @deprecated Use seedData() with config instead
 */
export function seedConfigs(
  baseUrl: string,
  headers: Record<string, string>,
  count: number
): Array<string | number> {
  const created: Array<string | number> = [];

  for (let i = 0; i < count; i++) {
    const body: CreateConfigPayload = {
      configurationName: `k6-seed-${i}-${Date.now()}`,
      targets: [
        {
          type: 'user_group',
          values: [
            { id: `seed-grp-${i}`, name: `seed-group-${i}` },
          ],
        },
      ],
    };

    const res = http.post(`${baseUrl}/client/config`, JSON.stringify(body), { headers });
    
    if (res.status === 201) {
      try {
        const data = JSON.parse(res.body as string) as { data: ClientConfig };
        if (data.data?.id) {
          created.push(data.data.id);
        }
      } catch {
        // Ignore parse errors
      }
    }

    sleep(0.1);
  }

  return created;
}

/**
 * Removes all k6-created test configs (id > 5).
 * Call from scenario teardown() function.
 * @deprecated Use cleanupData() with config instead
 */
export function cleanupConfigs(
  baseUrl: string,
  headers: Record<string, string>
): number {
  const listRes = http.get(`${baseUrl}/client/config`, { headers });
  
  if (listRes.status !== 200) return 0;

  let deleted = 0;
  
  try {
    const body = JSON.parse(listRes.body as string) as ListConfigsResponse;
    
    if (!body.success || !body.data) return 0;

    const deletable = body.data
      .filter((c: ClientConfig) => parseInt(String(c.id)) > 5)
      .map((c: ClientConfig) => c.id);

    for (const id of deletable) {
      const res = http.del(`${baseUrl}/client/config/${id}`, null, { headers });
      if (res.status === 204) deleted++;
      sleep(0.05);
    }
  } catch {
    // Ignore errors
  }

  return deleted;
}

interface ReadyResponse {
  status: string;
}

/**
 * Wait for service to be healthy before starting test.
 * Supports configurable health endpoint.
 */
export function waitForReady(
  baseUrl: string, 
  maxRetries = 30,
  healthEndpoint = '/api/v1/ready'
): boolean {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = http.get(`${baseUrl}${healthEndpoint}`);
      
      if (res.status === 200) {
        try {
          const body = JSON.parse(res.body as string) as ReadyResponse;
          if (body.status === 'ready' || body.status === 'ok' || body.status === 'healthy') {
            return true;
          }
        } catch {
          // If can't parse JSON but status is 200, consider it ready
          return true;
        }
      }
    } catch {
      // Ignore errors, will retry
    }
    sleep(1);
  }
  return false;
}

/**
 * Wait for service ready using config
 */
export function waitForServiceReady(config: RuntimeConfig): boolean {
  const setupConfig = config.scenario.setup;
  const healthEndpoint = setupConfig?.health_endpoint || '/health';
  const maxRetries = setupConfig?.max_ready_retries || 30;
  
  return waitForReady(config.baseUrl, maxRetries, healthEndpoint);
}

/**
 * Wait for a specific config to exist.
 * @deprecated Use waitForResource instead
 */
export function waitForConfig(
  baseUrl: string,
  headers: Record<string, string>,
  configId: string | number,
  maxRetries = 10
): boolean {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = http.get(`${baseUrl}/client/config/${configId}`, { headers });
      if (res.status === 200) return true;
    } catch {
      // Ignore errors
    }
    sleep(0.5);
  }
  return false;
}

/**
 * Wait for a resource to exist at a given path
 */
export function waitForResource(
  config: RuntimeConfig,
  resourcePath: string,
  maxRetries = 10
): boolean {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = http.get(`${config.baseUrl}${resourcePath}`, { headers: config.headers });
      if (res.status === 200) return true;
    } catch {
      // Ignore errors
    }
    sleep(0.5);
  }
  return false;
}

/**
 * Cleanup addons created during test.
 * @deprecated Use cleanupData instead
 */
export function cleanupAddons(
  baseUrl: string,
  headers: Record<string, string>,
  addonIds: string[]
): number {
  let deleted = 0;
  
  for (const id of addonIds) {
    try {
      const res = http.del(`${baseUrl}/api/v1/addons/${id}`, null, { headers });
      if (res.status === 204 || res.status === 200) deleted++;
    } catch {
      // Ignore errors
    }
    sleep(0.05);
  }
  
  return deleted;
}

// =============================================================================
// Legacy Setup/Teardown Options (for backward compatibility)
// =============================================================================

/**
 * @deprecated Use configDrivenSetup instead
 */
export interface SetupOptions {
  baseUrl: string;
  headers: Record<string, string>;
  waitForService?: boolean;
  seedCount?: number;
  maxReadyRetries?: number;
}

export interface SetupResult {
  ready: boolean;
  seededIds: Array<string | number>;
  testRunId?: string;
}

/**
 * @deprecated Use configDrivenSetup instead
 */
export function genericSetup(options: SetupOptions): SetupResult {
  const {
    baseUrl,
    headers,
    waitForService = true,
    seedCount = 0,
    maxReadyRetries = 30,
  } = options;

  let ready = true;
  
  if (waitForService) {
    ready = waitForReady(baseUrl, maxReadyRetries);
  }

  const seededIds = seedCount > 0 
    ? seedConfigs(baseUrl, headers, seedCount)
    : [];

  return { ready, seededIds };
}

/**
 * @deprecated Use configDrivenTeardown instead
 */
export interface TeardownOptions {
  baseUrl: string;
  headers: Record<string, string>;
  cleanupConfigurations?: boolean;
  addonIds?: string[];
}

export interface TeardownResult {
  deletedConfigs: number;
  deletedAddons: number;
  deletedItems?: number;
}

/**
 * @deprecated Use configDrivenTeardown instead
 */
export function genericTeardown(options: TeardownOptions): TeardownResult {
  const {
    baseUrl,
    headers,
    cleanupConfigurations = true,
    addonIds = [],
  } = options;

  const deletedConfigs = cleanupConfigurations 
    ? cleanupConfigs(baseUrl, headers)
    : 0;

  const deletedAddons = addonIds.length > 0
    ? cleanupAddons(baseUrl, headers, addonIds)
    : 0;

  return { deletedConfigs, deletedAddons };
}

// =============================================================================
// New Config-Driven Setup/Teardown
// =============================================================================

/**
 * Config-driven setup that uses scenario YAML configuration.
 * Automatically handles service readiness, data seeding, and test isolation.
 */
export function configDrivenSetup(config: RuntimeConfig): SetupResult {
  const setupConfig = config.scenario.setup;
  
  let ready = true;
  
  // Wait for service if configured
  if (setupConfig?.wait_for_ready !== false) {
    ready = waitForServiceReady(config);
  }
  
  if (!ready) {
    console.warn(`Service ${config.serviceName} not ready after retries`);
  }
  
  // Seed data if configured
  const seededIds = seedData(config);
  
  console.log(`[SETUP] Test run: ${config.testRunId}, Service: ${config.serviceName}, Seeded: ${seededIds.length} items`);
  
  return { 
    ready, 
    seededIds,
    testRunId: config.testRunId,
  };
}

/**
 * Config-driven teardown that uses scenario YAML configuration.
 * Handles cleanup based on isolation strategy.
 */
export function configDrivenTeardown(
  config: RuntimeConfig,
  setupResult?: SetupResult
): TeardownResult {
  const isolationConfig = config.isolation;
  
  // Check if we should cleanup based on strategy
  if (isolationConfig.cleanup_strategy === 'never') {
    console.log('[TEARDOWN] Cleanup disabled by strategy');
    return { deletedConfigs: 0, deletedAddons: 0, deletedItems: 0 };
  }
  
  // For 'on_success', we'd need to check test results (handled externally)
  
  const deletedItems = cleanupData(config, setupResult?.seededIds);
  
  console.log(`[TEARDOWN] Cleaned up ${deletedItems} items for test run ${config.testRunId}`);
  
  return { 
    deletedConfigs: 0, 
    deletedAddons: 0, 
    deletedItems,
  };
}
