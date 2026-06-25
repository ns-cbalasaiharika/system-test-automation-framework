import { BaseOperation } from '../base-operation';
import {
  steeringGetLatency,
  steeringCreateLatency,
  steeringUpdateLatency,
  steeringPatchLatency,
  steeringDeleteLatency,
  steeringConfigsCreated,
  steeringConfigsUpdated,
  steeringConfigsDeleted,
} from '../../lib/metrics';
import { randomString, randomInt, parseBody } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type {
  OperationResult,
  SteeringConfig,
  CreateSteeringPayload,
  UpdateSteeringPayload,
  ListSteeringResponse,
  ISteeringCrudOperation,
} from '../../types/operations';

/**
 * CRUD operations for client-oppy steering service.
 * Implements ETag/If-Match enforcement on all write operations.
 */
export class SteeringCrudOperation extends BaseOperation implements ISteeringCrudOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * Get a steering configuration by ID.
   * Returns ETag in response headers for optimistic locking.
   */
  getById(id: string | number): OperationResult<SteeringConfig> & { etag: string | null } {
    const { response, ok } = this.client.get(`/config/${id}`, {
      tags: { endpoint: 'GET /config/{id}' },
    });
    steeringGetLatency.add(response.timings.duration);

    const etag = response.headers['Etag'] || response.headers['etag'] || null;
    const data = ok ? parseBody<SteeringConfig>(response) : undefined;

    return { response, ok, data, etag };
  }

  /**
   * List all steering configurations.
   */
  list(): OperationResult<SteeringConfig[]> {
    const { response, ok } = this.client.get('/config', {
      tags: { endpoint: 'GET /config' },
    });
    steeringGetLatency.add(response.timings.duration);

    const parsed = parseBody<ListSteeringResponse>(response);
    const data = ok && parsed?.data ? parsed.data : undefined;

    return { response, ok, data };
  }

  /**
   * Create a new steering configuration.
   */
  create(payload?: CreateSteeringPayload): OperationResult<SteeringConfig> & { configId: string | null; etag: string | null } {
    const body: CreateSteeringPayload = payload || {
      name: `k6-steering-${randomString(8)}-${Date.now()}`,
      targets: [
        {
          type: 'user_group',
          values: [
            {
              id: `k6-grp-${randomString(6)}`,
              name: `k6-steering-group-${randomString(6)}`,
            },
          ],
        },
      ],
      steeringMode: 'dynamic',
    };

    const { response, ok } = this.client.post('/config', body, {
      tags: { endpoint: 'POST /config' },
    });
    steeringCreateLatency.add(response.timings.duration);
    if (ok) steeringConfigsCreated.add(1);

    const etag = response.headers['Etag'] || response.headers['etag'] || null;
    const parsed = parseBody<SteeringConfig>(response);
    const configId = parsed?.id?.toString() || null;

    return { response, ok, configId, data: parsed, etag };
  }

  /**
   * Update (replace) a steering configuration.
   * Requires If-Match header with valid ETag.
   */
  update(id: string | number, payload: UpdateSteeringPayload, etag: string): OperationResult<SteeringConfig> & { newEtag: string | null } {
    const { response, ok } = this.client.put(`/config/${id}`, payload, {
      tags: { endpoint: 'PUT /config/{id}' },
      headers: { 'If-Match': etag },
    });
    steeringUpdateLatency.add(response.timings.duration);
    if (ok) steeringConfigsUpdated.add(1);

    const newEtag = response.headers['Etag'] || response.headers['etag'] || null;
    const data = ok ? parseBody<SteeringConfig>(response) : undefined;

    return { response, ok, data, newEtag };
  }

  /**
   * Partial update a steering configuration.
   * Requires If-Match header with valid ETag.
   */
  patch(id: string | number, payload: Partial<UpdateSteeringPayload>, etag: string): OperationResult<SteeringConfig> & { newEtag: string | null } {
    const { response, ok } = this.client.patch(`/config/${id}`, payload, {
      tags: { endpoint: 'PATCH /config/{id}' },
      headers: { 'If-Match': etag },
    });
    steeringPatchLatency.add(response.timings.duration);
    if (ok) steeringConfigsUpdated.add(1);

    const newEtag = response.headers['Etag'] || response.headers['etag'] || null;
    const data = ok ? parseBody<SteeringConfig>(response) : undefined;

    return { response, ok, data, newEtag };
  }

  /**
   * Delete a steering configuration.
   * Requires If-Match header with valid ETag.
   */
  delete(id: string | number, etag: string): OperationResult {
    const { response, ok } = this.client.del(`/config/${id}`, {
      tags: { endpoint: 'DELETE /config/{id}' },
      headers: { 'If-Match': etag },
    });
    steeringDeleteLatency.add(response.timings.duration);
    if (ok) steeringConfigsDeleted.add(1);

    return { response, ok };
  }

  /**
   * Get a random steering config ID from the list of existing configs.
   * Skips the default config (priority=-1).
   */
  getRandomId(): string | number | null {
    const { response, ok } = this.client.get('/config', {
      tags: { endpoint: 'GET /config (id-fetch)' },
    });

    if (!ok) return null;

    const body = parseBody<ListSteeringResponse>(response);
    if (!body?.data) return null;

    const ids = body.data
      .filter((c) => c.priority !== -1)
      .map((c) => c.id);

    if (ids.length === 0) return null;
    return ids[randomInt(0, ids.length - 1)];
  }

  /**
   * Get a random config with its ETag for update/delete operations.
   */
  getRandomConfigWithEtag(): { id: string | number; etag: string } | null {
    const id = this.getRandomId();
    if (!id) return null;

    const result = this.getById(id);
    if (!result.ok || !result.etag) return null;

    return { id, etag: result.etag };
  }

  /**
   * Attempt an update without If-Match header (should fail with 412).
   * Useful for testing ETag enforcement.
   */
  updateWithoutEtag(id: string | number, payload: UpdateSteeringPayload): OperationResult {
    const { response, ok } = this.client.put(`/config/${id}`, payload, {
      tags: { endpoint: 'PUT /config/{id} (no-etag)' },
      expectedStatus: 412,
    });
    steeringUpdateLatency.add(response.timings.duration);

    return { response, ok };
  }

  /**
   * Attempt a delete without If-Match header (should fail with 412).
   * Useful for testing ETag enforcement.
   */
  deleteWithoutEtag(id: string | number): OperationResult {
    const { response, ok } = this.client.del(`/config/${id}`, {
      tags: { endpoint: 'DELETE /config/{id} (no-etag)' },
      expectedStatus: 412,
    });
    steeringDeleteLatency.add(response.timings.duration);

    return { response, ok };
  }
}
