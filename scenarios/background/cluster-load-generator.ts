/**
 * CLUSTER LOAD GENERATOR
 * 
 * This scenario generates background load across all configured services.
 * It reads the cluster-services.yaml and load-profiles.yaml to determine
 * what traffic to generate.
 * 
 * Usage:
 *   LOAD_PROFILE=p95 k6 run cluster-load-generator.bundle.js
 *   
 * Environment variables:
 *   LOAD_PROFILE - Load profile to use (idle, light, p50, p95, p99, stress, soak)
 *   ENV - Environment config (rancher, minikube, etc.)
 *   SERVICES - Comma-separated list of services to load (optional, defaults to all)
 *   EXCLUDE_SERVICES - Comma-separated list of services to exclude (optional)
 */

import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomInt, randomString } from '../../lib/utils';
import { parseYAML } from '../../lib/yaml-parser';

declare const __ENV: Record<string, string | undefined>;
declare function open(path: string): string;

// =============================================================================
// Configuration Loading
// =============================================================================

interface ServiceOperation {
  name: string;
  method: string;
  path: string;
  weight: number;
}

interface ServiceConfig {
  description: string;
  port: number;
  healthEndpoint: string;
  operations: ServiceOperation[];
}

interface ClusterServicesConfig {
  services: Record<string, ServiceConfig>;
}

interface LoadProfileConfig {
  description: string;
  baseRPS: number;
  duration: string | number;
  rampUp: string;
  rampDown: string;
  serviceMultipliers: Record<string, number>;
}

interface LoadProfilesConfig {
  profiles: Record<string, LoadProfileConfig>;
}

interface EnvironmentConfig {
  name: string;
  services: Record<string, string>;
  defaults: {
    tenantId?: string;
    headers?: Record<string, string>;
  };
}

// Load configurations
const loadProfileName = __ENV.LOAD_PROFILE || 'p95';
const envName = __ENV.ENV || 'rancher';
const includeServices = __ENV.SERVICES?.split(',').map(s => s.trim()) || null;
const excludeServices = __ENV.EXCLUDE_SERVICES?.split(',').map(s => s.trim()) || [];

// Try multiple paths to support both local and in-cluster execution
const CONFIG_PATHS = [
  '/config',                    // k6-operator (in-cluster)
  '../../config',               // Local execution from dist/scenarios/background/
  '../../../config',            // Alternative nesting
  'config',                     // Running from project root
];

function loadConfigFile(subPath: string): string {
  for (const prefix of CONFIG_PATHS) {
    try {
      return open(`${prefix}/${subPath}`);
    } catch {
      // Try next path
    }
  }
  throw new Error(`Config file not found: ${subPath} (tried: ${CONFIG_PATHS.join(', ')})`);
}

const clusterServicesYaml = loadConfigFile('cluster-load/cluster-services.yaml');
const loadProfilesYaml = loadConfigFile('cluster-load/load-profiles.yaml');
const envConfigYaml = loadConfigFile(`environments/${envName}.yaml`);

const clusterServices = parseYAML(clusterServicesYaml) as unknown as ClusterServicesConfig;
const loadProfiles = parseYAML(loadProfilesYaml) as unknown as LoadProfilesConfig;
const envConfig = parseYAML(envConfigYaml) as unknown as EnvironmentConfig;

const loadProfile = loadProfiles.profiles[loadProfileName];
if (!loadProfile) {
  throw new Error(`Load profile '${loadProfileName}' not found. Available: ${Object.keys(loadProfiles.profiles).join(', ')}`);
}

// =============================================================================
// Build Service Load Configuration
// =============================================================================

interface ServiceLoadConfig {
  name: string;
  baseUrl: string;
  rps: number;
  operations: ServiceOperation[];
  healthEndpoint: string;
}

const serviceLoadConfigs: ServiceLoadConfig[] = [];

for (const [serviceName, serviceConfig] of Object.entries(clusterServices.services)) {
  // Filter services
  if (includeServices && !includeServices.includes(serviceName)) continue;
  if (excludeServices.includes(serviceName)) continue;
  
  // Get service URL from environment
  const baseUrl = envConfig.services[serviceName];
  if (!baseUrl) {
    console.warn(`Service '${serviceName}' not configured in environment '${envName}', skipping`);
    continue;
  }

  // Calculate RPS for this service
  const multiplier = loadProfile.serviceMultipliers[serviceName] || 1;
  const rps = loadProfile.baseRPS * multiplier;

  serviceLoadConfigs.push({
    name: serviceName,
    baseUrl,
    rps,
    operations: serviceConfig.operations,
    healthEndpoint: serviceConfig.healthEndpoint || '/health',
  });
}

console.log(`[Cluster Load] Profile: ${loadProfileName}`);
console.log(`[Cluster Load] Environment: ${envName}`);
console.log(`[Cluster Load] Services: ${serviceLoadConfigs.length}`);
console.log(`[Cluster Load] Total target RPS: ${serviceLoadConfigs.reduce((sum, s) => sum + s.rps, 0)}`);

// =============================================================================
// Metrics
// =============================================================================

const errorRate = new Rate('cluster_load_errors');
const requestCount = new Counter('cluster_load_requests');
const serviceLatency: Record<string, Trend> = {};
const serviceErrors: Record<string, Rate> = {};

for (const svc of serviceLoadConfigs) {
  serviceLatency[svc.name] = new Trend(`latency_${svc.name.replace(/-/g, '_')}`, true);
  serviceErrors[svc.name] = new Rate(`errors_${svc.name.replace(/-/g, '_')}`);
}

// =============================================================================
// K6 Options
// =============================================================================

// Ramp times available for future use: loadProfile.rampUp, loadProfile.rampDown
const totalRPS = serviceLoadConfigs.reduce((sum, s) => sum + s.rps, 0);

export const options = {
  scenarios: {
    cluster_load: {
      executor: 'constant-arrival-rate',
      rate: totalRPS,
      timeUnit: '1s',
      duration: loadProfile.duration === 0 ? '24h' : loadProfile.duration.toString(),
      preAllocatedVUs: Math.min(totalRPS * 2, 500),
      maxVUs: Math.min(totalRPS * 5, 1000),
    },
  },
  thresholds: {
    cluster_load_errors: ['rate<0.05'],  // Max 5% errors for background load
  },
};

// =============================================================================
// Request Generation
// =============================================================================

const headers = envConfig.defaults.headers || { 'Content-Type': 'application/json' };
const tenantId = envConfig.defaults.tenantId || 'perf-test-tenant';

function selectService(): ServiceLoadConfig {
  // Weighted random selection based on RPS
  const totalWeight = serviceLoadConfigs.reduce((sum, s) => sum + s.rps, 0);
  let roll = Math.random() * totalWeight;
  
  for (const svc of serviceLoadConfigs) {
    roll -= svc.rps;
    if (roll <= 0) return svc;
  }
  return serviceLoadConfigs[serviceLoadConfigs.length - 1];
}

function selectOperation(service: ServiceLoadConfig): ServiceOperation {
  const totalWeight = service.operations.reduce((sum, op) => sum + op.weight, 0);
  let roll = Math.random() * totalWeight;
  
  for (const op of service.operations) {
    roll -= op.weight;
    if (roll <= 0) return op;
  }
  return service.operations[service.operations.length - 1];
}

function generateRequestBody(operation: ServiceOperation): string | null {
  if (operation.method === 'GET' || operation.method === 'DELETE') {
    return null;
  }
  
  // Generate generic request body based on operation name
  if (operation.name.includes('Config') || operation.name.includes('config')) {
    return JSON.stringify({
      configurationName: `k6-load-${randomString(8)}`,
      targets: [{ type: 'user_group', values: [{ id: `k6-grp-${randomString(4)}`, name: 'k6-group' }] }],
    });
  }
  
  if (operation.name.includes('Status') || operation.name.includes('status')) {
    return JSON.stringify({
      clientId: `k6-client-${randomString(8)}`,
      status: 'online',
      timestamp: new Date().toISOString(),
    });
  }
  
  if (operation.name.includes('Enroll') || operation.name.includes('enroll')) {
    return JSON.stringify({
      deviceId: `k6-device-${randomString(8)}`,
      userId: `k6-user-${randomString(8)}`,
      tenantId: tenantId,
    });
  }
  
  if (operation.name.includes('Certificate') || operation.name.includes('cert')) {
    return JSON.stringify({
      type: 'user',
      subject: `k6-cert-${randomString(8)}`,
    });
  }
  
  if (operation.name.includes('classify') || operation.name.includes('Classify')) {
    return JSON.stringify({
      deviceId: `k6-device-${randomString(8)}`,
      attributes: { os: 'Windows', osVersion: '10.0', managed: true },
    });
  }
  
  // Default body
  return JSON.stringify({ data: `k6-load-test-${randomString(8)}` });
}

function resolvePath(path: string): string {
  // Replace path parameters with random values
  return path
    .replace('{id}', String(randomInt(1, 100)))
    .replace('{tenantId}', tenantId)
    .replace('{userId}', `user-${randomInt(1, 1000)}`)
    .replace('{certId}', `cert-${randomInt(1, 100)}`)
    .replace('{enrollmentId}', `enroll-${randomInt(1, 100)}`);
}

// =============================================================================
// Main Execution
// =============================================================================

export function setup(): void {
  console.log(`[Cluster Load] Starting background load with profile: ${loadProfileName}`);
  console.log(`[Cluster Load] Target RPS: ${totalRPS}`);
  console.log(`[Cluster Load] Services targeted:`);
  
  // Health check all services using their configured health endpoint
  for (const svc of serviceLoadConfigs) {
    const healthPath = svc.healthEndpoint || '/health';
    console.log(`[Cluster Load]   - ${svc.name}: ${svc.rps} RPS`);
    try {
      const res = http.get(`${svc.baseUrl}${healthPath}`, { timeout: '5s' });
      console.log(`[Cluster Load]     Health (${healthPath}): ${res.status === 200 ? 'OK' : res.status}`);
    } catch {
      console.log(`[Cluster Load]     Health (${healthPath}): UNREACHABLE`);
    }
  }
}

export default function (): void {
  const service = selectService();
  const operation = selectOperation(service);
  const path = resolvePath(operation.path);
  const url = `${service.baseUrl}${path}`;
  
  let response;
  const requestHeaders = { ...headers, 'x-netskope-tenantid': tenantId };
  
  try {
    switch (operation.method) {
      case 'GET':
        response = http.get(url, { headers: requestHeaders, tags: { service: service.name, operation: operation.name } });
        break;
      case 'POST':
        response = http.post(url, generateRequestBody(operation), { headers: requestHeaders, tags: { service: service.name, operation: operation.name } });
        break;
      case 'PUT':
        response = http.put(url, generateRequestBody(operation), { headers: requestHeaders, tags: { service: service.name, operation: operation.name } });
        break;
      case 'PATCH':
        response = http.patch(url, generateRequestBody(operation), { headers: requestHeaders, tags: { service: service.name, operation: operation.name } });
        break;
      case 'DELETE':
        response = http.del(url, null, { headers: requestHeaders, tags: { service: service.name, operation: operation.name } });
        break;
      default:
        response = http.get(url, { headers: requestHeaders, tags: { service: service.name, operation: operation.name } });
    }
    
    requestCount.add(1);
    serviceLatency[service.name].add(response.timings.duration);
    
    const ok = response.status >= 200 && response.status < 400;
    errorRate.add(!ok);
    serviceErrors[service.name].add(!ok);
    
  } catch {
    errorRate.add(true);
    serviceErrors[service.name].add(true);
  }
}

export function teardown(): void {
  console.log(`[Cluster Load] Background load completed`);
}
