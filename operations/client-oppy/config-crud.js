import { BaseOperation } from "../base-operation.js";
import {
  getByIdLatency,
  createLatency,
  updateLatency,
  deleteLatency,
  configsCreated,
  configsUpdated,
  configsDeleted,
} from "../../lib/metrics.js";
import { randomString, randomInt, parseBody } from "../../lib/utils.js";

export class ConfigCrudOperation extends BaseOperation {
  constructor(config) {
    super(config);
  }

  getById(id) {
    const { response, ok } = this.client.get(`/client/config/${id}`, {
      tags: { endpoint: "GET /client/config/{id}" },
    });
    getByIdLatency.add(response.timings.duration);
    return { response, ok };
  }

  create() {
    const name = `k6-${randomString(8)}-${Date.now()}`;
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

    const { response, ok } = this.client.post("/client/config", body, {
      tags: { endpoint: "POST /client/config" },
    });
    createLatency.add(response.timings.duration);
    if (ok) configsCreated.add(1);

    const parsed = parseBody(response);
    const configId = parsed && parsed.data ? parsed.data.id : null;

    return { response, ok, configId };
  }

  update(id) {
    const body = {
      configurationName: `k6-updated-${randomString(6)}`,
    };

    const { response, ok } = this.client.patch(`/client/config/${id}`, body, {
      tags: { endpoint: "PATCH /client/config/{id}" },
    });
    updateLatency.add(response.timings.duration);
    if (ok) configsUpdated.add(1);

    return { response, ok };
  }

  delete(id) {
    const { response, ok } = this.client.del(`/client/config/${id}`, {
      tags: { endpoint: "DELETE /client/config/{id}" },
    });
    deleteLatency.add(response.timings.duration);
    if (ok) configsDeleted.add(1);

    return { response, ok };
  }

  /**
   * Get a random config ID from the list of existing configs.
   * Skips the default config (id=1).
   */
  getRandomId() {
    const { response, ok } = this.client.get("/client/config", {
      tags: { endpoint: "GET /client/config (id-fetch)" },
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
   * Get IDs of k6-created configs (id > 5, since 1-5 are seeded).
   */
  getDeletableIds() {
    const { response, ok } = this.client.get("/client/config", {
      tags: { endpoint: "GET /client/config (deletable-fetch)" },
    });

    if (!ok) return [];

    const body = parseBody(response);
    if (!body || !body.success || !body.data) return [];

    return body.data
      .filter((c) => parseInt(c.id) > 5)
      .map((c) => c.id);
  }
}
