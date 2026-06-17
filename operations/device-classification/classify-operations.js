import { BaseOperation } from "../base-operation.js";
import {
  classifyLatency,
  lookupLatency,
  batchClassifyLatency,
  devicesClassified,
  deviceLookups,
} from "../../lib/metrics.js";

/**
 * Device Classification service operations.
 */
export class ClassifyOperations extends BaseOperation {
  constructor(config) {
    super(config);
  }

  classifyDevice(payload) {
    const { response, ok } = this.client.post("/api/v1/classify", payload, {
      tags: { endpoint: "POST /api/v1/classify" },
    });
    classifyLatency.add(response.timings.duration);
    if (ok) devicesClassified.add(1);
    return { response, ok };
  }

  lookupDevice(deviceId) {
    const { response, ok } = this.client.get(`/api/v1/devices/${deviceId}`, {
      tags: { endpoint: "GET /api/v1/devices/{id}" },
    });
    lookupLatency.add(response.timings.duration);
    if (ok) deviceLookups.add(1);
    return { response, ok };
  }

  batchClassify(devices) {
    const { response, ok } = this.client.post("/api/v1/classify/batch", { devices }, {
      tags: { endpoint: "POST /api/v1/classify/batch" },
    });
    batchClassifyLatency.add(response.timings.duration);
    if (ok) devicesClassified.add(devices.length);
    return { response, ok };
  }
}
