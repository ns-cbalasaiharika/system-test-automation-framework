import { BaseOperation } from "../base-operation.js";
import { bulkDeleteLatency, configsDeleted } from "../../lib/metrics.js";
import { parseBody } from "../../lib/utils.js";

export class BulkDeleteOperation extends BaseOperation {
  constructor(config) {
    super(config);
  }

  bulkDelete(ids) {
    const body = { ids };
    const { response, ok } = this.client.post(
      "/client/config/bulkdelete",
      body,
      {
        tags: { endpoint: "POST /client/config/bulkdelete" },
        expectedStatus: 200,
      }
    );
    bulkDeleteLatency.add(response.timings.duration);
    if (ok) configsDeleted.add(ids.length);

    return { response, ok };
  }
}
