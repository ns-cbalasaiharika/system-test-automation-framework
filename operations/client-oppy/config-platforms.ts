import { BaseOperation } from '../base-operation';
import { platformsLatency } from '../../lib/metrics';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult, IConfigPlatformsOperation } from '../../types/operations';

/**
 * Platform operations for client configuration service.
 */
export class ConfigPlatformsOperation extends BaseOperation implements IConfigPlatformsOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Get available platforms.
   */
  getPlatforms(): OperationResult {
    const { response, ok } = this.client.get('/client/platforms', {
      tags: { endpoint: 'GET /client/platforms' },
    });
    platformsLatency.add(response.timings.duration);
    return { response, ok };
  }
}
