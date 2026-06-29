# User Manager Scenarios

Performance test scenarios for User Manager service.

**Note:** User Manager is a FATAL dependency for client-oppy write path.

## Folder Structure

```
scenarios/user-manager/
├── README.md
├── baseline/              # UM-01+ baseline scenarios
├── single-fault/          # Single fault injection scenarios
├── compound-fault/        # Compound fault scenarios
└── data-integrity/        # Data integrity scenarios
```

## Naming Convention

| Category | Prefix | Example |
|----------|--------|---------|
| Baseline | `um-bl` | `um-bl01-golden-baseline.ts` |
| Single Fault | `um-sf` | `um-sf01-ad-sync-timeout.ts` |
| Compound Fault | `um-cf` | `um-cf01-ad-db-slow.ts` |
| Data Integrity | `um-di` | `um-di01-concurrent-updates.ts` |

## Config Files

Each scenario needs a corresponding YAML config in:
`config/scenarios/user-manager/`

## Reference

- Operations: `operations/user-manager/`
- See `scenarios/client-oppy/` for working examples
