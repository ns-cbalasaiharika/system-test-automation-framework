# Provisioner Scenarios

Performance test scenarios for Provisioner services.

## Folder Structure

```
scenarios/provisioner/
├── README.md
├── baseline/              # PV-01+ baseline scenarios
├── single-fault/          # Single fault injection scenarios
├── compound-fault/        # Compound fault scenarios
└── data-integrity/        # Data integrity scenarios
```

## Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Baseline | `pv-bl` | `pv-bl01-golden-baseline.ts` |
| Single Fault | `pv-sf` | `pv-sf01-db-failover.ts` |
| Compound Fault | `pv-cf` | `pv-cf01-db-redis-slow.ts` |
| Data Integrity | `pv-di` | `pv-di01-concurrent-status.ts` |

## Config Files

Each scenario needs a corresponding YAML config in:
`config/scenarios/provisioner/`

## Reference

- Operations: `operations/provisioner/`
- See `scenarios/client-oppy/` for working examples
