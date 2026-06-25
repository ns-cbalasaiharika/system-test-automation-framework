import { sleep } from 'k6';
import { BaseOperation } from '../base-operation';
import { bulkStatusLatency, bulkJobsPolled } from '../../lib/metrics';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult, IBulkStatusOperation, BulkJobStatus } from '../../types/operations';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

/**
 * Poll bulk delete job status via GET /client/config/bulkstatus/{jobid}.
 * Jobs are retained for ~7 days on the server.
 */
export class BulkStatusOperation extends BaseOperation implements IBulkStatusOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  getJobStatus(jobId: string): OperationResult<BulkJobStatus> {
    const { response, ok } = this.client.get(
      `/client/config/bulkstatus/${jobId}`,
      {
        tags: { endpoint: 'GET /client/config/bulkstatus/{jobid}' },
        expectedStatus: 200,
      }
    );
    bulkStatusLatency.add(response.timings.duration);
    bulkJobsPolled.add(1);

    let data: BulkJobStatus | undefined;
    try {
      const parsed = response.json() as Record<string, unknown>;
      data = {
        jobId: String(parsed['jobId'] || jobId),
        status: (parsed['status'] as BulkJobStatus['status']) || 'pending',
        totalCount: parsed['totalCount'] as number | undefined,
        deletedCount: parsed['deletedCount'] as number | undefined,
        failedCount: parsed['failedCount'] as number | undefined,
        completedAt: parsed['completedAt'] as string | undefined,
      };
    } catch {
      data = { jobId, status: 'pending' };
    }

    return { response, ok, data };
  }

  /**
   * Poll until the job reaches a terminal state (completed/failed) or timeout.
   */
  pollUntilComplete(
    jobId: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
  ): OperationResult<BulkJobStatus> {
    const deadline = Date.now() + timeoutMs;
    let result = this.getJobStatus(jobId);

    while (
      result.data &&
      result.data.status !== 'completed' &&
      result.data.status !== 'failed' &&
      Date.now() < deadline
    ) {
      sleep(intervalMs / 1000);
      result = this.getJobStatus(jobId);
    }

    return result;
  }
}
