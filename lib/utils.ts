import { sleep } from 'k6';
import type { RefinedResponse, ResponseType } from 'k6/http';
import type { RuntimeConfig, TrafficMix } from '../types/config';

const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random string of given length.
 */
export function randomString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
  }
  return result;
}

/**
 * Generate a random integer between min and max (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Apply think time between operations based on config.
 */
export function thinkTime(config: RuntimeConfig): void {
  const minMs = config.thinkTime.minMs || 100;
  const maxMs = config.thinkTime.maxMs || 300;
  const ms = randomInt(minMs, maxMs);
  sleep(ms / 1000);
}

/**
 * Select an operation based on weighted traffic mix percentages.
 * trafficMix: { "listConfigs": 25, "getConfigById": 25, ... }
 * Returns the key of the selected operation.
 */
export function weightedSelect(trafficMix: TrafficMix): string {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const [operation, weight] of Object.entries(trafficMix)) {
    cumulative += weight;
    if (roll < cumulative) {
      return operation;
    }
  }

  const ops = Object.keys(trafficMix);
  return ops[ops.length - 1];
}

/**
 * Generate a unique name for test artifacts.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${randomString(8)}-${Date.now()}`;
}

/**
 * Parse JSON response body safely.
 */
export function parseBody<T = unknown>(response: RefinedResponse<ResponseType>): T | null {
  try {
    return JSON.parse(response.body as string) as T;
  } catch {
    return null;
  }
}

/**
 * Generate a random item from an array.
 */
export function randomItem<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(0, items.length - 1)];
}

/**
 * Check if a value is defined (not null or undefined).
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
