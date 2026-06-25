# Enrollment Scenarios

Performance test scenarios for Enrollment and Certificate services.

## Folder Structure

```
scenarios/enrollment/
├── README.md
├── baseline/              # EN-01+ baseline scenarios
├── single-fault/          # Single fault injection scenarios
├── compound-fault/        # Compound fault scenarios
└── data-integrity/        # Data integrity scenarios
```

## Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Baseline | `en-bl` | `en-bl01-golden-baseline.ts` |
| Single Fault | `en-sf` | `en-sf01-cert-service-slow.ts` |
| Compound Fault | `en-cf` | `en-cf01-cert-db-slow.ts` |
| Data Integrity | `en-di` | `en-di01-concurrent-enroll.ts` |

## Config Files

Each scenario needs a corresponding YAML config in:
`config/workloads/enrollment/`

## Reference

- Operations: `operations/enrollment/`
- See `scenarios/client-oppy/` for working examples
