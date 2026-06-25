# Addonman Single Fault Scenarios

Single fault injection scenarios under load for Addonman service.

## What to Add Here

Scenarios that inject one fault at a time while the system is under load.

## Naming

- Prefix: `am-sf`
- Example: `am-sf01-redis-restart.ts`

## Suggested Scenarios

| ID | Name | Description |
|----|------|-------------|
| AM-SF01 | Redis Restart | Redis pod restart under load |
| AM-SF02 | DB Failover | Database failover during traffic |
| AM-SF03 | Network Latency | Inject network latency |

## Reference

- See `scenarios/client-oppy/single-fault/` for examples
- Config: `config/workloads/addonman/am-sf*.yaml`
