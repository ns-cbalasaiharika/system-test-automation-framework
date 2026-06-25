import { BaseOperation } from '../base-operation';
import { bulkDeleteLatency, configsDeleted } from '../../lib/metrics';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult, IBulkDeleteOperation, BulkDeleteResponse } from '../../types/operations';

function generateUUID(): string {
  const hex = '0123456789abcdef';
  const segments = [8, 4, 4, 4, 12];
  return segments
    .map((len) => {
      let s = '';
      for (let i = 0; i < len; i++) {
        s += hex[Math.floor(Math.random() * 16)];
      }
      return s;
    })
    .join('-');
}

/**
 * Bulk delete operations for client configuration service.
 * Sends an async bulk delete (202) with an idempotency token per the service contract.
 */
export class BulkDeleteOperation extends BaseOperation implements IBulkDeleteOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Bulk delete multiple configurations.
   * Returns 202 Accepted with a jobId for polling via BulkStatusOperation.
   */
  bulkDelete(ids: Array<string | number>, idempotencyToken?: string): OperationResult<BulkDeleteResponse> {
    const token = idempotencyToken || generateUUID();
    const body = { ids, idempotencyToken: token };
    const { response, ok } = this.client.post(
      '/client/config/bulkdelete',
      body,
      {
        tags: { endpoint: 'POST /client/config/bulkdelete' },
        expectedStatus: 202,
      }
    );
    bulkDeleteLatency.add(response.timings.duration);
    if (ok) configsDeleted.add(ids.length);

    let data: BulkDeleteResponse | undefined;
    try {
      const parsed = response.json() as Record<string, unknown>;
      data = { jobId: String(parsed['jobId'] || '') };
    } catch {
      data = { jobId: '' };
    }

    return { response, ok, data };
  }
}
