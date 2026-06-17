import { BaseOperation } from "../base-operation.js";
import { versionsLatency } from "../../lib/metrics.js";

export class ConfigVersionsOperation extends BaseOperation {
  constructor(config) {
    super(config);
  }

  getVersions() {
    const { response, ok } = this.client.get("/client/versions", {
      tags: { endpoint: "GET /client/versions" },
    });
    versionsLatency.add(response.timings.duration);
    return { response, ok };
  }
}
