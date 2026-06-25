import { BaseOperation } from '../base-operation';
import {
  getByIdLatency,
  createLatency,
  updateLatency,
  deleteLatency,
  configsCreated,
  configsUpdated,
  configsDeleted,
} from '../../lib/metrics';
import { randomString, randomInt, parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type {
  OperationResult,
  ClientConfig,
  CreateConfigPayload,
  UpdateConfigPayload,
  ListConfigsResponse,
  IConfigCrudOperation,
} from '../../types/operations';

/**
 * CRUD operations for client configuration service.
 */
export class ConfigCrudOperation extends BaseOperation implements IConfigCrudOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Get a configuration by ID.
   */
  getById(id: string | number): OperationResult<ClientConfig> {
    const { response, ok } = this.client.get(`/client/config/${id}`, {
      tags: { endpoint: 'GET /client/config/{id}' },
    });
    getByIdLatency.add(response.timings.duration);
    
    const data = ok ? parseBody<{ data: ClientConfig }>(response)?.data : undefined;
    return { response, ok, data };
  }

  /**
   * Create a new configuration.
   */
  create(payload?: CreateConfigPayload): OperationResult<ClientConfig> & { configId: string | null } {
    const body: CreateConfigPayload = payload || {
      configurationName: `k6-${randomString(8)}-${Date.now()}`,
      targets: [
        {
          type: 'user_group',
          values: [
            {
              id: `k6-grp-${randomString(6)}`,
              name: `k6-group-${randomString(6)}`,
            },
          ],
        },
      ],
    };

    const { response, ok } = this.client.post('/client/config', body, {
      tags: { endpoint: 'POST /client/config' },
    });
    createLatency.add(response.timings.duration);
    if (ok) configsCreated.add(1);

    const parsed = parseBody<{ data: ClientConfig }>(response);
    const configId = parsed?.data?.id?.toString() || null;
    const data = parsed?.data;

    return { response, ok, configId, data };
  }

  /**
   * Update an existing configuration.
   */
  update(id: string | number, payload?: UpdateConfigPayload): OperationResult {
    const body: UpdateConfigPayload = payload || {
      configurationName: `k6-updated-${randomString(6)}`,
    };

    const { response, ok } = this.client.patch(`/client/config/${id}`, body, {
      tags: { endpoint: 'PATCH /client/config/{id}' },
    });
    updateLatency.add(response.timings.duration);
    if (ok) configsUpdated.add(1);

    return { response, ok };
  }

  /**
   * Delete a configuration.
   */
  delete(id: string | number): OperationResult {
    const { response, ok } = this.client.del(`/client/config/${id}`, {
      tags: { endpoint: 'DELETE /client/config/{id}' },
    });
    deleteLatency.add(response.timings.duration);
    if (ok) configsDeleted.add(1);

    return { response, ok };
  }

  /**
   * Get a random config ID from the list of existing configs.
   * Skips the default config (id=1).
   */
  getRandomId(): string | number | null {
    const { response, ok } = this.client.get('/client/config', {
      tags: { endpoint: 'GET /client/config (id-fetch)' },
    });

    if (!ok) return null;

    const body = parseBody<ListConfigsResponse>(response);
    if (!body?.success || !body?.data) return null;

    const ids = body.data
      .filter((c) => parseInt(String(c.id)) > 1)
      .map((c) => c.id);

    if (ids.length === 0) return null;
    return ids[randomInt(0, ids.length - 1)];
  }

  /**
   * Get IDs of k6-created configs (id > 5, since 1-5 are seeded).
   */
  getDeletableIds(): Array<string | number> {
    const { response, ok } = this.client.get('/client/config', {
      tags: { endpoint: 'GET /client/config (deletable-fetch)' },
    });

    if (!ok) return [];

    const body = parseBody<ListConfigsResponse>(response);
    if (!body?.success || !body?.data) return [];

    return body.data
      .filter((c) => parseInt(String(c.id)) > 5)
      .map((c) => c.id);
  }
}
