import { BaseOperation } from '../base-operation';
import {
  legacyGetSteeringListLatency,
  steeringStatusLatency,
} from '../../lib/metrics';
import { parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type {
  OperationResult,
  SteeringConfig,
  SteeringServiceStatus,
  ILegacySteeringOperation,
} from '../../types/operations';

/**
 * Legacy steering endpoints for backward compatibility.
 * These endpoints are maintained for older integrations.
 */
export class LegacySteeringOperation extends BaseOperation implements ILegacySteeringOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Get steering list via legacy POST endpoint.
   * POST /settings/steering_config/getSteeringList
   * Response should be equivalent to GET /config
   */
  getSteeringList(tenantId?: string): OperationResult<SteeringConfig[]> {
    const body = tenantId ? { tenantId } : {};

    const { response, ok } = this.client.post(
      '/settings/steering_config/getSteeringList',
      body,
      {
        tags: { endpoint: 'POST /settings/steering_config/getSteeringList' },
      }
    );
    legacyGetSteeringListLatency.add(response.timings.duration);

    interface LegacyResponse {
      data?: SteeringConfig[];
      configs?: SteeringConfig[];
      steeringConfigs?: SteeringConfig[];
    }

    const parsed = parseBody<LegacyResponse>(response);
    const data = ok ? (parsed?.data || parsed?.configs || parsed?.steeringConfigs) : undefined;

    return { response, ok, data };
  }

  /**
   * Get service status.
   * GET /api/v1/status
   */
  getStatus(): OperationResult<SteeringServiceStatus> {
    const { response, ok } = this.client.get('/api/v1/status', {
      tags: { endpoint: 'GET /api/v1/status' },
    });
    steeringStatusLatency.add(response.timings.duration);

    const data = ok ? parseBody<SteeringServiceStatus>(response) ?? undefined : undefined;

    return { response, ok, data };
  }

  /**
   * Health check endpoint.
   * GET /api/v1/alive
   */
  alive(): OperationResult {
    const { response, ok } = this.client.get('/api/v1/alive', {
      tags: { endpoint: 'GET /api/v1/alive' },
    });

    return { response, ok };
  }

  /**
   * Readiness check endpoint.
   * GET /api/v1/ready
   */
  ready(): OperationResult {
    const { response, ok } = this.client.get('/api/v1/ready', {
      tags: { endpoint: 'GET /api/v1/ready' },
    });

    return { response, ok };
  }

  /**
   * Compare legacy getSteeringList with modern GET /config.
   * Returns true if responses are equivalent (for parity testing).
   */
  verifyParity(modernConfigs: SteeringConfig[], legacyConfigs: SteeringConfig[]): boolean {
    if (modernConfigs.length !== legacyConfigs.length) {
      console.warn(
        `Parity mismatch: modern has ${modernConfigs.length} configs, legacy has ${legacyConfigs.length}`
      );
      return false;
    }

    const modernIds = new Set(modernConfigs.map((c) => String(c.id)));
    const legacyIds = new Set(legacyConfigs.map((c) => String(c.id)));

    for (const id of modernIds) {
      if (!legacyIds.has(id)) {
        console.warn(`Parity mismatch: config ${id} missing from legacy response`);
        return false;
      }
    }

    return true;
  }
}
