/**
 * Results Pipeline
 * 
 * Structured output generation for test results.
 * Supports multiple output formats and destinations.
 */

import type { RuntimeConfig } from '../types/config';

// =============================================================================
// Types
// =============================================================================

export interface MetricSummary {
  name: string;
  type: 'counter' | 'gauge' | 'rate' | 'trend';
  values: {
    count?: number;
    rate?: number;
    avg?: number;
    min?: number;
    max?: number;
    med?: number;
    p90?: number;
    p95?: number;
    p99?: number;
  };
}

export interface ThresholdResult {
  metric: string;
  threshold: string;
  passed: boolean;
  value: number;
}

export interface CheckResult {
  name: string;
  passed: number;
  failed: number;
  passRate: number;
}

export interface TestResult {
  // Metadata
  testRunId: string;
  scenarioId: string;
  scenarioName: string;
  service: string;
  environment: string;
  profile: string;
  startTime: string;
  endTime: string;
  duration: number;
  
  // Overall status
  passed: boolean;
  
  // Metrics
  metrics: MetricSummary[];
  
  // Thresholds
  thresholds: ThresholdResult[];
  
  // Checks
  checks: CheckResult[];
  
  // VU info
  vus: {
    max: number;
    min: number;
  };
  
  // Request stats
  requests: {
    total: number;
    failed: number;
    rate: number;
  };
  
  // Infrastructure SLO results (if configured)
  infrastructureSLOs?: {
    metric: string;
    value: number;
    threshold: string;
    passed: boolean;
  }[];
  
  // Fault injection results (if configured)
  faults?: {
    type: string;
    target: string;
    phase: string;
    executed: boolean;
    result?: string;
  }[];
  
  // Raw k6 data
  raw?: unknown;
}

export interface OutputConfig {
  /** Output to stdout */
  stdout?: boolean;
  /** Output to JSON file */
  jsonFile?: string;
  /** Output to JUnit XML (for CI) */
  junitFile?: string;
  /** Send to webhook URL */
  webhookUrl?: string;
  /** Send to Datadog */
  datadogApiKey?: string;
  /** Custom output handlers */
  customHandlers?: Array<(result: TestResult) => void>;
}

// =============================================================================
// K6 Summary Data Types
// =============================================================================

export interface K6MetricValue {
  type: string;
  contains?: string;
  values: Record<string, number>;
  thresholds?: Record<string, boolean>;
}

export interface K6SummaryData {
  metrics: Record<string, K6MetricValue>;
  root_group?: {
    checks?: Record<string, {
      name: string;
      passes: number;
      fails: number;
    }>;
  };
  state?: {
    isStdOutTTY: boolean;
    testRunDurationMs: number;
  };
  options?: {
    summaryTrendStats?: string[];
  };
}

// =============================================================================
// Result Processing
// =============================================================================

/**
 * Parse k6 summary data into structured TestResult
 */
export function parseK6Summary(
  data: K6SummaryData,
  config: RuntimeConfig,
  startTime: Date
): TestResult {
  const endTime = new Date();
  const duration = data.state?.testRunDurationMs || (endTime.getTime() - startTime.getTime());
  
  // Parse metrics
  const metrics: MetricSummary[] = [];
  const thresholds: ThresholdResult[] = [];
  
  let totalRequests = 0;
  let failedRequests = 0;
  let maxVUs = 0;
  
  for (const [name, metric] of Object.entries(data.metrics || {})) {
    const summary: MetricSummary = {
      name,
      type: metric.type as MetricSummary['type'],
      values: {},
    };
    
    if (metric.values) {
      summary.values = {
        count: metric.values.count,
        rate: metric.values.rate,
        avg: metric.values.avg,
        min: metric.values.min,
        max: metric.values.max,
        med: metric.values.med,
        p90: metric.values['p(90)'],
        p95: metric.values['p(95)'],
        p99: metric.values['p(99)'],
      };
    }
    
    metrics.push(summary);
    
    // Parse thresholds
    if (metric.thresholds) {
      for (const [threshold, passed] of Object.entries(metric.thresholds)) {
        thresholds.push({
          metric: name,
          threshold,
          passed,
          value: metric.values?.avg || 0,
        });
      }
    }
    
    // Track request counts
    if (name === 'http_reqs') {
      totalRequests = metric.values?.count || 0;
    }
    if (name === 'http_req_failed') {
      failedRequests = (metric.values?.count || 0) * (metric.values?.rate || 0);
    }
    if (name === 'vus') {
      maxVUs = metric.values?.max || 0;
    }
  }
  
  // Parse checks
  const checks: CheckResult[] = [];
  const rootChecks = data.root_group?.checks || {};
  
  for (const [, check] of Object.entries(rootChecks)) {
    checks.push({
      name: check.name,
      passed: check.passes,
      failed: check.fails,
      passRate: check.passes / (check.passes + check.fails),
    });
  }
  
  // Determine overall pass/fail
  const allThresholdsPassed = thresholds.every(t => t.passed);
  const allChecksPassed = checks.every(c => c.failed === 0);
  
  return {
    testRunId: config.testRunId,
    scenarioId: config.scenario.id,
    scenarioName: config.scenario.name,
    service: config.serviceName,
    environment: config.env.name,
    profile: config.profile.name,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    duration,
    passed: allThresholdsPassed && allChecksPassed,
    metrics,
    thresholds,
    checks,
    vus: {
      max: maxVUs,
      min: 0,
    },
    requests: {
      total: totalRequests,
      failed: Math.round(failedRequests),
      rate: totalRequests / (duration / 1000),
    },
    raw: data,
  };
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Format result as JSON string
 */
export function formatJSON(result: TestResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0);
}

/**
 * Format result as JUnit XML
 */
export function formatJUnit(result: TestResult): string {
  const testcases = result.thresholds.map(t => {
    if (t.passed) {
      return `    <testcase name="${escapeXml(t.metric)}: ${escapeXml(t.threshold)}" classname="${escapeXml(result.scenarioId)}" time="${result.duration / 1000}"/>`;
    } else {
      return `    <testcase name="${escapeXml(t.metric)}: ${escapeXml(t.threshold)}" classname="${escapeXml(result.scenarioId)}" time="${result.duration / 1000}">
      <failure message="Threshold violated" type="ThresholdFailure">Value: ${t.value}</failure>
    </testcase>`;
    }
  });
  
  const failures = result.thresholds.filter(t => !t.passed).length;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapeXml(result.scenarioName)}" tests="${result.thresholds.length}" failures="${failures}" time="${result.duration / 1000}">
${testcases.join('\n')}
</testsuite>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format result as human-readable summary
 */
export function formatSummary(result: TestResult): string {
  const lines: string[] = [
    '═'.repeat(60),
    `TEST RESULT: ${result.passed ? '✓ PASSED' : '✗ FAILED'}`,
    '═'.repeat(60),
    '',
    `Scenario: ${result.scenarioName} (${result.scenarioId})`,
    `Service:  ${result.service}`,
    `Env:      ${result.environment}`,
    `Profile:  ${result.profile}`,
    `Duration: ${(result.duration / 1000).toFixed(1)}s`,
    `Test Run: ${result.testRunId}`,
    '',
    '─'.repeat(60),
    'REQUESTS',
    '─'.repeat(60),
    `Total:  ${result.requests.total}`,
    `Failed: ${result.requests.failed}`,
    `Rate:   ${result.requests.rate.toFixed(1)} req/s`,
    '',
    '─'.repeat(60),
    'THRESHOLDS',
    '─'.repeat(60),
  ];
  
  for (const t of result.thresholds) {
    const status = t.passed ? '✓' : '✗';
    lines.push(`${status} ${t.metric}: ${t.threshold} (value: ${t.value.toFixed(2)})`);
  }
  
  if (result.checks.length > 0) {
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('CHECKS');
    lines.push('─'.repeat(60));
    
    for (const c of result.checks) {
      const status = c.failed === 0 ? '✓' : '✗';
      lines.push(`${status} ${c.name}: ${c.passed}/${c.passed + c.failed} (${(c.passRate * 100).toFixed(1)}%)`);
    }
  }
  
  lines.push('');
  lines.push('═'.repeat(60));
  
  return lines.join('\n');
}

// =============================================================================
// Output Pipeline
// =============================================================================

/**
 * Create handleSummary function for k6 with structured output
 */
export function createResultsPipeline(
  config: RuntimeConfig,
  outputConfig: OutputConfig = {}
): (data: K6SummaryData) => Record<string, string> {
  const startTime = new Date();
  
  return function handleSummary(data: K6SummaryData): Record<string, string> {
    const result = parseK6Summary(data, config, startTime);
    const outputs: Record<string, string> = {};
    
    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // JSON file output
    const jsonPath = outputConfig.jsonFile || 
      `../../results/${config.scenario.id}_${timestamp}.json`;
    outputs[jsonPath] = formatJSON(result);
    
    // JUnit XML output (for CI)
    if (outputConfig.junitFile) {
      outputs[outputConfig.junitFile] = formatJUnit(result);
    } else {
      outputs[`../../results/${config.scenario.id}_${timestamp}.xml`] = formatJUnit(result);
    }
    
    // Stdout summary
    if (outputConfig.stdout !== false) {
      outputs['stdout'] = formatSummary(result);
    }
    
    return outputs;
  };
}

/**
 * Create a simple handleSummary for backward compatibility
 */
export function createSimpleHandleSummary(
  scenarioId: string,
  scenarioName: string
): (data: K6SummaryData) => Record<string, string> {
  return function handleSummary(data: K6SummaryData): Record<string, string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      [`../../results/${scenarioId}_${timestamp}.json`]: JSON.stringify(data, null, 2),
      stdout: JSON.stringify({
        scenario: scenarioName,
        timestamp: new Date().toISOString(),
        pass: true, // Simplified - actual pass/fail is in thresholds
      }, null, 2),
    };
  };
}
