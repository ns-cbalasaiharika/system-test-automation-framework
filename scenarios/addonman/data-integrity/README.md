# Addonman Data Integrity Scenarios

Data integrity scenarios for Addonman service.

## What to Add Here

Scenarios that verify data consistency under concurrent operations.

## Naming

- Prefix: `am-di`
- Example: `am-di01-concurrent-requests.ts`

## Suggested Scenarios

| ID | Name | Description |
|----|------|-------------|
| AM-DI01 | Concurrent Requests | Verify request ordering |
| AM-DI02 | Idempotency | Verify idempotent operations |

## Reference

- See `scenarios/client-oppy/data-integrity/` for examples
- Config: `config/workloads/addonman/am-di*.yaml`
