# Addonman Scenarios

Performance test scenarios for Addonman (API Gateway for NS Client communications).

## Folder Structure

```
scenarios/addonman/
├── README.md
├── baseline/              # AM-01+ baseline scenarios
├── single-fault/          # Single fault injection scenarios
├── compound-fault/        # Compound fault scenarios
├── data-integrity/        # Data integrity scenarios
└── e2e/                   # E2E scenarios
```

## Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Baseline | `am-bl` | `am-bl01-golden-baseline.ts` |
| Single Fault | `am-sf` | `am-sf01-redis-restart.ts` |
| Compound Fault | `am-cf` | `am-cf01-redis-db-slow.ts` |
| Data Integrity | `am-di` | `am-di01-concurrent-requests.ts` |

## Config Files

Each scenario needs a corresponding YAML config in:
`config/workloads/addonman/`

## Reference

- Operations: `operations/addonman/`
- See `scenarios/client-oppy/` for working examples
