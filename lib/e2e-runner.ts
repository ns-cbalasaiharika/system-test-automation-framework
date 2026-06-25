/**
 * E2E Flow Runner
 * 
 * Executes multi-service end-to-end flows defined in scenario configuration.
 * Supports data passing between steps and response validation.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import type { RuntimeConfig, E2EFlowConfig, E2EStep } from '../types/config';
import { weightedSelect } from './utils';
import { getOrCreateTrend, getOrCreateCounter } from './metrics';

// =============================================================================
// Types
// =============================================================================

export interface E2EStepResult {
  step: E2EStep;
  success: boolean;
  status?: number;
  duration: number;
  data?: unknown;
  error?: string;
}

export interface E2EFlowResult {
  flow: E2EFlowConfig;
  success: boolean;
  duration: number;
  stepResults: E2EStepResult[];
}

export interface E2EContext {
  /** Results from previous steps, keyed by step index */
  stepData: Map<number, unknown>;
  /** Config for the current test */
  config: RuntimeConfig;
  /** Headers to use for requests */
  headers: Record<string, string>;
}

// =============================================================================
// Step Execution
// =============================================================================

/**
 * Resolve template variables in payload using context data
 * Supports ${stepN.field} syntax to reference previous step results
 */
function resolvePayload(
  payload: Record<string, unknown> | undefined,
  context: E2EContext
): Record<string, unknown> {
  if (!payload) return {};
  
  const resolved: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      // Parse template: ${step0.id} or ${step1.data.name}
      const template = value.slice(2, -1);
      const [stepRef, ...pathParts] = template.split('.');
      
      const stepMatch = stepRef.match(/step(\d+)/);
      if (stepMatch) {
        const stepIndex = parseInt(stepMatch[1], 10);
        const stepData = context.stepData.get(stepIndex) as Record<string, unknown>;
        
        if (stepData) {
          let result: unknown = stepData;
          for (const part of pathParts) {
            result = (result as Record<string, unknown>)?.[part];
          }
          resolved[key] = result;
          continue;
        }
      }
    }
    
    resolved[key] = value;
  }
  
  return resolved;
}

/**
 * Execute a single E2E step
 */
function executeStep(
  step: E2EStep,
  stepIndex: number,
  context: E2EContext
): E2EStepResult {
  const startTime = Date.now();
  const result: E2EStepResult = {
    step,
    success: false,
    duration: 0,
  };
  
  try {
    // Get service URL
    const serviceUrl = context.config.env.services[step.service];
    if (!serviceUrl) {
      result.error = `Service ${step.service} not found in environment`;
      result.duration = Date.now() - startTime;
      return result;
    }
    
    // Resolve payload
    const payload = resolvePayload(step.payload, context);
    
    // Determine HTTP method and path based on operation
    const { method, path } = parseOperation(step.operation);
    const url = `${serviceUrl}${path}`;
    
    // Execute request
    let response;
    if (method === 'GET') {
      response = http.get(url, { headers: context.headers });
    } else if (method === 'POST') {
      response = http.post(url, JSON.stringify(payload), { headers: context.headers });
    } else if (method === 'PUT') {
      response = http.put(url, JSON.stringify(payload), { headers: context.headers });
    } else if (method === 'PATCH') {
      response = http.patch(url, JSON.stringify(payload), { headers: context.headers });
    } else if (method === 'DELETE') {
      response = http.del(url, null, { headers: context.headers });
    } else {
      result.error = `Unknown HTTP method: ${method}`;
      result.duration = Date.now() - startTime;
      return result;
    }
    
    result.status = response.status;
    result.duration = Date.now() - startTime;
    
    // Parse response data
    try {
      result.data = JSON.parse(response.body as string);
    } catch {
      result.data = response.body;
    }
    
    // Store in context for subsequent steps
    context.stepData.set(stepIndex, result.data);
    
    // Validate response
    let checksPassed = true;
    
    if (step.expect) {
      if (step.expect.status) {
        checksPassed = check(response, {
          [`step${stepIndex}_status`]: (r) => r.status === step.expect!.status,
        }) && checksPassed;
      }
      
      if (step.expect.body_contains) {
        const bodyStr = response.body as string;
        for (const expected of step.expect.body_contains) {
          checksPassed = check(null, {
            [`step${stepIndex}_contains_${expected}`]: () => bodyStr.includes(expected),
          }) && checksPassed;
        }
      }
    } else {
      // Default: expect 2xx status
      checksPassed = check(response, {
        [`step${stepIndex}_success`]: (r) => r.status >= 200 && r.status < 300,
      });
    }
    
    result.success = checksPassed;
    
    // Think time between steps
    if (step.think_time_ms) {
      sleep(step.think_time_ms / 1000);
    }
    
  } catch (error) {
    result.error = String(error);
    result.duration = Date.now() - startTime;
  }
  
  return result;
}

/**
 * Parse operation string into HTTP method and path
 * Supports formats like: "GET /api/v1/users" or "POST:/api/v1/items"
 */
function parseOperation(operation: string): { method: string; path: string } {
  // Check for "METHOD /path" format
  const spaceMatch = operation.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
  if (spaceMatch) {
    return { method: spaceMatch[1].toUpperCase(), path: spaceMatch[2] };
  }
  
  // Check for "METHOD:/path" format
  const colonMatch = operation.match(/^(GET|POST|PUT|PATCH|DELETE):(.+)$/i);
  if (colonMatch) {
    return { method: colonMatch[1].toUpperCase(), path: colonMatch[2] };
  }
  
  // Default to GET with operation as path
  return { method: 'GET', path: operation.startsWith('/') ? operation : `/${operation}` };
}

// =============================================================================
// Flow Execution
// =============================================================================

/**
 * Execute an E2E flow
 */
function executeFlow(
  flow: E2EFlowConfig,
  config: RuntimeConfig
): E2EFlowResult {
  const startTime = Date.now();
  const context: E2EContext = {
    stepData: new Map(),
    config,
    headers: config.headers,
  };
  
  const stepResults: E2EStepResult[] = [];
  let allSuccess = true;
  
  // Get or create metrics for this flow
  const flowLatency = getOrCreateTrend(`e2e_${flow.name.replace(/\s+/g, '_')}_duration`);
  const flowSuccess = getOrCreateCounter(`e2e_${flow.name.replace(/\s+/g, '_')}_success`);
  const flowFailure = getOrCreateCounter(`e2e_${flow.name.replace(/\s+/g, '_')}_failure`);
  
  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const stepResult = executeStep(step, i, context);
    stepResults.push(stepResult);
    
    // Record step metrics
    const stepLatency = getOrCreateTrend(`e2e_${flow.name.replace(/\s+/g, '_')}_step${i}_duration`);
    stepLatency.add(stepResult.duration);
    
    if (!stepResult.success) {
      allSuccess = false;
      console.warn(`[E2E] Flow "${flow.name}" step ${i} failed: ${stepResult.error || `HTTP ${stepResult.status}`}`);
      // Continue or break based on flow configuration (could be configurable)
      break;
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Record flow metrics
  flowLatency.add(totalDuration);
  if (allSuccess) {
    flowSuccess.add(1);
  } else {
    flowFailure.add(1);
  }
  
  return {
    flow,
    success: allSuccess,
    duration: totalDuration,
    stepResults,
  };
}

// =============================================================================
// E2E Runner
// =============================================================================

export interface E2ERunner {
  /** Execute a random flow based on traffic weights */
  runRandomFlow(): E2EFlowResult | null;
  /** Execute a specific flow by name */
  runFlow(flowName: string): E2EFlowResult | null;
  /** Execute all flows sequentially */
  runAllFlows(): E2EFlowResult[];
  /** Get available flow names */
  getFlowNames(): string[];
}

class E2ERunnerImpl implements E2ERunner {
  private flows: E2EFlowConfig[];
  private config: RuntimeConfig;
  private trafficMix: Record<string, number>;

  constructor(config: RuntimeConfig) {
    this.flows = config.scenario.e2eFlows || [];
    this.config = config;
    
    // Build traffic mix from flow weights
    this.trafficMix = {};
    for (const flow of this.flows) {
      this.trafficMix[flow.name] = flow.weight;
    }
  }

  runRandomFlow(): E2EFlowResult | null {
    if (this.flows.length === 0) return null;
    
    const flowName = weightedSelect(this.trafficMix);
    return this.runFlow(flowName);
  }

  runFlow(flowName: string): E2EFlowResult | null {
    const flow = this.flows.find(f => f.name === flowName);
    if (!flow) {
      console.warn(`[E2E] Flow "${flowName}" not found`);
      return null;
    }
    
    return executeFlow(flow, this.config);
  }

  runAllFlows(): E2EFlowResult[] {
    return this.flows.map(flow => executeFlow(flow, this.config));
  }

  getFlowNames(): string[] {
    return this.flows.map(f => f.name);
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create an E2E runner for the given configuration
 */
export function createE2ERunner(config: RuntimeConfig): E2ERunner {
  return new E2ERunnerImpl(config);
}

/**
 * Check if the scenario has E2E flows configured
 */
export function hasE2EFlows(config: RuntimeConfig): boolean {
  return (config.scenario.e2eFlows?.length ?? 0) > 0;
}

/**
 * Run a single E2E iteration (for use in VU code)
 */
export function runE2EIteration(config: RuntimeConfig): E2EFlowResult | null {
  const runner = createE2ERunner(config);
  return runner.runRandomFlow();
}
