# Device Classification Service Operations

Device classification configuration and evaluation services.

## What to Add Here

1. **`config-operations.ts`** - Config service operations
2. **`evaluator-operations.ts`** - Evaluator service operations
3. **`tag-operations.ts`** - Tag service operations
4. **`index.ts`** - Export all operations

## Required Operations

Based on `config/cluster-load/cluster-services.yaml`:

### Config Service (port 3001)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getConfig` | GET | `/api/v1/config` | Get classification config |
| `updateConfig` | POST | `/api/v1/config` | Update classification config |

### Evaluator Service (port 3002)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `classifyDevice` | POST | `/api/v1/classify` | Classify single device |
| `batchClassify` | POST | `/api/v1/classify/batch` | Batch classify devices |

### Tag Service (port 3003)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getTags` | GET | `/api/v1/tags` | Get all tags |
| `updateTags` | POST | `/api/v1/tags` | Update tags |

## Example Structure

```typescript
// evaluator-operations.ts
import { BaseOperation } from '../base-operation';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult } from '../../types/operations';

export class DeviceClassificationEvaluatorOperations extends BaseOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  classifyDevice(device: DeviceAttributes): OperationResult<ClassificationResult> {
    const { response, ok } = this.client.post('/api/v1/classify', device, {
      tags: { endpoint: 'POST /api/v1/classify' },
      expectedStatus: 200,
    });
    // ...
  }
}
```

## Reference

- See `operations/client-oppy/` for a complete working example
