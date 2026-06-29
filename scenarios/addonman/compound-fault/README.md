# Addonman Compound Fault Scenarios

Compound fault injection scenarios for Addonman service.

## What to Add Here

Scenarios that inject multiple concurrent faults to test system resilience.

## Naming

- Prefix: `am-cf`
- Example: `am-cf01-redis-db-slow.ts`

## Suggested Scenarios

| ID | Name | Description |
|----|------|-------------|
| AM-CF01 | Redis + DB Slow | Redis restart + DB latency |
| AM-CF02 | Network + Memory | Network partition + memory pressure |

## Reference

- See `scenarios/client-oppy/compound-fault/` for examples
- Config: `config/scenarios/addonman/am-cf*.yaml`
