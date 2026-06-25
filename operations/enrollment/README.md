# Enrollment Service Operations

Secure client enrollment and certificate provisioning.

## What to Add Here

1. **`enrollment-operations.ts`** - Enrollment operations
2. **`certificate-operations.ts`** - Certificate operations
3. **`index.ts`** - Export all operations

## Required Operations

Based on `config/cluster-load/cluster-services.yaml`:

### Enrollment Service (port 8091)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `enroll` | POST | `/api/v1/enroll` | Initiate enrollment |
| `getEnrollmentStatus` | GET | `/api/v1/enroll/{enrollmentId}` | Get enrollment status |

### Certificate Service (port 8092)
| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| `getCertificate` | GET | `/api/v1/certificates/{certId}` | Get certificate |
| `requestCertificate` | POST | `/api/v1/certificates` | Request new certificate |
| `revokeCertificate` | DELETE | `/api/v1/certificates/{certId}` | Revoke certificate |

## Example Structure

```typescript
// enrollment-operations.ts
import { BaseOperation } from '../base-operation';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult } from '../../types/operations';

export class EnrollmentOperations extends BaseOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  enroll(request: EnrollmentRequest): OperationResult<EnrollmentResponse> {
    const { response, ok } = this.client.post('/api/v1/enroll', request, {
      tags: { endpoint: 'POST /api/v1/enroll' },
    });
    // ...
  }
}
```

## Reference

- See `operations/client-oppy/` for a complete working example
