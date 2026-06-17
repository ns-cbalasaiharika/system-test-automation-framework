import { BaseOperation } from "../base-operation.js";
import {
  downloadListLatency,
  downloadTriggerLatency,
  downloadsTriggered,
  downloadsCompleted,
} from "../../lib/metrics.js";
import { parseBody } from "../../lib/utils.js";

/**
 * Downloader service operations.
 */
export class DownloadOperations extends BaseOperation {
  constructor(config) {
    super(config);
  }

  listDownloads() {
    const { response, ok } = this.client.get("/api/v1/downloads", {
      tags: { endpoint: "GET /api/v1/downloads" },
    });
    downloadListLatency.add(response.timings.duration);
    return { response, ok };
  }

  triggerDownload(payload) {
    const { response, ok } = this.client.post("/api/v1/downloads", payload, {
      tags: { endpoint: "POST /api/v1/downloads" },
    });
    downloadTriggerLatency.add(response.timings.duration);
    if (ok) downloadsTriggered.add(1);
    return { response, ok };
  }

  getDownloadStatus(downloadId) {
    const { response, ok } = this.client.get(`/api/v1/downloads/${downloadId}`, {
      tags: { endpoint: "GET /api/v1/downloads/{id}" },
    });
    const body = parseBody(response);
    if (ok && body && body.status === "completed") {
      downloadsCompleted.add(1);
    }
    return { response, ok, status: body?.status };
  }
}
