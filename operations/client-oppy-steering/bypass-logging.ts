import { BaseOperation } from '../base-operation';
import {
  bypassLoggingGetLatency,
  bypassLoggingUpdateLatency,
} from '../../lib/metrics';
import { parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type {
  OperationResult,
  BypassLoggingConfig,
  IBypassLoggingOperation,
} from '../../types/operations';

/**
 * Bypass logging operations for steering service.
 * Controls whether traffic bypasses logging.
 */
export class BypassLoggingOperation extends BaseOperation implements IBypassLoggingOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Get current bypass logging configuration.
   */
  get(): OperationResult<BypassLoggingConfig> {
    const { response, ok } = this.client.get('/settings/bypasslogging', {
      tags: { endpoint: 'GET /settings/bypasslogging' },
    });
    bypassLoggingGetLatency.add(response.timings.duration);

    const data = ok ? parseBody<BypassLoggingConfig>(response) ?? undefined : undefined;

    return { response, ok, data };
  }

  /**
   * Update bypass logging configuration.
   */
  update(config: BypassLoggingConfig): OperationResult<BypassLoggingConfig> {
    const { response, ok } = this.client.put('/settings/bypasslogging', config, {
      tags: { endpoint: 'PUT /settings/bypasslogging' },
    });
    bypassLoggingUpdateLatency.add(response.timings.duration);

    const data = ok ? parseBody<BypassLoggingConfig>(response) ?? undefined : undefined;

    return { response, ok, data };
  }

  /**
   * Enable bypass logging.
   */
  enable(): OperationResult<BypassLoggingConfig> {
    return this.update({ enabled: true });
  }

  /**
   * Disable bypass logging.
   */
  disable(): OperationResult<BypassLoggingConfig> {
    return this.update({ enabled: false });
  }

  /**
   * Toggle bypass logging (get current state and flip it).
   */
  toggle(): OperationResult<BypassLoggingConfig> {
    const current = this.get();
    if (!current.ok || !current.data) {
      return current;
    }

    const newState = !current.data.enabled;
    return this.update({ enabled: newState });
  }
}
