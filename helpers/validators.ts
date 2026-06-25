import http from 'k6/http';
import type { ClientConfig, ListConfigsResponse } from '../types/operations';

export interface ValidationResult {
  pass: boolean;
  reason?: string;
  actual?: number;
  expected?: number;
  total?: number;
  leaked?: number;
  gap?: { after: number; before: number };
  count?: number;
  configs?: number;
}

/**
 * Post-test validation: verify DB state matches expected outcomes.
 * Used in data integrity scenarios (DI-*).
 */
export function validateConfigCount(
  baseUrl: string,
  headers: Record<string, string>,
  expectedMinCount: number
): ValidationResult {
  const res = http.get(`${baseUrl}/client/config`, { headers });
  
  if (res.status !== 200) {
    return { pass: false, reason: 'list failed' };
  }

  try {
    const body = JSON.parse(res.body as string) as ListConfigsResponse;
    const count = body.data ? body.data.length : 0;
    const pass = count >= expectedMinCount;
    return { pass, actual: count, expected: expectedMinCount };
  } catch {
    return { pass: false, reason: 'parse failed' };
  }
}

/**
 * Validate no cross-tenant data leakage.
 * Each config name should contain the tenant prefix.
 */
export function validateTenantIsolation(
  baseUrl: string,
  tenantId: string,
  headers: Record<string, string>
): ValidationResult {
  const res = http.get(`${baseUrl}/client/config`, { headers });
  
  if (res.status !== 200) {
    return { pass: false, reason: 'list failed' };
  }

  try {
    const body = JSON.parse(res.body as string) as ListConfigsResponse;
    
    if (!body.data) {
      return { pass: true, configs: 0 };
    }

    const leaked = body.data.filter((c: ClientConfig) => {
      if (!c.configurationName) return false;
      if (c.configurationName.startsWith('k6-')) {
        return !c.configurationName.includes(tenantId);
      }
      return false;
    });

    return {
      pass: leaked.length === 0,
      total: body.data.length,
      leaked: leaked.length,
    };
  } catch {
    return { pass: false, reason: 'parse failed' };
  }
}

/**
 * Validate priority contiguity (no gaps after bulk operations).
 */
export function validatePriorityContiguous(
  baseUrl: string,
  headers: Record<string, string>
): ValidationResult {
  const res = http.get(`${baseUrl}/client/config`, { headers });
  
  if (res.status !== 200) {
    return { pass: false, reason: 'list failed' };
  }

  try {
    const body = JSON.parse(res.body as string) as ListConfigsResponse;
    
    if (!body.data || body.data.length === 0) {
      return { pass: true };
    }

    const priorities = body.data
      .map((c: ClientConfig) => parseInt(String(c.priority)))
      .filter((p: number) => !isNaN(p))
      .sort((a: number, b: number) => a - b);

    for (let i = 1; i < priorities.length; i++) {
      if (priorities[i] !== priorities[i - 1] + 1) {
        return {
          pass: false,
          gap: { after: priorities[i - 1], before: priorities[i] },
        };
      }
    }

    return { pass: true, count: priorities.length };
  } catch {
    return { pass: false, reason: 'parse failed' };
  }
}

/**
 * Validate response contains expected fields.
 */
export function validateResponseFields<T extends Record<string, unknown>>(
  data: T | null | undefined,
  requiredFields: string[]
): ValidationResult {
  if (!data) {
    return { pass: false, reason: 'no data' };
  }

  const missingFields = requiredFields.filter(field => !(field in data));
  
  if (missingFields.length > 0) {
    return { pass: false, reason: `missing fields: ${missingFields.join(', ')}` };
  }

  return { pass: true };
}

/**
 * Validate response time is within acceptable range.
 */
export function validateResponseTime(
  durationMs: number,
  maxMs: number
): ValidationResult {
  const pass = durationMs <= maxMs;
  return {
    pass,
    actual: durationMs,
    expected: maxMs,
    reason: pass ? undefined : `response time ${durationMs}ms exceeds ${maxMs}ms`,
  };
}
