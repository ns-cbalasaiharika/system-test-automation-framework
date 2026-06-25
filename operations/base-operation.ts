import { HttpClient } from '../lib/http-client';
import type { RuntimeConfig } from '../types/config';
import type { IBaseOperation } from '../types/operations';

/**
 * Base class for all API operations.
 * Provides the HTTP client and common patterns.
 * Extend this for each endpoint group.
 * 
 * @example
 * class MyServiceOperation extends BaseOperation {
 *   constructor(config: RuntimeConfig) {
 *     super(config);
 *   }
 *   
 *   listItems() {
 *     return this.client.get('/api/v1/items');
 *   }
 * }
 */
export abstract class BaseOperation implements IBaseOperation {
  readonly config: RuntimeConfig;
  readonly baseUrl: string;
  protected readonly client: HttpClient;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.client = new HttpClient(config.baseUrl, config.headers);
  }

  /**
   * Get the HTTP client for direct access.
   * Useful when you need to make custom requests.
   */
  protected getClient(): HttpClient {
    return this.client;
  }

  /**
   * Update headers for tenant-aware operations.
   */
  protected setTenant(tenantId: string): void {
    this.client.setHeaders({
      'x-netskope-tenantid': tenantId,
    });
  }
}
