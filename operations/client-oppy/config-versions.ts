import { BaseOperation } from '../base-operation';
import { versionsLatency } from '../../lib/metrics';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult, IConfigVersionsOperation } from '../../types/operations';

/**
 * Version operations for client configuration service.
 */
export class ConfigVersionsOperation extends BaseOperation implements IConfigVersionsOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Get available configuration versions.
   */
  getVersions(): OperationResult {
    const { response, ok } = this.client.get('/client/versions', {
      tags: { endpoint: 'GET /client/versions' },
    });
    versionsLatency.add(response.timings.duration);
    return { response, ok };
  }
}
