import { HttpClient } from '../../lib/http-client';
import {
  listLatency,
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
  ListConfigsResponse,
  CreateConfigPayload,
} from '../../types/operations';

/**
 * Tenant-aware CRUD operations for multi-tenant scenarios.
 * Each operation uses tenant-specific headers, allowing VUs to simulate
 * different tenants hitting the same service.
 */
export class TenantAwareCrudOperation {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(config: RuntimeConfig) {
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.headers || {};
  }

  /**
   * Create a client with tenant-specific headers.
   */
  private getClient(tenantId: string): HttpClient {
    const headers = {
      ...this.defaultHeaders,
      'x-netskope-tenantid': tenantId,
    };
    return new HttpClient(this.baseUrl, headers);
  }

  /**
   * List all configurations for a tenant.
   */
  list(tenantId: string): OperationResult<ClientConfig[]> {
    const client = this.getClient(tenantId);
    const { response, ok } = client.get('/client/config', {
      tags: { endpoint: 'GET /client/config', tenant: tenantId },
    });
    listLatency.add(response.timings.duration);
    
    const body = ok ? parseBody<ListConfigsResponse>(response) : null;
    const data = body?.success ? body.data : undefined;
    
    return { response, ok, data };
  }

  /**
   * Get a configuration by ID for a tenant.
   */
  getById(tenantId: string, id: string | number): OperationResult<ClientConfig> {
    const client = this.getClient(tenantId);
    const { response, ok } = client.get(`/client/config/${id}`, {
      tags: { endpoint: 'GET /client/config/{id}', tenant: tenantId },
    });
    getByIdLatency.add(response.timings.duration);
    
    const data = ok ? parseBody<{ data: ClientConfig }>(response)?.data : undefined;
    return { response, ok, data };
  }

  /**
   * Create a configuration for a tenant.
   */
  create(tenantId: string, payload?: CreateConfigPayload): OperationResult<ClientConfig> & { configId: string | null } {
    const client = this.getClient(tenantId);
    const body: CreateConfigPayload = payload || {
      configurationName: `k6-${tenantId}-${randomString(6)}-${Date.now()}`,
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

    const { response, ok } = client.post('/client/config', body, {
      tags: { endpoint: 'POST /client/config', tenant: tenantId },
    });
    createLatency.add(response.timings.duration);
    if (ok) configsCreated.add(1);

    const parsed = parseBody<{ data: ClientConfig }>(response);
    const configId = parsed?.data?.id?.toString() || null;
    const data = parsed?.data;

    return { response, ok, configId, data };
  }

  /**
   * Update a configuration for a tenant.
   */
  update(tenantId: string, id: string | number): OperationResult {
    const client = this.getClient(tenantId);
    const body = {
      configurationName: `k6-updated-${tenantId}-${randomString(6)}`,
    };

    const { response, ok } = client.patch(`/client/config/${id}`, body, {
      tags: { endpoint: 'PATCH /client/config/{id}', tenant: tenantId },
    });
    updateLatency.add(response.timings.duration);
    if (ok) configsUpdated.add(1);

    return { response, ok };
  }

  /**
   * Delete a configuration for a tenant.
   */
  delete(tenantId: string, id: string | number): OperationResult {
    const client = this.getClient(tenantId);
    const { response, ok } = client.del(`/client/config/${id}`, {
      tags: { endpoint: 'DELETE /client/config/{id}', tenant: tenantId },
    });
    deleteLatency.add(response.timings.duration);
    if (ok) configsDeleted.add(1);

    return { response, ok };
  }

  /**
   * Get a random config ID for the given tenant.
   */
  getRandomId(tenantId: string): string | number | null {
    const client = this.getClient(tenantId);
    const { response, ok } = client.get('/client/config', {
      tags: { endpoint: 'GET /client/config (id-fetch)', tenant: tenantId },
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
   * Get IDs of k6-created configs (id > 5) for the given tenant.
   */
  getDeletableIds(tenantId: string): Array<string | number> {
    const client = this.getClient(tenantId);
    const { response, ok } = client.get('/client/config', {
      tags: { endpoint: 'GET /client/config (deletable-fetch)', tenant: tenantId },
    });

    if (!ok) return [];

    const body = parseBody<ListConfigsResponse>(response);
    if (!body?.success || !body?.data) return [];

    return body.data
      .filter((c) => parseInt(String(c.id)) > 5)
      .map((c) => c.id);
  }
}
