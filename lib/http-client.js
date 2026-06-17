import http from "k6/http";
import { check } from "k6";
import { errorRate, requestsTotal } from "./metrics.js";

/**
 * HTTP client wrapper that applies tenant headers, tags requests,
 * and records common metrics. All operations should use this.
 */
export class HttpClient {
  constructor(baseUrl, headers) {
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  get(path, { tags = {}, expectedStatus = 200 } = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = http.get(url, {
      headers: this.headers,
      tags: Object.assign({ method: "GET", path }, tags),
    });

    requestsTotal.add(1);
    const ok = check(res, {
      [`GET ${path}: status ${expectedStatus}`]: (r) =>
        r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response: res, ok };
  }

  post(path, body, { tags = {}, expectedStatus = 201 } = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = http.post(url, JSON.stringify(body), {
      headers: this.headers,
      tags: Object.assign({ method: "POST", path }, tags),
    });

    requestsTotal.add(1);
    const ok = check(res, {
      [`POST ${path}: status ${expectedStatus}`]: (r) =>
        r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response: res, ok };
  }

  patch(path, body, { tags = {}, expectedStatus = 200 } = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = http.patch(url, JSON.stringify(body), {
      headers: this.headers,
      tags: Object.assign({ method: "PATCH", path }, tags),
    });

    requestsTotal.add(1);
    const ok = check(res, {
      [`PATCH ${path}: status ${expectedStatus}`]: (r) =>
        r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response: res, ok };
  }

  del(path, { tags = {}, expectedStatus = 204 } = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = http.del(url, null, {
      headers: this.headers,
      tags: Object.assign({ method: "DELETE", path }, tags),
    });

    requestsTotal.add(1);
    const ok = check(res, {
      [`DELETE ${path}: status ${expectedStatus}`]: (r) =>
        r.status === expectedStatus,
    });
    errorRate.add(!ok);

    return { response: res, ok };
  }
}
