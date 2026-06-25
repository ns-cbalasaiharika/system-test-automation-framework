/**
 * Generic Baseline Scenario Template
 * 
 * This is a service-agnostic scenario template that can be used as a starting point
 * for creating new service scenarios. It demonstrates the recommended patterns for:
 * 
 * - Config-driven setup and teardown
 * - Fault injection integration
 * - Infrastructure SLO validation
 * - Structured results pipeline
 * 
 * To use this template:
 * 1. Copy this file to scenarios/<service>/<category>/<scenario-id>.ts
 * 2. Update SCENARIO_ID to match your config file name
 * 3. Implement the service-specific operations
 * 4. Create corresponding YAML config in config/workloads/<service>/
 */

import { loadConfig, buildScenarioOptions } from '../../lib/config-loader';
import { buildThresholds } from '../../lib/thresholds';
import { runOperation, createGenericHandlers } from '../../lib/scenario-runner';
import { createResultsPipeline } from '../../lib/results-pipeline';
import { 
  configDrivenSetup, 
  configDrivenTeardown, 
  SetupResult 
} from '../../helpers/setup-teardown';
import { createFaultOrchestrator, hasFaults } from '../../lib/fault-injection';
import { createInfraSLOValidator, hasInfraSLOs } from '../../lib/infrastructure-slo';
import { createE2ERunner, hasE2EFlows } from '../../lib/e2e-runner';
import { BaseOperation } from '../../operations/base-operation';
import { getOrCreateTrend, getOrCreateCounter } from '../../lib/metrics';
import type { OperationHandlers } from '../../types/operations';

// =============================================================================
// Configuration
// =============================================================================

// TODO: Update this to your scenario ID (must match YAML config filename)
const SCENARIO_ID = 'generic-baseline';

// Load configuration
const config = loadConfig(SCENARIO_ID);

// =============================================================================
// K6 Options
// =============================================================================

export const options = {
  scenarios: buildScenarioOptions(config),
  thresholds: buildThresholds(config),
  setupTimeout: '120s',
  teardownTimeout: '60s',
};

// =============================================================================
// Dynamic Metrics
// =============================================================================

// Create service-specific metrics dynamically
const servicePrefix = config.serviceName.replace(/-/g, '_');
const metrics = {
  listLatency: getOrCreateTrend(`latency_${servicePrefix}_list`),
  getLatency: getOrCreateTrend(`latency_${servicePrefix}_get`),
  createLatency: getOrCreateTrend(`latency_${servicePrefix}_create`),
  updateLatency: getOrCreateTrend(`latency_${servicePrefix}_update`),
  deleteLatency: getOrCreateTrend(`latency_${servicePrefix}_delete`),
  operationCount: getOrCreateCounter(`${servicePrefix}_operations`),
  errorCount: getOrCreateCounter(`${servicePrefix}_errors`),
};

// =============================================================================
// Operations
// =============================================================================

/**
 * Generic Service Operations
 * 
 * This class provides a template for service operations.
 * Override these methods with actual API calls for your service.
 */
class GenericServiceOperations extends BaseOperation {
  private createdIds: Array<string | number> = [];
  
  /**
   * List all items
   */
  list() {
    const path = config.scenario.teardown?.list_path || '/api/v1/items';
    const start = Date.now();
    const result = this.client.get(path);
    metrics.listLatency.add(Date.now() - start);
    metrics.operationCount.add(1);
    
    if (!result.ok) {
      metrics.errorCount.add(1);
    }
    
    return result;
  }
  
  /**
   * Get item by ID
   */
  getById(id: string | number) {
    const basePath = config.scenario.teardown?.delete_path?.replace('{id}', '') || '/api/v1/items/';
    const start = Date.now();
    const result = this.client.get(`${basePath}${id}`);
    metrics.getLatency.add(Date.now() - start);
    metrics.operationCount.add(1);
    
    if (!result.ok) {
      metrics.errorCount.add(1);
    }
    
    return result;
  }
  
  /**
   * Create a new item
   */
  create(payload?: Record<string, unknown>) {
    const path = config.scenario.setup?.seed_path || '/api/v1/items';
    const template = config.scenario.setup?.seed_template || {};
    const data = {
      ...template,
      ...payload,
      name: `${config.isolation.data_prefix}-${Date.now()}`,
      _k6_test_run: config.testRunId,
    };
    
    const start = Date.now();
    const result = this.client.post(path, data);
    metrics.createLatency.add(Date.now() - start);
    metrics.operationCount.add(1);
    
    if (result.ok) {
      try {
        const body = JSON.parse(result.response.body as string);
        const id = body.id || body.data?.id;
        if (id) {
          this.createdIds.push(id);
        }
      } catch {
        // Ignore parse errors
      }
    } else {
      metrics.errorCount.add(1);
    }
    
    return result;
  }
  
  /**
   * Update an item
   */
  update(id: string | number, payload?: Record<string, unknown>) {
    const pathTemplate = config.scenario.teardown?.delete_path || '/api/v1/items/{id}';
    const path = pathTemplate.replace('{id}', String(id));
    const data = payload || { updated_at: new Date().toISOString() };
    
    const start = Date.now();
    const result = this.client.put(path, data);
    metrics.updateLatency.add(Date.now() - start);
    metrics.operationCount.add(1);
    
    if (!result.ok) {
      metrics.errorCount.add(1);
    }
    
    return result;
  }
  
  /**
   * Delete an item
   */
  delete(id: string | number) {
    const pathTemplate = config.scenario.teardown?.delete_path || '/api/v1/items/{id}';
    const path = pathTemplate.replace('{id}', String(id));
    
    const start = Date.now();
    const result = this.client.del(path);
    metrics.deleteLatency.add(Date.now() - start);
    metrics.operationCount.add(1);
    
    if (result.ok) {
      this.createdIds = this.createdIds.filter(i => i !== id);
    } else {
      metrics.errorCount.add(1);
    }
    
    return result;
  }
  
  /**
   * Get a random ID from created items
   */
  getRandomId(): string | number | null {
    if (this.createdIds.length === 0) return null;
    return this.createdIds[Math.floor(Math.random() * this.createdIds.length)];
  }
  
  /**
   * Get all deletable IDs
   */
  getDeletableIds(): Array<string | number> {
    return [...this.createdIds];
  }
}

// =============================================================================
// Handler Creation
// =============================================================================

let operationsInstance: GenericServiceOperations | null = null;

function getOrCreateOperations(): GenericServiceOperations {
  if (!operationsInstance) {
    operationsInstance = new GenericServiceOperations(config);
  }
  return operationsInstance;
}

function createServiceHandlers(): OperationHandlers {
  const ops = getOrCreateOperations();
  
  // Map traffic mix keys to operation functions
  // The keys should match what's in your trafficMix config
  return createGenericHandlers({
    list: () => ops.list(),
    get: () => {
      const id = ops.getRandomId() || 1;
      ops.getById(id);
    },
    create: () => ops.create(),
    update: () => {
      const id = ops.getRandomId();
      if (id) ops.update(id);
    },
    delete: () => {
      const ids = ops.getDeletableIds();
      if (ids.length > 0) {
        const id = ids[Math.floor(Math.random() * ids.length)];
        ops.delete(id);
      }
    },
  });
}

// =============================================================================
// Setup
// =============================================================================

export function setup(): SetupResult {
  console.log(`[SETUP] Starting scenario: ${config.scenario.name}`);
  console.log(`[SETUP] Test Run ID: ${config.testRunId}`);
  console.log(`[SETUP] Service: ${config.serviceName}`);
  console.log(`[SETUP] Environment: ${config.env.name}`);
  console.log(`[SETUP] Profile: ${config.profile.name}`);
  
  // Run config-driven setup (health check, seeding)
  const result = configDrivenSetup(config);
  
  if (!result.ready) {
    console.warn(`[SETUP] Warning: Service may not be ready`);
  }
  
  // Execute setup faults if configured
  if (hasFaults(config)) {
    const faultOrchestrator = createFaultOrchestrator(config);
    const faultResults = faultOrchestrator.executeSetupFaults();
    console.log(`[SETUP] Executed ${faultResults.length} setup faults`);
    
    // Schedule during-test faults
    // Note: Actual duration would come from profile stages
    const testDurationMs = 60000; // Default 1 minute
    faultOrchestrator.scheduleDuringFaults(testDurationMs);
  }
  
  console.log(`[SETUP] Seeded ${result.seededIds.length} items`);
  
  return result;
}

// =============================================================================
// Main VU Code
// =============================================================================

export default function(_data: SetupResult) {
  // Check for E2E flows
  if (hasE2EFlows(config)) {
    // Run E2E flow instead of individual operations
    const e2eRunner = createE2ERunner(config);
    const result = e2eRunner.runRandomFlow();
    
    if (result && !result.success) {
      console.warn(`[E2E] Flow "${result.flow.name}" failed`);
    }
    
    return;
  }
  
  // Create handlers and run weighted operation
  const handlers = createServiceHandlers();
  runOperation(handlers, config);
  
  // Periodically validate infrastructure SLOs (approximately every 100 iterations)
  if (hasInfraSLOs(config) && Math.random() < 0.01) {
    const validator = createInfraSLOValidator(config);
    const valid = validator.validateAndCheck();
    
    if (!valid) {
      console.warn(`[INFRA] Infrastructure SLO violation detected`);
    }
  }
}

// =============================================================================
// Teardown
// =============================================================================

export function teardown(data: SetupResult) {
  console.log(`[TEARDOWN] Completing scenario: ${config.scenario.name}`);
  
  // Execute teardown faults if configured
  if (hasFaults(config)) {
    const faultOrchestrator = createFaultOrchestrator(config);
    const faultResults = faultOrchestrator.executeTeardownFaults();
    console.log(`[TEARDOWN] Executed ${faultResults.length} teardown faults`);
  }
  
  // Run config-driven teardown
  const result = configDrivenTeardown(config, data);
  
  console.log(`[TEARDOWN] Cleaned up ${result.deletedItems || 0} items`);
  console.log(`[TEARDOWN] Test Run ${config.testRunId} completed`);
}

// =============================================================================
// Summary
// =============================================================================

export const handleSummary = createResultsPipeline(config, {
  stdout: true,
});
