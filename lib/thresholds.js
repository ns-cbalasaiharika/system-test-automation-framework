/**
 * Builds k6 thresholds object from scenario SLOs with profile multiplier.
 *
 * SLO format: { "latency_get_configs": { "p50": 100, "p95": 500, "p99": 1000 } }
 * Multiplier: smoke=5x (relaxed), load=1x (strict), stress=2x (relaxed)
 *
 * Output: { "latency_get_configs": ["p(50)<500", "p(95)<2500", "p(99)<5000"] }
 */
export function buildThresholds(slos, multiplier) {
  const thresholds = {};

  for (const [metricName, limits] of Object.entries(slos)) {
    if (metricName === "errors") {
      const adjustedRate = Math.min(limits.rate * multiplier, 1.0);
      thresholds[metricName] = [`rate<${adjustedRate}`];
      continue;
    }

    const conditions = [];
    for (const [percentile, value] of Object.entries(limits)) {
      const adjustedValue = Math.round(value * multiplier);
      const pLabel = percentile.replace("p", "p(") + ")";
      conditions.push(`${pLabel}<${adjustedValue}`);
    }
    thresholds[metricName] = conditions;
  }

  return thresholds;
}
