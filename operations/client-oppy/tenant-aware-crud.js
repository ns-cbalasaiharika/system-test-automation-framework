import { HttpClient } from "../../lib/http-client.js";
import {
  listLatency,
  getByIdLatency,
  createLatency,
  updateLatency,
  deleteLatency,
  configsCreated,
  configsUpdated,
  configsDeleted,
} from "../../lib/metrics.js";
import { randomString, randomInt, parseBody } from "../../lib/utils.js";

/**
 * Tenant-aware CRUD operations for multi-tenant scenarios.
 * Each operation uses tenant-specific headers, allowing VUs to simulate
 * different tenants hitting the same service.
 */
export class TenantAwareCrudOperation {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.defaultHeaders = config.headers || {};
  }

  /**
   * Create a client with tenant-specific headers.
   */
  _getClient(tenantId) {
    const headers = {
      ...this.defaultHeaders,
      "x-netskope-tenantid": tenantId,
    };
    return new HttpClient(this.baseUrl, headers);
  }

  list(tenantId) {
    const client = this._getClient(tenantId);
    const { response, ok } = client.get("/client/config", {
      tags: { endpoint: "GET /client/config", tenant: tenantId },
    });
    listLatency.add(response.timings.duration);
    return { response, ok };
  }

  getById(tenantId, id) {
    const client = this._getClient(tenantId);
    const { response, ok } = client.get(`/client/config/${id}`, {
      tags: { endpoint: "GET /client/config/{id}", tenant: tenantId },
    });
    getByIdLatency.add(response.timings.duration);
    return { response, ok };
  }

  create(tenantId) {
    const client = this._getClient(tenantId);
    const name = `k6-${tenantId}-${randomString(6)}-${Date.now()}`;
    const body = {
      configurationName: name,
      targets: [
        {
          type: "user_group",
          values: [
            {
              id: `k6-grp-${randomString(6)}`,
              name: `k6-group-${randomString(6)}`,
            },
          ],
        },
      ],
    };

    const { response, ok } = client.post("/client/config", body, {
      tags: { endpoint: "POST /client/config", tenant: tenantId },
    });
    createLatency.add(response.timings.duration);
    if (ok) configsCreated.add(1);

    const parsed = parseBody(response);
    const configId = parsed && parsed.data ? parsed.data.id : null;

    return { response, ok, configId };
  }

  update(tenantId, id) {
    const client = this._getClient(tenantId);
    const body = {
      configurationName: `k6-updated-${tenantId}-${randomString(6)}`,
    };

    const { response, ok } = client.patch(`/client/config/${id}`, body, {
      tags: { endpoint: "PATCH /client/config/{id}", tenant: tenantId },
    });
    updateLatency.add(response.timings.duration);
    if (ok) configsUpdated.add(1);

    return { response, ok };
  }

  delete(tenantId, id) {
    const client = this._getClient(tenantId);
    const { response, ok } = client.del(`/client/config/${id}`, {
      tags: { endpoint: "DELETE /client/config/{id}", tenant: tenantId },
    });
    deleteLatency.add(response.timings.duration);
    if (ok) configsDeleted.add(1);

    return { response, ok };
  }

  /**
   * Get a random config ID for the given tenant.
   */
  getRandomId(tenantId) {
    const client = this._getClient(tenantId);
    const { response, ok } = client.get("/client/config", {
      tags: { endpoint: "GET /client/config (id-fetch)", tenant: tenantId },
    });

    if (!ok) return null;

    const body = parseBody(response);
    if (!body || !body.success || !body.data) return null;

    const ids = body.data
      .filter((c) => parseInt(c.id) > 1)
      .map((c) => c.id);

    if (ids.length === 0) return null;
    return ids[randomInt(0, ids.length - 1)];
  }

  /**
   * Get IDs of k6-created configs (id > 5) for the given tenant.
   */
  getDeletableIds(tenantId) {
    const client = this._getClient(tenantId);
    const { response, ok } = client.get("/client/config", {
      tags: { endpoint: "GET /client/config (deletable-fetch)", tenant: tenantId },
    });

    if (!ok) return [];

    const body = parseBody(response);
    if (!body || !body.success || !body.data) return [];

    return body.data
      .filter((c) => parseInt(c.id) > 5)
      .map((c) => c.id);
  }
}
