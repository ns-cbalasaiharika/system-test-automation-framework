import type {
  EnvironmentConfig,
  ProfileConfig,
  ScenarioConfig,
  RuntimeConfig,
  ServiceName,
  K6Scenario,
  LoadStage,
  AuthConfig,
  TestIsolationConfig,
} from '../types/config';
import { parseYAML } from './yaml-parser';

declare const __ENV: Record<string, string | undefined>;
declare function open(path: string): string;

const DEFAULT_ENV = 'local';
const DEFAULT_PROFILE = 'load';

/**
 * Generate a unique test run ID for isolation
 */
function generateTestRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `k6-${timestamp}-${random}`;
}

/**
 * Resolve authentication configuration from scenario and environment
 */
function resolveAuthConfig(
  scenarioAuth?: AuthConfig,
  envDefaults?: { tenantId?: string }
): AuthConfig {
  // Use scenario auth if provided
  if (scenarioAuth) {
    return scenarioAuth;
  }
  
  // Default to tenant-header strategy if tenant ID is available
  if (envDefaults?.tenantId || __ENV.TENANT_ID) {
    return {
      strategy: 'tenant-header',
      header_name: 'x-netskope-tenantid',
    };
  }
  
  // No auth by default
  return { strategy: 'none' };
}

/**
 * Resolve test isolation configuration
 */
function resolveIsolationConfig(
  scenarioIsolation?: TestIsolationConfig,
  testRunId?: string
): TestIsolationConfig {
  const defaults: TestIsolationConfig = {
    unique_tenant: false,
    data_prefix: testRunId || 'k6-test',
    cleanup_strategy: 'always',
  };
  
  return { ...defaults, ...scenarioIsolation };
}

/**
 * Try multiple relative path depths to find config files.
 * This handles different scenario nesting levels in dist/.
 */
const CONFIG_PATH_PREFIXES = [
  '../config',           // dist/scenarios/template/*.bundle.js
  '../../config',        // dist/scenarios/background/*.bundle.js
  '../../../config',     // dist/scenarios/service/*.bundle.js
  '../../../../config',  // dist/scenarios/service/category/*.bundle.js
  'config',              // When running from framework root
  '/config',             // Absolute path for k6-operator (in-cluster execution)
];

/**
 * Load config file - tries YAML first, falls back to JSON.
 * Handles multiple possible path depths for bundled scenarios.
 */
function loadConfigFile<T>(relativePath: string): T {
  // Extract the path after 'config/' (e.g., 'environments/local.yaml')
  const configSubPath = relativePath.replace(/^\.\.\/config\//, '').replace(/^config\//, '');
  
  // Try each prefix to find the config file
  for (const prefix of CONFIG_PATH_PREFIXES) {
    const fullPath = `${prefix}/${configSubPath}`;
    try {
      const content = open(fullPath);
      // Try YAML parse first
      try {
        return parseYAML(content) as T;
      } catch {
        return JSON.parse(content) as T;
      }
    } catch {
      // Continue to next prefix
    }
  }
  
  throw new Error(`Failed to load config: ${relativePath} (tried multiple path depths)`);
}

/**
 * Try to load scenario config from multiple possible paths.
 * Supports both flat and nested service folder structures.
 * Also handles multiple config path depths for bundled scenarios.
 */
function loadScenarioConfig(scenarioId: string, serviceName?: string): ScenarioConfig {
  const subPaths: string[] = [];
  
  // If service name is provided, try service-specific path first
  if (serviceName) {
    subPaths.push(`scenarios/${serviceName}/${scenarioId}.yaml`);
  }
  
  // Try common service paths based on scenario ID prefix (alphabetic part only)
  // E.g., 'bl01-golden-baseline' -> 'bl', 'am-baseline' -> 'am'
  const alphaPrefix = scenarioId.match(/^[a-zA-Z]+/)?.[0]?.toLowerCase() || '';
  const servicePathMap: Record<string, string> = {
    'bl': 'client-oppy',
    'am': 'addonman',
    'dl': 'downloader',
    'dc': 'device-classification',
    'pv': 'provisioner',
    'um': 'user-manager',
    'en': 'enrollment',
  };
  
  if (servicePathMap[alphaPrefix]) {
    subPaths.push(`scenarios/${servicePathMap[alphaPrefix]}/${scenarioId}.yaml`);
  }
  
  // Try flat path (legacy)
  subPaths.push(`scenarios/${scenarioId}.yaml`);
  
  // Try each sub-path with each prefix depth
  for (const subPath of subPaths) {
    for (const prefix of CONFIG_PATH_PREFIXES) {
      const fullPath = `${prefix}/${subPath}`;
      try {
        const content = open(fullPath);
        return parseYAML(content) as unknown as ScenarioConfig;
      } catch {
        // Continue to next path
      }
    }
  }
  
  throw new Error(
    `Failed to load scenario config: ${scenarioId}. ` +
    `Tried sub-paths: ${subPaths.join(', ')} with multiple config depths`
  );
}

/**
 * Loads and merges configuration from environment, profile, and scenario files.
 * Supports both YAML (.yaml) and JSON (.json) formats.
 * Service-agnostic: works for any service (client-oppy, addonman, downloader, etc.)
 *
 * Precedence (lowest to highest): scenario → profile → environment → env vars → CLI flags.
 */
export function loadConfig(scenarioId: string, serviceHint?: ServiceName): RuntimeConfig {
  const envName = __ENV.ENV || DEFAULT_ENV;
  const profileName = __ENV.PROFILE || DEFAULT_PROFILE;

  const envConfig = loadConfigFile<EnvironmentConfig>(`../config/environments/${envName}.yaml`);
  const profileConfig = loadConfigFile<ProfileConfig>(`../config/profiles/${profileName}.yaml`);
  const scenarioConfig = loadScenarioConfig(scenarioId, serviceHint);

  // Service must be explicitly defined in scenario config
  const serviceName: ServiceName = scenarioConfig.service;
  if (!serviceName) {
    throw new Error(
      `Scenario "${scenarioId}" must specify a "service" field. ` +
      `No default service is used to ensure explicit configuration.`
    );
  }
  
  const baseUrl = __ENV.BASE_URL || envConfig.services[serviceName];

  if (!baseUrl) {
    throw new Error(
      `Service "${serviceName}" not found in environment "${envName}". ` +
      `Available services: ${Object.keys(envConfig.services).join(', ')}`
    );
  }

  const defaults = envConfig.defaults || {};
  const tenantId = __ENV.TENANT_ID || defaults.tenantId || '';

  const defaultHeaders = defaults.headers || { 'Content-Type': 'application/json' };
  const scenarioHeaders = scenarioConfig.headers || {};
  const headers: Record<string, string> = { ...defaultHeaders, ...scenarioHeaders };

  if (tenantId) {
    headers['x-netskope-tenantid'] = tenantId;
  }

  const thinkTime = scenarioConfig.thinkTime || defaults.thinkTime || { minMs: 100, maxMs: 300 };
  
  // Generate unique test run ID
  const testRunId = generateTestRunId();
  
  // Resolve auth configuration
  const auth = resolveAuthConfig(scenarioConfig.auth, defaults);
  
  // Apply auth headers based on strategy
  if (auth.strategy === 'tenant-header' && tenantId) {
    const headerName = auth.header_name || 'x-netskope-tenantid';
    headers[headerName] = tenantId;
  } else if (auth.strategy === 'api-key' && auth.secret_env_var) {
    const apiKey = __ENV[auth.secret_env_var] || '';
    const headerName = auth.header_name || 'x-api-key';
    headers[headerName] = apiKey;
  }
  
  // Resolve isolation configuration
  const isolation = resolveIsolationConfig(scenarioConfig.isolation, testRunId);

  return {
    env: envConfig,
    profile: profileConfig,
    scenario: scenarioConfig,

    serviceName,
    baseUrl,
    tenantId,
    headers,

    thinkTime,
    thresholdMultiplier: profileConfig.thresholdMultiplier || 1.0,
    trafficMix: scenarioConfig.trafficMix,
    slos: scenarioConfig.slos,
    
    // New fields
    testRunId,
    auth,
    isolation,
  };
}

/**
 * Resolves the k6 executor options from profile and scenario configs.
 * Returns a complete k6 options.scenarios object.
 */
export function buildScenarioOptions(config: RuntimeConfig): Record<string, K6Scenario> {
  const profile = config.profile;
  const scenario = config.scenario;

  const scenarioKey = scenario.id.toLowerCase().replace(/-/g, '_');

  if (scenario.customExecutor) {
    return {
      [scenarioKey]: scenario.customExecutor as K6Scenario,
    };
  }

  return {
    [scenarioKey]: {
      executor: profile.executor || 'ramping-vus',
      startVUs: profile.startVUs || 0,
      stages: profile.stages as LoadStage[],
      gracefulRampDown: profile.gracefulRampDown || '30s',
    },
  };
}

/**
 * Get a specific service URL from the environment config.
 * Useful when a scenario needs to interact with multiple services.
 */
export function getServiceUrl(config: RuntimeConfig, serviceName: ServiceName): string | undefined {
  return config.env.services[serviceName];
}

/**
 * Get all available service names from the environment config.
 */
export function getAvailableServices(config: RuntimeConfig): ServiceName[] {
  return Object.keys(config.env.services) as ServiceName[];
}
