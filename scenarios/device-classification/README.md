# Device Classification Scenarios

Performance test scenarios for Device Classification services.

## Folder Structure

```
scenarios/device-classification/
├── README.md
├── baseline/              # DC-01+ baseline scenarios
├── single-fault/          # Single fault injection scenarios
├── compound-fault/        # Compound fault scenarios
└── data-integrity/        # Data integrity scenarios
```

## Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Baseline | `dc-bl` | `dc-bl01-golden-baseline.ts` |
| Single Fault | `dc-sf` | `dc-sf01-evaluator-slow.ts` |
| Compound Fault | `dc-cf` | `dc-cf01-config-eval-slow.ts` |
| Data Integrity | `dc-di` | `dc-di01-concurrent-classify.ts` |

## Config Files

Each scenario needs a corresponding YAML config in:
`config/workloads/device-classification/`

## Reference

- Operations: `operations/device-classification/`
- See `scenarios/client-oppy/` for working examples
