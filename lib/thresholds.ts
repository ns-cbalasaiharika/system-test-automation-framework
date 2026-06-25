import type { SLOConfig, LatencySLO, ErrorSLO, K6Thresholds, RuntimeConfig } from '../types/config';

/**
 * Type guard to check if an SLO is an error rate SLO.
 */
function isErrorSLO(slo: LatencySLO | ErrorSLO): slo is ErrorSLO {
  return 'rate' in slo;
}

/**
 * Builds k6 thresholds object from scenario SLOs with profile multiplier.
 *
 * Accepts either (slos, multiplier) or (config) for convenience.
 *
 * SLO format: { "latency_get_configs": { "p50": 100, "p95": 500, "p99": 1000 } }
 * Multiplier: smoke=5x (relaxed), load=1x (strict), stress=2x (relaxed)
 *
 * Output: { "latency_get_configs": ["p(50)<500", "p(95)<2500", "p(99)<5000"] }
 */
export function buildThresholds(config: RuntimeConfig): K6Thresholds;
export function buildThresholds(slos: SLOConfig, multiplier: number): K6Thresholds;
export function buildThresholds(
  slosOrConfig: SLOConfig | RuntimeConfig, 
  multiplier?: number
): K6Thresholds {
  // Check if first argument is RuntimeConfig (has slos and thresholdMultiplier properties)
  const isRuntimeConfig = (arg: unknown): arg is RuntimeConfig => {
    return typeof arg === 'object' && arg !== null && 
           'slos' in arg && 'thresholdMultiplier' in arg;
  };
  
  if (isRuntimeConfig(slosOrConfig)) {
    return buildThresholdsImpl(slosOrConfig.slos, slosOrConfig.thresholdMultiplier);
  }
  
  // Otherwise it's the old signature with SLOConfig
  return buildThresholdsImpl(slosOrConfig, multiplier ?? 1.0);
}

function buildThresholdsImpl(slos: SLOConfig, multiplier: number): K6Thresholds {
  const thresholds: K6Thresholds = {};

  for (const [metricName, limits] of Object.entries(slos)) {
    if (isErrorSLO(limits)) {
      const adjustedRate = Math.min(limits.rate * multiplier, 1.0);
      thresholds[metricName] = [`rate<${adjustedRate}`];
      continue;
    }

    const conditions: string[] = [];
    const latencyLimits = limits as LatencySLO;
    
    if (latencyLimits.p50 !== undefined) {
      const adjustedValue = Math.round(latencyLimits.p50 * multiplier);
      conditions.push(`p(50)<${adjustedValue}`);
    }
    if (latencyLimits.p95 !== undefined) {
      const adjustedValue = Math.round(latencyLimits.p95 * multiplier);
      conditions.push(`p(95)<${adjustedValue}`);
    }
    if (latencyLimits.p99 !== undefined) {
      const adjustedValue = Math.round(latencyLimits.p99 * multiplier);
      conditions.push(`p(99)<${adjustedValue}`);
    }
    
    if (conditions.length > 0) {
      thresholds[metricName] = conditions;
    }
  }

  return thresholds;
}

/**
 * Merge multiple threshold objects together.
 * Useful when combining thresholds from different sources.
 */
export function mergeThresholds(...thresholdSets: K6Thresholds[]): K6Thresholds {
  const merged: K6Thresholds = {};

  for (const thresholds of thresholdSets) {
    for (const [metricName, conditions] of Object.entries(thresholds)) {
      if (!merged[metricName]) {
        merged[metricName] = [];
      }
      merged[metricName].push(...conditions);
    }
  }

  return merged;
}

/**
 * Create default thresholds for a service based on standard latency expectations.
 */
export function createDefaultThresholds(
  serviceName: string,
  operations: string[],
  defaults: LatencySLO = { p50: 100, p95: 500, p99: 1000 }
): K6Thresholds {
  const thresholds: K6Thresholds = {};

  for (const op of operations) {
    const metricName = `latency_${serviceName}_${op}`;
    const conditions: string[] = [];
    
    if (defaults.p50 !== undefined) {
      conditions.push(`p(50)<${defaults.p50}`);
    }
    if (defaults.p95 !== undefined) {
      conditions.push(`p(95)<${defaults.p95}`);
    }
    if (defaults.p99 !== undefined) {
      conditions.push(`p(99)<${defaults.p99}`);
    }
    
    thresholds[metricName] = conditions;
  }

  return thresholds;
}
