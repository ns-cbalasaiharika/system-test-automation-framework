# Addonman Baseline Scenarios

Baseline performance scenarios for Addonman service.

## What to Add Here

Baseline scenarios establish performance benchmarks under normal conditions.

## Naming

- Prefix: `am-bl`
- Example: `am-bl01-golden-baseline.ts`

## Suggested Scenarios

| ID | Name | Description |
|----|------|-------------|
| AM-BL01 | Golden Baseline | Establish p50/p95/p99 latency baselines |
| AM-BL02 | Write Heavy | High rate of config updates |
| AM-BL03 | Capacity Ceiling | Ramp to find breaking point |

## Reference

- See `scenarios/client-oppy/baseline/` for examples
- Config: `config/workloads/addonman/am-bl*.yaml`
