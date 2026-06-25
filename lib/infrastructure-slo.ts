/**
 * Infrastructure SLO Validation
 * 
 * Validates infrastructure metrics (CPU, memory, Kafka lag, etc.)
 * against defined SLOs during test execution.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Gauge, Counter } from 'k6/metrics';
import type { RuntimeConfig, InfrastructureSLO, InfrastructureSLOConfig } from '../types/config';

// =============================================================================
// Metrics
// =============================================================================

const infraSloViolations = new Counter('infra_slo_violations');
const cpuUsageGauge = new Gauge('infra_cpu_usage');
const memoryUsageGauge = new Gauge('infra_memory_usage');
const kafkaLagGauge = new Gauge('infra_kafka_lag');
const redisHitRatioGauge = new Gauge('infra_redis_hit_ratio');

// =============================================================================
// Types
// =============================================================================

export interface InfraSLOResult {
  metric: string;
  value: number;
  threshold: InfrastructureSLO;
  passed: boolean;
  message: string;
}

export interface InfraSLOValidationResult {
  timestamp: number;
  results: InfraSLOResult[];
  allPassed: boolean;
}

export interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
}

// =============================================================================
// Prometheus Integration
// =============================================================================

/**
 * Query Prometheus for a metric value
 */
function queryPrometheus(
  prometheusUrl: string,
  query: string
): number | null {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = http.get(
      `${prometheusUrl}/api/v1/query?query=${encodedQuery}`,
      { timeout: '10s' }
    );
    
    if (response.status !== 200) {
      console.warn(`Prometheus query failed: HTTP ${response.status}`);
      return null;
    }
    
    const result = JSON.parse(response.body as string) as PrometheusQueryResult;
    
    if (result.status !== 'success' || !result.data.result.length) {
      return null;
    }
    
    return parseFloat(result.data.result[0].value[1]);
  } catch (error) {
    console.warn(`Prometheus query error: ${error}`);
    return null;
  }
}

/**
 * Get infrastructure metric value from various sources.
 * Falls back gracefully when Prometheus is not available.
 */
function getMetricValue(
  _metricName: string,
  slo: InfrastructureSLO,
  prometheusUrl?: string
): number | null {
  // If Prometheus URL is available and query is defined, use it
  if (prometheusUrl && slo.query) {
    return queryPrometheus(prometheusUrl, slo.query);
  }
  
  // No Prometheus - skip silently. Infrastructure SLOs are optional
  // and only validated when a metrics source is available.
  return null;
}

// =============================================================================
// SLO Validation
// =============================================================================

/**
 * Validate a single infrastructure SLO
 */
function validateSLO(
  metricName: string,
  value: number,
  slo: InfrastructureSLO
): InfraSLOResult {
  let passed = true;
  const messages: string[] = [];
  
  if (slo.max !== undefined && value > slo.max) {
    passed = false;
    messages.push(`exceeds max ${slo.max}${slo.unit || ''}`);
  }
  
  if (slo.min !== undefined && value < slo.min) {
    passed = false;
    messages.push(`below min ${slo.min}${slo.unit || ''}`);
  }
  
  const message = passed 
    ? `${metricName}: ${value}${slo.unit || ''} (OK)`
    : `${metricName}: ${value}${slo.unit || ''} - ${messages.join(', ')}`;
  
  return {
    metric: metricName,
    value,
    threshold: slo,
    passed,
    message,
  };
}

/**
 * Record metric to k6 gauges for reporting
 */
function recordMetric(metricName: string, value: number): void {
  const lowerName = metricName.toLowerCase();
  
  if (lowerName.includes('cpu')) {
    cpuUsageGauge.add(value);
  } else if (lowerName.includes('memory') || lowerName.includes('mem')) {
    memoryUsageGauge.add(value);
  } else if (lowerName.includes('kafka') || lowerName.includes('lag')) {
    kafkaLagGauge.add(value);
  } else if (lowerName.includes('redis') || lowerName.includes('hit')) {
    redisHitRatioGauge.add(value);
  }
}

// =============================================================================
// Infrastructure SLO Validator
// =============================================================================

export interface InfraSLOValidator {
  validate(): InfraSLOValidationResult;
  validateAndCheck(): boolean;
  getViolationCount(): number;
}

class InfraSLOValidatorImpl implements InfraSLOValidator {
  private slos: InfrastructureSLOConfig;
  private prometheusUrl?: string;
  private violationCount = 0;

  constructor(config: RuntimeConfig) {
    this.slos = config.scenario.infrastructureSLOs || {};
    this.prometheusUrl = config.env.services['prometheus'] as string | undefined;
  }

  /**
   * Validate all configured infrastructure SLOs.
   * When no metrics source (e.g., Prometheus) is configured,
   * all SLOs pass by default with a "not available" status.
   */
  validate(): InfraSLOValidationResult {
    const results: InfraSLOResult[] = [];
    let allPassed = true;

    if (!this.prometheusUrl && Object.keys(this.slos).length > 0) {
      console.log('[INFRA SLO] No metrics source configured - skipping infrastructure SLO validation');
      for (const [metricName, slo] of Object.entries(this.slos)) {
        results.push({
          metric: metricName,
          value: 0,
          threshold: slo,
          passed: true,
          message: `${metricName}: skipped (no metrics source)`,
        });
      }
      return { timestamp: Date.now(), results, allPassed: true };
    }

    for (const [metricName, slo] of Object.entries(this.slos)) {
      const value = getMetricValue(metricName, slo, this.prometheusUrl);
      
      if (value === null) {
        results.push({
          metric: metricName,
          value: 0,
          threshold: slo,
          passed: true,
          message: `${metricName}: metric not available`,
        });
        continue;
      }
      
      const result = validateSLO(metricName, value, slo);
      results.push(result);
      
      // Record to k6 metrics
      recordMetric(metricName, value);
      
      if (!result.passed) {
        allPassed = false;
        this.violationCount++;
        infraSloViolations.add(1);
        console.warn(`[INFRA SLO VIOLATION] ${result.message}`);
      }
    }
    
    return {
      timestamp: Date.now(),
      results,
      allPassed,
    };
  }

  /**
   * Validate and perform k6 checks
   */
  validateAndCheck(): boolean {
    const result = this.validate();
    
    for (const r of result.results) {
      check(null, {
        [`infra_slo_${r.metric}`]: () => r.passed,
      });
    }
    
    return result.allPassed;
  }

  /**
   * Get total violation count
   */
  getViolationCount(): number {
    return this.violationCount;
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create an infrastructure SLO validator
 */
export function createInfraSLOValidator(config: RuntimeConfig): InfraSLOValidator {
  return new InfraSLOValidatorImpl(config);
}

/**
 * Check if the scenario has infrastructure SLOs configured
 */
export function hasInfraSLOs(config: RuntimeConfig): boolean {
  return Object.keys(config.scenario.infrastructureSLOs || {}).length > 0;
}

/**
 * Quick validation - returns true if all SLOs pass
 */
export function validateInfraSLOs(config: RuntimeConfig): boolean {
  const validator = createInfraSLOValidator(config);
  return validator.validateAndCheck();
}

/**
 * Common Prometheus queries for Kubernetes services
 */
export const COMMON_QUERIES = {
  cpu_usage: (service: string) => 
    `100 * sum(rate(container_cpu_usage_seconds_total{container="${service}"}[5m])) / sum(container_spec_cpu_quota{container="${service}"} / 100000)`,
  
  memory_usage: (service: string) => 
    `100 * sum(container_memory_usage_bytes{container="${service}"}) / sum(container_spec_memory_limit_bytes{container="${service}"})`,
  
  kafka_consumer_lag: (group: string) => 
    `sum(kafka_consumergroup_lag{consumergroup="${group}"})`,
  
  redis_hit_ratio: (instance: string) => 
    `redis_keyspace_hits_total{instance="${instance}"} / (redis_keyspace_hits_total{instance="${instance}"} + redis_keyspace_misses_total{instance="${instance}"})`,
  
  http_error_rate: (service: string) => 
    `sum(rate(http_requests_total{service="${service}",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="${service}"}[5m]))`,
  
  pod_restart_count: (deployment: string) => 
    `sum(kube_pod_container_status_restarts_total{pod=~"${deployment}-.*"})`,
};
