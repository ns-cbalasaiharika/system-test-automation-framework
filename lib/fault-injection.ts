/**
 * Fault Injection Orchestration
 * 
 * Provides programmatic control over fault injection during tests.
 * Integrates with Kubernetes and chaos engineering tools.
 */

import http from 'k6/http';
import type { FaultConfig, FaultPhase, RuntimeConfig } from '../types/config';

// =============================================================================
// Types
// =============================================================================

export interface FaultExecutionResult {
  fault: FaultConfig;
  success: boolean;
  message: string;
  startedAt?: number;
  completedAt?: number;
}

export interface FaultOrchestrator {
  executeSetupFaults(): FaultExecutionResult[];
  executeTeardownFaults(): FaultExecutionResult[];
  scheduleDuringFaults(testDurationMs: number): void;
  getResults(): FaultExecutionResult[];
}

// =============================================================================
// Fault Execution
// =============================================================================

/**
 * Execute a fault injection command.
 * In k6, we can't run shell commands directly, so we call a fault injection API.
 */
function executeFault(
  fault: FaultConfig,
  faultApiUrl?: string
): FaultExecutionResult {
  const result: FaultExecutionResult = {
    fault,
    success: false,
    message: '',
    startedAt: Date.now(),
  };

  if (!faultApiUrl) {
    // Log fault for manual execution or external orchestrator
    console.log(`[FAULT] Would inject: ${fault.type} on ${fault.target}`);
    result.success = true;
    result.message = 'Logged for external orchestration';
    result.completedAt = Date.now();
    return result;
  }

  try {
    const payload = {
      type: fault.type,
      target: fault.target,
      duration: fault.duration || '30s',
      params: fault.params || {},
    };

    const response = http.post(
      `${faultApiUrl}/faults/inject`,
      JSON.stringify(payload),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: '60s',
      }
    );

    if (response.status >= 200 && response.status < 300) {
      result.success = true;
      result.message = `Fault injected: ${fault.type} on ${fault.target}`;
    } else {
      result.message = `Failed to inject fault: HTTP ${response.status}`;
    }
  } catch (error) {
    result.message = `Error injecting fault: ${error}`;
  }

  result.completedAt = Date.now();
  return result;
}

/**
 * Parse trigger time from config (e.g., "50%", "2m", "30s")
 */
function parseTriggerTime(trigger: string, testDurationMs: number): number {
  if (trigger.endsWith('%')) {
    const percent = parseFloat(trigger.slice(0, -1));
    return (percent / 100) * testDurationMs;
  }
  
  if (trigger.endsWith('m')) {
    return parseFloat(trigger.slice(0, -1)) * 60 * 1000;
  }
  
  if (trigger.endsWith('s')) {
    return parseFloat(trigger.slice(0, -1)) * 1000;
  }
  
  return parseInt(trigger, 10);
}

// =============================================================================
// Fault Orchestrator
// =============================================================================

class FaultOrchestratorImpl implements FaultOrchestrator {
  private faults: FaultConfig[];
  private faultApiUrl?: string;
  private results: FaultExecutionResult[] = [];
  private scheduledFaults: Array<{ fault: FaultConfig; triggerAtMs: number }> = [];

  constructor(config: RuntimeConfig) {
    this.faults = config.scenario.faults || [];
    // Fault API URL can be configured in environment
    this.faultApiUrl = config.env.services['fault-injection-api'] as string | undefined;
  }

  /**
   * Execute all faults configured for the setup phase
   */
  executeSetupFaults(): FaultExecutionResult[] {
    const setupFaults = this.faults.filter(f => f.phase === 'setup');
    
    for (const fault of setupFaults) {
      const result = executeFault(fault, this.faultApiUrl);
      this.results.push(result);
      
      if (result.success) {
        console.log(`[SETUP FAULT] ${result.message}`);
      } else {
        console.warn(`[SETUP FAULT FAILED] ${result.message}`);
      }
    }
    
    return this.results.filter(r => r.fault.phase === 'setup');
  }

  /**
   * Execute all faults configured for the teardown phase
   */
  executeTeardownFaults(): FaultExecutionResult[] {
    const teardownFaults = this.faults.filter(f => f.phase === 'teardown');
    
    for (const fault of teardownFaults) {
      const result = executeFault(fault, this.faultApiUrl);
      this.results.push(result);
      
      if (result.success) {
        console.log(`[TEARDOWN FAULT] ${result.message}`);
      } else {
        console.warn(`[TEARDOWN FAULT FAILED] ${result.message}`);
      }
    }
    
    return this.results.filter(r => r.fault.phase === 'teardown');
  }

  /**
   * Schedule faults to be executed during the test.
   * Note: In k6, we can't truly schedule async tasks, so this logs the schedule
   * and relies on an external orchestrator or uses the fault API's scheduling.
   */
  scheduleDuringFaults(testDurationMs: number): void {
    const duringFaults = this.faults.filter(f => f.phase === 'during');
    
    for (const fault of duringFaults) {
      const triggerAtMs = fault.trigger_at 
        ? parseTriggerTime(fault.trigger_at, testDurationMs)
        : testDurationMs / 2; // Default to middle of test
      
      this.scheduledFaults.push({ fault, triggerAtMs });
      
      if (this.faultApiUrl) {
        // Schedule via API
        try {
          const payload = {
            type: fault.type,
            target: fault.target,
            duration: fault.duration || '30s',
            params: fault.params || {},
            delay_ms: triggerAtMs,
          };
          
          http.post(
            `${this.faultApiUrl}/faults/schedule`,
            JSON.stringify(payload),
            { headers: { 'Content-Type': 'application/json' } }
          );
          
          console.log(`[SCHEDULED FAULT] ${fault.type} on ${fault.target} at ${triggerAtMs}ms`);
        } catch (error) {
          console.warn(`[SCHEDULE FAULT FAILED] ${error}`);
        }
      } else {
        console.log(`[SCHEDULED FAULT] ${fault.type} on ${fault.target} at ${triggerAtMs}ms (manual)`);
      }
    }
  }

  /**
   * Get all fault execution results
   */
  getResults(): FaultExecutionResult[] {
    return this.results;
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create a fault orchestrator for the given configuration
 */
export function createFaultOrchestrator(config: RuntimeConfig): FaultOrchestrator {
  return new FaultOrchestratorImpl(config);
}

/**
 * Check if the scenario has any faults configured
 */
export function hasFaults(config: RuntimeConfig): boolean {
  return (config.scenario.faults?.length ?? 0) > 0;
}

/**
 * Get faults by phase
 */
export function getFaultsByPhase(config: RuntimeConfig, phase: FaultPhase): FaultConfig[] {
  return (config.scenario.faults || []).filter(f => f.phase === phase);
}

/**
 * Execute a single fault immediately (for manual triggering in VU code)
 */
export function injectFault(
  fault: FaultConfig,
  faultApiUrl?: string
): FaultExecutionResult {
  return executeFault(fault, faultApiUrl);
}
