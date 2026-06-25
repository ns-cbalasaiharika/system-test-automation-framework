# User Manager Service Operations

User and group management service.

**Note:** User Manager is a FATAL dependency for client-oppy write path. When UM is down, targeted config creates/updates fail.

## What to Add Here

1. **`base-operations.ts`** - Operation class extending `BaseOperation`
2. **`index.ts`** - Export all operations

## Required Operations

Based on `config/cluster-load/cluster-services.yaml`:

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getUser` | GET | `/api/v1/users/{userId}` | Get user by ID |
| `listUsers` | GET | `/api/v1/users` | List users with pagination |
| `syncUsers` | POST | `/api/v1/adsync` | Trigger AD sync |

### Additional Operations (from client-oppy dependencies)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getUserAttributesOU` | GET | `/v2/api/{tenantID}/users/attributes/ou` | Get user OU attributes |
| `getGroups` | GET | `/v2/api/{tenantID}/groups` | Get groups for tenant |

## Example Structure

```typescript
// base-operations.ts
import { BaseOperation } from '../base-operation';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult } from '../../types/operations';

export class UserManagerOperations extends BaseOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  getUser(userId: string): OperationResult<User> {
    const { response, ok } = this.client.get(`/api/v1/users/${userId}`, {
      tags: { endpoint: 'GET /api/v1/users/{userId}' },
    });
    // ...
  }

  // Critical for client-oppy write path validation
  getGroups(tenantId: string): OperationResult<Group[]> {
    const { response, ok } = this.client.get(`/v2/api/${tenantId}/groups`, {
      tags: { endpoint: 'GET /v2/api/{tenantID}/groups' },
    });
    // ...
  }
}
```

## Reference

- See `operations/client-oppy/` for a complete working example
