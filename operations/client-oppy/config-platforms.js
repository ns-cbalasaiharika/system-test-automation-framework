import { BaseOperation } from "../base-operation.js";
import { platformsLatency } from "../../lib/metrics.js";

export class ConfigPlatformsOperation extends BaseOperation {
  constructor(config) {
    super(config);
  }

  getPlatforms() {
    const { response, ok } = this.client.get("/client/platforms", {
      tags: { endpoint: "GET /client/platforms" },
    });
    platformsLatency.add(response.timings.duration);
    return { response, ok };
  }
}
