import { BaseOperation } from "../base-operation.js";
import {
  getAddonLatency,
  listAddonsLatency,
  createAddonLatency,
  updateAddonLatency,
  deleteAddonLatency,
  addonsCreated,
  addonsUpdated,
  addonsDeleted,
} from "../../lib/metrics.js";
import { randomString } from "../../lib/utils.js";

/**
 * Addonman API operations.
 */
export class AddonOperations extends BaseOperation {
  constructor(config) {
    super(config);
  }

  listAddons() {
    const { response, ok } = this.client.get("/api/v1/addons", {
      tags: { endpoint: "GET /api/v1/addons" },
    });
    listAddonsLatency.add(response.timings.duration);
    return { response, ok };
  }

  getAddon(id) {
    const { response, ok } = this.client.get(`/api/v1/addons/${id}`, {
      tags: { endpoint: "GET /api/v1/addons/{id}" },
    });
    getAddonLatency.add(response.timings.duration);
    return { response, ok };
  }

  createAddon(payload) {
    const body = payload || {
      name: `k6-addon-${randomString(8)}`,
      version: "1.0.0",
      type: "test",
    };
    const { response, ok } = this.client.post("/api/v1/addons", body, {
      tags: { endpoint: "POST /api/v1/addons" },
    });
    createAddonLatency.add(response.timings.duration);
    if (ok) addonsCreated.add(1);
    return { response, ok };
  }

  updateAddon(id, payload) {
    const { response, ok } = this.client.patch(`/api/v1/addons/${id}`, payload, {
      tags: { endpoint: "PATCH /api/v1/addons/{id}" },
    });
    updateAddonLatency.add(response.timings.duration);
    if (ok) addonsUpdated.add(1);
    return { response, ok };
  }

  deleteAddon(id) {
    const { response, ok } = this.client.del(`/api/v1/addons/${id}`, {
      tags: { endpoint: "DELETE /api/v1/addons/{id}" },
    });
    deleteAddonLatency.add(response.timings.duration);
    if (ok) addonsDeleted.add(1);
    return { response, ok };
  }
}
