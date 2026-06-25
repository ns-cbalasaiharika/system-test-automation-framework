import { BaseOperation } from '../base-operation';
import { listLatency } from '../../lib/metrics';
import { parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult, ClientConfig, ListConfigsResponse, IConfigListOperation } from '../../types/operations';

/**
 * List operations for client configuration service.
 */
export class ConfigListOperation extends BaseOperation implements IConfigListOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * List all configurations.
   */
  list(): OperationResult<ClientConfig[]> {
    const { response, ok } = this.client.get('/client/config', {
      tags: { endpoint: 'GET /client/config' },
    });
    listLatency.add(response.timings.duration);

    const body = ok ? parseBody<ListConfigsResponse>(response) : null;
    const data = body?.success ? body.data : undefined;

    return { response, ok, data };
  }

  /**
   * List configurations with pagination.
   */
  listPaginated(page: number, pageSize: number): OperationResult<ClientConfig[]> {
    const { response, ok } = this.client.get(
      `/client/config?page=${page}&pageSize=${pageSize}`,
      { tags: { endpoint: 'GET /client/config (paginated)' } }
    );
    listLatency.add(response.timings.duration);

    const body = ok ? parseBody<ListConfigsResponse>(response) : null;
    const data = body?.success ? body.data : undefined;

    return { response, ok, data };
  }

  /**
   * Get total count of configurations.
   */
  getCount(): number {
    const result = this.list();
    return result.data?.length || 0;
  }
}
