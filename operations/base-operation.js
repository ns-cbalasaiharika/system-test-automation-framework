import { HttpClient } from "../lib/http-client.js";

/**
 * Base class for all API operations.
 * Provides the HTTP client and common patterns.
 * Extend this for each endpoint group.
 */
export class BaseOperation {
  constructor(config) {
    this.config = config;
    this.client = new HttpClient(config.baseUrl, config.headers);
    this.baseUrl = config.baseUrl;
  }
}
