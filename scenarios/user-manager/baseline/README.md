# User Manager Baseline Scenarios

Baseline performance scenarios for User Manager service.

**Critical:** User Manager is a FATAL dependency for client-oppy.

## Naming

- Prefix: `um-bl`
- Example: `um-bl01-golden-baseline.ts`

## Suggested Scenarios

| ID | Name | Description |
|----|------|-------------|
| UM-BL01 | Golden Baseline | User/Group lookup latency baselines |
| UM-BL02 | AD Sync | AD sync performance |
| UM-BL03 | Group Lookup | Group membership lookup throughput |

## Reference

- Config: `config/workloads/user-manager/um-bl*.yaml`
