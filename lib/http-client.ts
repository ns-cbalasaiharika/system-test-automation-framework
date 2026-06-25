import http from 'k6/http';
import { check } from 'k6';
import { errorRate, requestsTotal } from './metrics';
import type { RequestOptions, OperationResult } from '../types/operations';

/**
 * HTTP client wrapper that applies tenant headers, tags requests,
 * and records common metrics. All operations should use this.
 */
export class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl: string, headers: Record<string, string>) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  /**
   * Merge base headers with per-request headers.
   */
  private mergeHeaders(requestHeaders?: Record<string, string>): Record<string, string> {
    return requestHeaders ? { ...this.headers, ...requestHeaders } : this.headers;
  }

  /**
   * Perform a GET request with automatic metrics recording.
   */
  get(path: string, options: RequestOptions = {}): OperationResult {
    const { tags = {}, expectedStatus = 200, headers: requestHeaders } = options;
    const url = `${this.baseUrl}${path}`;

    const response = http.get(url, {
      headers: this.mergeHeaders(requestHeaders),
      tags: { method: 'GET', path, ...tags } as Record<string, string>,
    });

    requestsTotal.add(1);
    const ok = check(response, {
      [`GET ${path}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response, ok };
  }

  /**
   * Perform a POST request with automatic metrics recording.
   */
  post<T = unknown>(
    path: string,
    body: T,
    options: RequestOptions = {}
  ): OperationResult {
    const { tags = {}, expectedStatus = 201, headers: requestHeaders } = options;
    const url = `${this.baseUrl}${path}`;

    const response = http.post(url, JSON.stringify(body), {
      headers: this.mergeHeaders(requestHeaders),
      tags: { method: 'POST', path, ...tags } as Record<string, string>,
    });

    requestsTotal.add(1);
    const ok = check(response, {
      [`POST ${path}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response, ok };
  }

  /**
   * Perform a PUT request with automatic metrics recording.
   */
  put<T = unknown>(
    path: string,
    body: T,
    options: RequestOptions = {}
  ): OperationResult {
    const { tags = {}, expectedStatus = 200, headers: requestHeaders } = options;
    const url = `${this.baseUrl}${path}`;

    const response = http.put(url, JSON.stringify(body), {
      headers: this.mergeHeaders(requestHeaders),
      tags: { method: 'PUT', path, ...tags } as Record<string, string>,
    });

    requestsTotal.add(1);
    const ok = check(response, {
      [`PUT ${path}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response, ok };
  }

  /**
   * Perform a PATCH request with automatic metrics recording.
   */
  patch<T = unknown>(
    path: string,
    body: T,
    options: RequestOptions = {}
  ): OperationResult {
    const { tags = {}, expectedStatus = 200, headers: requestHeaders } = options;
    const url = `${this.baseUrl}${path}`;

    const response = http.patch(url, JSON.stringify(body), {
      headers: this.mergeHeaders(requestHeaders),
      tags: { method: 'PATCH', path, ...tags } as Record<string, string>,
    });

    requestsTotal.add(1);
    const ok = check(response, {
      [`PATCH ${path}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response, ok };
  }

  /**
   * Perform a DELETE request with automatic metrics recording.
   */
  del(path: string, options: RequestOptions = {}): OperationResult {
    const { tags = {}, expectedStatus = 204, headers: requestHeaders } = options;
    const url = `${this.baseUrl}${path}`;

    const response = http.del(url, null, {
      headers: this.mergeHeaders(requestHeaders),
      tags: { method: 'DELETE', path, ...tags } as Record<string, string>,
    });

    requestsTotal.add(1);
    const ok = check(response, {
      [`DELETE ${path}: status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response, ok };
  }

  /**
   * Update the default headers (useful for tenant-aware operations).
   */
  setHeaders(headers: Record<string, string>): void {
    this.headers = { ...this.headers, ...headers };
  }

  /**
   * Get the current base URL.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the current headers.
   */
  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }
}
