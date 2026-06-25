/**
 * K6 System Test Automation Framework - Core Library
 * 
 * Central export point for all framework utilities.
 */

// Configuration Loading
export {
  loadConfig,
  buildScenarioOptions,
  getServiceUrl,
  getAvailableServices,
} from './config-loader';

// HTTP Client
export { HttpClient } from './http-client';

// Metrics
export {
  // Shared metrics
  errorRate,
  requestsTotal,
  activeVUs,
  // Client-oppy metrics
  listLatency,
  getByIdLatency,
  versionsLatency,
  platformsLatency,
  createLatency,
  updateLatency,
  deleteLatency,
  bulkDeleteLatency,
  configsCreated,
  configsDeleted,
  configsUpdated,
  // Addonman metrics
  getAddonLatency,
  listAddonsLatency,
  createAddonLatency,
  updateAddonLatency,
  deleteAddonLatency,
  addonsCreated,
  addonsDeleted,
  addonsUpdated,
  // Downloader metrics
  downloadLatency,
  downloadListLatency,
  downloadTriggerLatency,
  downloadsTriggered,
  downloadsCompleted,
  // Device Classification metrics
  classifyLatency,
  lookupLatency,
  batchClassifyLatency,
  devicesClassified,
  deviceLookups,
  // Provisioner metrics
  provisionTenantLatency,
  deprovisionTenantLatency,
  getBrandingLatency,
  updateClientStatusLatency,
  tenantsProvisioned,
  tenantsDeprovisioned,
  // Enrollment metrics
  enrollLatency,
  enrollmentStatusLatency,
  deviceEnrollments,
  enrollmentApprovals,
  // Certificate metrics
  getCertLatency,
  requestCertLatency,
  revokeCertLatency,
  certsIssued,
  certsRevoked,
  // User Manager metrics
  getUserLatency,
  listUsersLatency,
  syncUsersLatency,
  usersSynced,
  // Steering metrics
  getDomainsLatency,
  updateDomainLatency,
  domainsUpdated,
  // Dynamic metric creation
  getOrCreateTrend,
  getOrCreateCounter,
  getOrCreateRate,
  getOrCreateGauge,
  createServiceMetrics,
} from './metrics';

// Thresholds
export {
  buildThresholds,
  mergeThresholds,
  createDefaultThresholds,
} from './thresholds';

// Scenario Runner
export {
  runOperation,
  createClientOppyHandlers,
  createHandleSummary,
  createGenericHandlers,
  runOperationSequence,
  runNamedOperation,
} from './scenario-runner';

// Utilities
export {
  randomString,
  randomInt,
  thinkTime,
  weightedSelect,
  uniqueName,
  parseBody,
  randomItem,
  isDefined,
} from './utils';

// Service Registry
export {
  serviceRegistry,
  defineService,
  getServiceHandlers,
  createCRUDHandlers,
  generateServiceDocs,
  isServiceRegistered,
  getRegisteredServices,
} from './service-registry';

// Fault Injection
export {
  createFaultOrchestrator,
  hasFaults,
  getFaultsByPhase,
  injectFault,
} from './fault-injection';

// Infrastructure SLO Validation
export {
  createInfraSLOValidator,
  hasInfraSLOs,
  validateInfraSLOs,
  COMMON_QUERIES,
} from './infrastructure-slo';

// E2E Flow Runner
export {
  createE2ERunner,
  hasE2EFlows,
  runE2EIteration,
} from './e2e-runner';

// Results Pipeline
export {
  parseK6Summary,
  formatJSON,
  formatJUnit,
  formatSummary,
  createResultsPipeline,
  createSimpleHandleSummary,
} from './results-pipeline';

// YAML Parser
export { parseYAML, parseYAMLAs } from './yaml-parser';
