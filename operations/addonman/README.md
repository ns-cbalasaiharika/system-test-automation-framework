# Addonman Service Operations

API Gateway for NS Client communications.

## What to Add Here

1. **`base-operations.ts`** - Operation class extending `BaseOperation`
2. **`index.ts`** - Export all operations

## Required Operations

Based on `config/cluster-load/cluster-services.yaml`:

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getBrandingByUPN` | GET | `/config/user/getbrandingbyupn` | Get branding config |
| `getClientConfig` | GET | `/v2/config/org/clientconfig` | Get client config |
| `updateClientStatus` | POST | `/v2/update/clientstatus` | Update client status |
| `getManagedChecks` | GET | `/v2/config/org/getmanagedchecks` | Get managed checks |

## Example Structure

```typescript
// base-operations.ts
import { BaseOperation } from '../base-operation';
import { parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult } from '../../types/operations';

export class AddonmanOperations extends BaseOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  getBrandingByUPN(upn: string): OperationResult<BrandingResponse> {
    const { response, ok } = this.client.get(
      `/config/user/getbrandingbyupn?upn=${encodeURIComponent(upn)}`,
      { tags: { endpoint: 'GET /config/user/getbrandingbyupn' } }
    );
    const data = ok ? parseBody<BrandingResponse>(response) ?? undefined : undefined;
    return { response, ok, data };
  }
  
  // ... other operations
}
```

## Reference

- See `operations/client-oppy/` for a complete working example
- See `operations/templates/service-template.ts` for a starter template
