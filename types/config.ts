/**
 * Configuration Types for the K6 System Test Automation Framework
 * 
 * These types define the structure of YAML configuration files and
 * the merged runtime configuration used by scenarios.
 */

// =============================================================================
// Service Registry Types - Extensible for any backend service
// =============================================================================

/**
 * Known service identifiers based on the Netskope architecture.
 * Add new services here as they are integrated into the framework.
 */
export type ServiceName =
  // Client Configuration Services
  | 'client-oppy-configuration'
  | 'client-oppy-steering'
  | 'client-oppy-orchestrator'
  // API Gateway
  | 'addonman'
  // Download & Distribution
  | 'downloader'
  // Device Management
  | 'device-classification'
  | 'device-classification-evaluator'
  | 'device-classification-tag-service'
  // Provisioner Services
  | 'provisioner-core'
  | 'provisioner-pycore'
  | 'provisioner-pycore-branding'
  | 'provisioner-pycore-client-services'
  | 'provisioner-pycore-client-status'
  | 'provisioner-pycore-support'
  // Enrollment & Certificate Services
  | 'enrollment-service'
  | 'cert-service'
  // User Management
  | 'user-manager'
  | 'userinfodist'
  // Configuration Sync
  | 'cfgpusher'
  | 'configservice'
  // Custom service (for extensibility)
  | string;

/**
 * Service endpoint mapping - URL per service
 */
export type ServiceEndpoints = {
  [K in ServiceName]?: string;
};

// =============================================================================
// Environment Configuration Types
// =============================================================================

export interface ThinkTimeConfig {
  minMs: number;
  maxMs: number;
}

export interface EnvironmentDefaults {
  tenantId?: string;
  headers?: Record<string, string>;
  thinkTime?: ThinkTimeConfig;
}

/**
 * Environment configuration (local.yaml, minikube.yaml, staging.yaml, etc.)
 */
export interface EnvironmentConfig {
  name: string;
  description?: string;
  services: ServiceEndpoints;
  defaults: EnvironmentDefaults;
}

// =============================================================================
// Profile Configuration Types
// =============================================================================

export interface LoadStage {
  duration: string;
  target: number;
}

export type ExecutorType = 
  | 'ramping-vus'
  | 'constant-vus'
  | 'ramping-arrival-rate'
  | 'constant-arrival-rate'
  | 'per-vu-iterations'
  | 'shared-iterations'
  | 'externally-controlled';

/**
 * Profile configuration (smoke.yaml, load.yaml, stress.yaml, etc.)
 */
export interface ProfileConfig {
  name: string;
  executor?: ExecutorType;
  startVUs?: number;
  stages?: LoadStage[];
  gracefulRampDown?: string;
  thresholdMultiplier: number;
  
  // For constant-vus executor
  vus?: number;
  duration?: string;
  
  // For arrival-rate executors
  rate?: number;
  timeUnit?: string;
  preAllocatedVUs?: number;
  maxVUs?: number;
}

// =============================================================================
// Scenario Configuration Types
// =============================================================================

/**
 * Traffic mix defines the percentage of each operation type.
 * Keys are operation names, values are percentages (must sum to 100).
 */
export type TrafficMix = Record<string, number>;

/**
 * SLO (Service Level Objective) for latency metrics
 */
export interface LatencySLO {
  p50?: number;
  p95?: number;
  p99?: number;
}

/**
 * SLO for error rates
 */
export interface ErrorSLO {
  rate: number;
}

/**
 * Complete SLO configuration
 */
export type SLOConfig = {
  [metricName: string]: LatencySLO | ErrorSLO;
};

export type ScenarioCategory = 
  | 'baseline'
  | 'single-fault'
  | 'compound-fault'
  | 'data-integrity'
  | 'deployment'
  | 'e2e';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * Custom k6 executor configuration for advanced scenarios
 */
export interface CustomExecutorConfig {
  executor: ExecutorType;
  [key: string]: unknown;
}

// =============================================================================
// Fault Injection Configuration
// =============================================================================

export type FaultType = 
  | 'pod-restart'
  | 'pod-kill'
  | 'redis-restart'
  | 'kafka-broker-kill'
  | 'db-failover'
  | 'network-latency'
  | 'network-partition'
  | 'cpu-stress'
  | 'memory-pressure'
  | 'disk-fill';

export type FaultPhase = 'setup' | 'during' | 'teardown';

export interface FaultConfig {
  /** Type of fault to inject */
  type: FaultType;
  /** Target service or component */
  target: string;
  /** When to inject: setup, during test, or teardown */
  phase: FaultPhase;
  /** For 'during' phase: when to trigger (e.g., "50%" or "2m") */
  trigger_at?: string;
  /** Duration of the fault (e.g., "30s") */
  duration?: string;
  /** Additional parameters for the fault */
  params?: Record<string, unknown>;
}

// =============================================================================
// Infrastructure SLO Configuration
// =============================================================================

export interface InfrastructureSLO {
  /** Maximum allowed value */
  max?: number;
  /** Minimum allowed value */
  min?: number;
  /** Prometheus query or metric name (optional when no metrics source) */
  query?: string;
  /** Unit for display (e.g., "%", "ms", "count") */
  unit?: string;
}

export type InfrastructureSLOConfig = Record<string, InfrastructureSLO>;

// =============================================================================
// Data Validation Configuration
// =============================================================================

export interface DataValidationConfig {
  /** Verify data is readable immediately after write */
  read_after_write?: boolean;
  /** Verify idempotent operations produce same result */
  idempotency_check?: boolean;
  /** Verify concurrent writes don't corrupt data */
  concurrent_write_check?: boolean;
  /** Custom validation functions to run */
  custom_validations?: string[];
}

// =============================================================================
// Authentication Configuration
// =============================================================================

export type AuthStrategy = 
  | 'none'
  | 'tenant-header'
  | 'api-key'
  | 'oauth2'
  | 'mtls'
  | 'basic';

export interface AuthConfig {
  /** Authentication strategy to use */
  strategy: AuthStrategy;
  /** Header name for tenant-header or api-key strategies */
  header_name?: string;
  /** Environment variable containing the secret */
  secret_env_var?: string;
  /** OAuth2 token endpoint */
  token_endpoint?: string;
  /** OAuth2 client credentials env vars */
  client_id_env?: string;
  client_secret_env?: string;
  /** mTLS certificate paths */
  cert_path?: string;
  key_path?: string;
}

// =============================================================================
// Test Isolation Configuration
// =============================================================================

export interface TestIsolationConfig {
  /** Use unique tenant ID per test run */
  unique_tenant?: boolean;
  /** Prefix for test data to enable cleanup */
  data_prefix?: string;
  /** Namespace/label for Kubernetes resources */
  namespace_prefix?: string;
  /** Cleanup strategy: 'always', 'on_success', 'never' */
  cleanup_strategy?: 'always' | 'on_success' | 'never';
}

// =============================================================================
// E2E Flow Configuration
// =============================================================================

export interface E2EStep {
  /** Service to call */
  service: ServiceName;
  /** Operation to perform */
  operation: string;
  /** Data to pass (can reference previous step results) */
  payload?: Record<string, unknown>;
  /** Expected response validation */
  expect?: {
    status?: number;
    body_contains?: string[];
  };
  /** Think time after this step */
  think_time_ms?: number;
}

export interface E2EFlowConfig {
  /** Flow name */
  name: string;
  /** Steps to execute in sequence */
  steps: E2EStep[];
  /** Weight for this flow in traffic mix */
  weight: number;
}

// =============================================================================
// Setup/Teardown Configuration
// =============================================================================

export interface SetupConfig {
  /** Wait for service health check */
  wait_for_ready?: boolean;
  /** Maximum retries for health check */
  max_ready_retries?: number;
  /** Health check endpoint (defaults to /health) */
  health_endpoint?: string;
  /** Number of records to seed */
  seed_count?: number;
  /** Custom seed data template */
  seed_template?: Record<string, unknown>;
  /** API path for seeding (e.g., /api/v1/items) */
  seed_path?: string;
}

export interface TeardownConfig {
  /** Clean up seeded data */
  cleanup_data?: boolean;
  /** API path for cleanup listing */
  list_path?: string;
  /** API path pattern for deletion (use {id} placeholder) */
  delete_path?: string;
  /** Filter for identifying test data */
  test_data_filter?: string;
}

/**
 * Scenario configuration (bl01-golden-baseline.yaml, etc.)
 */
export interface ScenarioConfig {
  id: string;
  name: string;
  category: ScenarioCategory;
  priority: Priority;
  description?: string;
  
  /** Target service from environment config */
  service: ServiceName;
  
  /** Traffic distribution - weights should sum to 100 */
  trafficMix: TrafficMix;
  
  /** Service Level Objectives - test fails if violated */
  slos: SLOConfig;
  
  /** Optional custom headers for this scenario */
  headers?: Record<string, string>;
  
  /** Optional think time override */
  thinkTime?: ThinkTimeConfig;
  
  /** Optional custom executor configuration */
  customExecutor?: CustomExecutorConfig;
  
  /** Human-readable pass criteria (for documentation) */
  passCriteria?: string[];
  
  // === NEW: Extended configuration ===
  
  /** Fault injection configuration */
  faults?: FaultConfig[];
  
  /** Infrastructure SLOs (CPU, memory, Kafka lag, etc.) */
  infrastructureSLOs?: InfrastructureSLOConfig;
  
  /** Data validation configuration */
  dataValidation?: DataValidationConfig;
  
  /** Authentication configuration override */
  auth?: AuthConfig;
  
  /** Test isolation configuration */
  isolation?: TestIsolationConfig;
  
  /** E2E flows for multi-service scenarios */
  e2eFlows?: E2EFlowConfig[];
  
  /** Setup configuration */
  setup?: SetupConfig;
  
  /** Teardown configuration */
  teardown?: TeardownConfig;
}

// =============================================================================
// Merged Runtime Configuration
// =============================================================================

/**
 * Complete merged configuration available at runtime.
 * Created by loadConfig() from environment, profile, and scenario configs.
 */
export interface RuntimeConfig {
  /** Raw environment config */
  env: EnvironmentConfig;
  
  /** Raw profile config */
  profile: ProfileConfig;
  
  /** Raw scenario config */
  scenario: ScenarioConfig;
  
  /** Resolved service name */
  serviceName: ServiceName;
  
  /** Resolved base URL for the target service */
  baseUrl: string;
  
  /** Resolved tenant ID */
  tenantId: string;
  
  /** Merged headers (defaults + scenario-specific) */
  headers: Record<string, string>;
  
  /** Think time configuration */
  thinkTime: ThinkTimeConfig;
  
  /** Profile's threshold multiplier */
  thresholdMultiplier: number;
  
  /** Scenario's traffic mix */
  trafficMix: TrafficMix;
  
  /** Scenario's SLOs */
  slos: SLOConfig;
  
  // === NEW: Extended runtime fields ===
  
  /** Unique test run ID for isolation */
  testRunId: string;
  
  /** Resolved auth configuration */
  auth: AuthConfig;
  
  /** Resolved test isolation settings */
  isolation: TestIsolationConfig;
}

// =============================================================================
// K6 Options Types
// =============================================================================

export interface K6Scenario {
  executor: ExecutorType;
  startVUs?: number;
  stages?: LoadStage[];
  gracefulRampDown?: string;
  vus?: number;
  duration?: string;
  rate?: number;
  timeUnit?: string;
  preAllocatedVUs?: number;
  maxVUs?: number;
  iterations?: number;
  maxDuration?: string;
  exec?: string;
}

export interface K6Thresholds {
  [metricName: string]: string[];
}

export interface K6Options {
  scenarios: Record<string, K6Scenario>;
  thresholds: K6Thresholds;
  setupTimeout?: string;
  teardownTimeout?: string;
}
