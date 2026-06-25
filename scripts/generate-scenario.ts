#!/usr/bin/env npx ts-node
/**
 * Scenario Generator CLI
 * 
 * Generates boilerplate for new service scenarios.
 * Creates both the TypeScript scenario file and YAML config.
 * 
 * Usage: 
 *   npx ts-node scripts/generate-scenario.ts --service addonman --category baseline --id am-bl01 --name "Addonman Golden Baseline"
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

interface GeneratorOptions {
  service: string;
  category: string;
  id: string;
  name: string;
  description?: string;
  priority?: string;
  operations?: string[];
}

// =============================================================================
// Templates
// =============================================================================

function generateScenarioTS(options: GeneratorOptions): string {
  const { service, category, id, name } = options;
  const serviceVar = service.replace(/-/g, '');
  const className = service
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  
  return `/**
 * ${name}
 * 
 * ${options.description || `Baseline performance scenario for ${service} service.`}
 * 
 * Category: ${category}
 * Service: ${service}
 */

import { check } from 'k6';
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
import { HttpClient } from '../../lib/http-client';
import { BaseOperation } from '../../operations/base-operation';
import type { RuntimeConfig } from '../../types/config';
import type { OperationHandlers } from '../../types/operations';

// =============================================================================
// Configuration
// =============================================================================

const SCENARIO_ID = '${id}';
const config = loadConfig(SCENARIO_ID);

// =============================================================================
// K6 Options
// =============================================================================

export const options = {
  scenarios: buildScenarioOptions(config),
  thresholds: buildThresholds(config),
  setupTimeout: '60s',
  teardownTimeout: '60s',
};

// =============================================================================
// Operations
// =============================================================================

/**
 * ${className} Operations
 * 
 * TODO: Implement actual operations for ${service} service.
 * This is a template that should be replaced with real API calls.
 */
class ${className}Operations extends BaseOperation {
  // TODO: Add your operations here
  
  list() {
    const result = this.client.get('/api/v1/items');
    return result;
  }
  
  getById(id: string | number) {
    const result = this.client.get(\`/api/v1/items/\${id}\`);
    return result;
  }
  
  create(payload?: Record<string, unknown>) {
    const result = this.client.post('/api/v1/items', payload || { name: 'test' });
    return result;
  }
  
  update(id: string | number, payload?: Record<string, unknown>) {
    const result = this.client.put(\`/api/v1/items/\${id}\`, payload || { name: 'updated' });
    return result;
  }
  
  delete(id: string | number) {
    const result = this.client.del(\`/api/v1/items/\${id}\`);
    return result;
  }
}

// =============================================================================
// Handler Creation
// =============================================================================

function create${className}Handlers(config: RuntimeConfig): OperationHandlers {
  const ops = new ${className}Operations(config);
  
  return createGenericHandlers({
    // Map traffic mix operations to actual operations
    // TODO: Update these mappings based on your trafficMix config
    list: () => ops.list(),
    get: () => ops.getById(1),
    create: () => ops.create(),
    update: () => ops.update(1),
    delete: () => ops.delete(1),
  });
}

// =============================================================================
// Setup
// =============================================================================

export function setup(): SetupResult {
  console.log(\`[SETUP] Starting ${name}\`);
  console.log(\`[SETUP] Test Run ID: \${config.testRunId}\`);
  console.log(\`[SETUP] Service: \${config.serviceName}\`);
  console.log(\`[SETUP] Environment: \${config.env.name}\`);
  
  // Run config-driven setup
  const result = configDrivenSetup(config);
  
  // Execute setup faults if configured
  if (hasFaults(config)) {
    const faultOrchestrator = createFaultOrchestrator(config);
    faultOrchestrator.executeSetupFaults();
  }
  
  return result;
}

// =============================================================================
// Main VU Code
// =============================================================================

export default function(data: SetupResult) {
  const handlers = create${className}Handlers(config);
  
  // Run weighted operation based on traffic mix
  runOperation(handlers, config);
  
  // Validate infrastructure SLOs periodically (every ~100 iterations)
  if (hasInfraSLOs(config) && Math.random() < 0.01) {
    const validator = createInfraSLOValidator(config);
    validator.validateAndCheck();
  }
}

// =============================================================================
// Teardown
// =============================================================================

export function teardown(data: SetupResult) {
  console.log(\`[TEARDOWN] Completing ${name}\`);
  
  // Execute teardown faults if configured
  if (hasFaults(config)) {
    const faultOrchestrator = createFaultOrchestrator(config);
    faultOrchestrator.executeTeardownFaults();
  }
  
  // Run config-driven teardown
  const result = configDrivenTeardown(config, data);
  
  console.log(\`[TEARDOWN] Cleaned up \${result.deletedItems || 0} items\`);
}

// =============================================================================
// Summary
// =============================================================================

export const handleSummary = createResultsPipeline(config, {
  stdout: true,
});
`;
}

function generateScenarioYAML(options: GeneratorOptions): string {
  const { service, category, id, name, description, priority = 'P1', operations = [] } = options;
  
  // Generate traffic mix
  const trafficMix: Record<string, number> = {};
  if (operations.length > 0) {
    const weight = Math.floor(100 / operations.length);
    const remainder = 100 - (weight * operations.length);
    operations.forEach((op, i) => {
      trafficMix[op] = weight + (i === 0 ? remainder : 0);
    });
  } else {
    // Default CRUD operations
    trafficMix['list'] = 40;
    trafficMix['get'] = 30;
    trafficMix['create'] = 15;
    trafficMix['update'] = 10;
    trafficMix['delete'] = 5;
  }
  
  const trafficMixYAML = Object.entries(trafficMix)
    .map(([op, weight]) => `  ${op}: ${weight}`)
    .join('\n');
  
  return `# ${name}
# Auto-generated scenario configuration

id: ${id.toUpperCase()}
name: ${name}
category: ${category}
priority: ${priority}
description: ${description || `Performance scenario for ${service} service`}

# Target service
service: ${service}

# Traffic distribution (must sum to 100)
trafficMix:
${trafficMixYAML}

# Service Level Objectives
slos:
  latency_${service.replace(/-/g, '_')}_list:
    p50: 100
    p95: 500
    p99: 1000
  latency_${service.replace(/-/g, '_')}_get:
    p50: 50
    p95: 200
    p99: 500
  latency_${service.replace(/-/g, '_')}_create:
    p50: 100
    p95: 500
    p99: 1000
  errors:
    rate: 0.001

# Pass criteria (documentation)
passCriteria:
  - All per-endpoint p99 latencies within SLO
  - Error rate < 0.1%
  - No service restarts during test

# Setup configuration
setup:
  wait_for_ready: true
  health_endpoint: /health
  max_ready_retries: 30
  seed_count: 10
  seed_path: /api/v1/items
  seed_template:
    name: "test-item"
    type: "performance-test"

# Teardown configuration
teardown:
  cleanup_data: true
  list_path: /api/v1/items
  delete_path: /api/v1/items/{id}

# Test isolation
isolation:
  cleanup_strategy: always

# Optional: Fault injection (uncomment to enable)
# faults:
#   - type: pod-restart
#     target: ${service}
#     phase: during
#     trigger_at: "50%"

# Optional: Infrastructure SLOs (uncomment to enable)
# infrastructureSLOs:
#   cpu_usage:
#     max: 80
#     query: "container_cpu_usage{service='${service}'}"
#     unit: "%"
`;
}

// =============================================================================
// File Generation
// =============================================================================

function generateFiles(options: GeneratorOptions): void {
  const baseDir = path.join(__dirname, '..');
  
  // Determine paths
  const scenarioDir = path.join(baseDir, 'scenarios', options.service, options.category);
  const configDir = path.join(baseDir, 'config', 'workloads', options.service);
  
  const scenarioFile = path.join(scenarioDir, `${options.id}.ts`);
  const configFile = path.join(configDir, `${options.id}.yaml`);
  
  // Create directories
  fs.mkdirSync(scenarioDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  
  // Check if files exist
  if (fs.existsSync(scenarioFile)) {
    console.error(`Error: Scenario file already exists: ${scenarioFile}`);
    process.exit(1);
  }
  if (fs.existsSync(configFile)) {
    console.error(`Error: Config file already exists: ${configFile}`);
    process.exit(1);
  }
  
  // Generate files
  const scenarioContent = generateScenarioTS(options);
  const configContent = generateScenarioYAML(options);
  
  fs.writeFileSync(scenarioFile, scenarioContent);
  fs.writeFileSync(configFile, configContent);
  
  console.log('\n' + '═'.repeat(60));
  console.log('SCENARIO GENERATED');
  console.log('═'.repeat(60) + '\n');
  console.log('Created files:');
  console.log(`  ✓ ${scenarioFile}`);
  console.log(`  ✓ ${configFile}`);
  console.log('\nNext steps:');
  console.log('  1. Update the operations in the TypeScript file');
  console.log('  2. Adjust the trafficMix and SLOs in the YAML config');
  console.log('  3. Add the service to your environment configs if not present');
  console.log('  4. Run: npm run bundle');
  console.log('  5. Test: ENV=local PROFILE=smoke k6 run dist/scenarios/...');
  console.log('\n' + '═'.repeat(60) + '\n');
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): GeneratorOptions {
  const args = process.argv.slice(2);
  const options: Partial<GeneratorOptions> = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    
    switch (key) {
      case 'service':
        options.service = value;
        break;
      case 'category':
        options.category = value;
        break;
      case 'id':
        options.id = value;
        break;
      case 'name':
        options.name = value;
        break;
      case 'description':
        options.description = value;
        break;
      case 'priority':
        options.priority = value;
        break;
      case 'operations':
        options.operations = value.split(',');
        break;
      case 'help':
        printUsage();
        process.exit(0);
    }
  }
  
  // Validate required options
  const required = ['service', 'category', 'id', 'name'];
  const missing = required.filter(r => !options[r as keyof GeneratorOptions]);
  
  if (missing.length > 0) {
    console.error(`Error: Missing required options: ${missing.join(', ')}`);
    printUsage();
    process.exit(1);
  }
  
  return options as GeneratorOptions;
}

function printUsage(): void {
  console.log(`
Scenario Generator CLI

Usage:
  npx ts-node scripts/generate-scenario.ts [options]

Required Options:
  --service <name>      Service name (e.g., addonman, downloader)
  --category <type>     Scenario category (baseline, single-fault, compound-fault, data-integrity, e2e)
  --id <id>             Scenario ID (e.g., am-bl01, dl-sf02)
  --name <name>         Scenario name (e.g., "Addonman Golden Baseline")

Optional:
  --description <text>  Scenario description
  --priority <P0-P3>    Priority level (default: P1)
  --operations <list>   Comma-separated list of operations
  --help                Show this help

Examples:
  npx ts-node scripts/generate-scenario.ts \\
    --service addonman \\
    --category baseline \\
    --id am-bl01 \\
    --name "Addonman Golden Baseline"
  
  npx ts-node scripts/generate-scenario.ts \\
    --service downloader \\
    --category single-fault \\
    --id dl-sf01 \\
    --name "Downloader Storage Failure" \\
    --priority P0 \\
    --operations "list,download,status"
`);
}

// Main execution
const options = parseArgs();
generateFiles(options);
