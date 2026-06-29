# Client-Oppy Scenarios

Performance test scenarios for Client-Oppy Configuration Service.

## Folder Structure

```
scenarios/client-oppy/
├── README.md
├── baseline/              # BL-01 to BL-10 baseline scenarios
├── single-fault/          # SF-01+ single fault injection scenarios
├── compound-fault/        # CF-01+ compound fault scenarios
├── data-integrity/        # DI-01+ data integrity scenarios
├── deployment/            # DP-01+ deployment scenarios
└── e2e/                   # E2E scenarios
```

## Scenario Categories

| Category | Prefix | Description |
|----------|--------|-------------|
| Baseline | `bl` | Performance baselines, capacity tests |
| Single Fault | `sf` | Single fault injection under load |
| Compound Fault | `cf` | Multiple concurrent faults |
| Data Integrity | `di` | Concurrent writes, idempotency tests |
| Deployment | `dp` | Upgrade/rollback under load |
| E2E | `e2e` | End-to-end integration tests |

## Current Scenarios

### Baseline (BL-01 to BL-10)
- `bl01-golden-baseline.ts` - Performance baselines
- `bl02-write-heavy.ts` - Write-heavy profile
- `bl03-capacity-ceiling.ts` - Ramp to breaking point
- `bl04-step-degradation.ts` - Incremental load steps
- `bl05-multi-tenant.ts` - Multi-tenant isolation
- `bl06-burst-after-idle.ts` - Cold start performance
- `bl07-bulk-delete-contention.ts` - Bulk operation contention
- `bl08-db-pool-saturation.ts` - Database pool limits
- `bl09-leak-detection.ts` - Memory/resource leaks
- `bl10-kafka-throughput.ts` - Kafka event throughput

## Config Files

Each scenario needs a corresponding YAML config in:
`config/scenarios/client-oppy/`
