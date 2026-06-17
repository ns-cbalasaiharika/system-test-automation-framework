import { BaseOperation } from "../base-operation.js";
import { listLatency } from "../../lib/metrics.js";
import { parseBody } from "../../lib/utils.js";

export class ConfigListOperation extends BaseOperation {
  constructor(config) {
    super(config);
  }

  list() {
    const { response, ok } = this.client.get("/client/config", {
      tags: { endpoint: "GET /client/config" },
    });
    listLatency.add(response.timings.duration);
    return { response, ok };
  }

  listWithValidation() {
    const { response, ok } = this.client.get("/client/config", {
      tags: { endpoint: "GET /client/config" },
    });
    listLatency.add(response.timings.duration);

    let data = null;
    if (ok) {
      const body = parseBody(response);
      if (body && body.success) {
        data = body.data;
      }
    }

    return { response, ok, data };
  }
}
