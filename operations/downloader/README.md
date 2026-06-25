# Downloader Service Operations

Client installer distribution service.

## What to Add Here

1. **`base-operations.ts`** - Operation class extending `BaseOperation`
2. **`index.ts`** - Export all operations

## Required Operations

Based on `config/cluster-load/cluster-services.yaml`:

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `listDownloads` | GET | `/api/v1/downloads` | List available downloads |
| `triggerDownload` | POST | `/api/v1/downloads` | Trigger a new download |

## Example Structure

```typescript
// base-operations.ts
import { BaseOperation } from '../base-operation';
import { parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult } from '../../types/operations';

export class DownloaderOperations extends BaseOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  listDownloads(platform?: string): OperationResult<DownloadsListResponse> {
    let path = '/api/v1/downloads';
    if (platform) path += `?platform=${encodeURIComponent(platform)}`;
    
    const { response, ok } = this.client.get(path, {
      tags: { endpoint: 'GET /api/v1/downloads' },
    });
    const data = ok ? parseBody<DownloadsListResponse>(response) ?? undefined : undefined;
    return { response, ok, data };
  }
  
  // ... other operations
}
```

## Reference

- See `operations/client-oppy/` for a complete working example
- See `operations/templates/service-template.ts` for a starter template
