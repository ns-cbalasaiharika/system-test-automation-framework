import { randomString, randomInt } from '../lib/utils';
import type { ConfigTarget, CreateConfigPayload, UpdateConfigPayload } from '../types/operations';

type TargetType = 'user_group' | 'organizational_unit' | 'user';

const TARGET_TYPES: TargetType[] = ['user_group', 'organizational_unit', 'user'];

/**
 * Generate a random target type.
 */
function randomTargetType(): TargetType {
  return TARGET_TYPES[randomInt(0, TARGET_TYPES.length - 1)];
}

/**
 * Generate target values for a given type.
 */
function generateTargetValues(type: TargetType): Array<{ id: string; name: string }> {
  const count = randomInt(1, 3);
  const values: Array<{ id: string; name: string }> = [];
  
  for (let i = 0; i < count; i++) {
    values.push({
      id: `k6-${type}-${randomString(6)}`,
      name: `k6-${type}-name-${randomString(4)}`,
    });
  }
  
  return values;
}

export interface GenerateConfigOptions {
  name?: string;
  targetType?: TargetType;
  targetCount?: number;
}

/**
 * Generate a valid config creation payload.
 */
export function generateConfigPayload(options: GenerateConfigOptions = {}): CreateConfigPayload {
  const name = options.name || `k6-${randomString(8)}-${Date.now()}`;
  const targetType = options.targetType || randomTargetType();

  const targets: ConfigTarget[] = [
    {
      type: targetType,
      values: generateTargetValues(targetType),
    },
  ];

  // Add additional targets if requested
  if (options.targetCount && options.targetCount > 1) {
    for (let i = 1; i < options.targetCount; i++) {
      const type = randomTargetType();
      targets.push({
        type,
        values: generateTargetValues(type),
      });
    }
  }

  return {
    configurationName: name,
    targets,
  };
}

export interface GenerateUpdateOptions {
  name?: string;
}

/**
 * Generate a config update (PATCH) payload.
 */
export function generateUpdatePayload(options: GenerateUpdateOptions = {}): UpdateConfigPayload {
  const payload: UpdateConfigPayload = {};

  if (options.name !== undefined) {
    payload.configurationName = options.name;
  } else {
    payload.configurationName = `k6-updated-${randomString(6)}`;
  }

  return payload;
}

/**
 * Generate bulk config payloads for seeding.
 */
export function generateBulkPayloads(count: number, prefix = 'k6-bulk'): CreateConfigPayload[] {
  const payloads: CreateConfigPayload[] = [];
  
  for (let i = 0; i < count; i++) {
    payloads.push({
      configurationName: `${prefix}-${i}-${randomString(4)}`,
      targets: [
        {
          type: 'user_group',
          values: [
            { id: `grp-${randomString(4)}`, name: `group-${i}` },
          ],
        },
      ],
    });
  }
  
  return payloads;
}

/**
 * Generate a random email address.
 */
export function generateEmail(domain = 'netskope.com'): string {
  return `k6-test-${randomString(8)}@${domain}`;
}

/**
 * Generate a random UUID-like string.
 */
export function generateUUID(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[randomInt(8, 11)];
    } else {
      uuid += hex[randomInt(0, 15)];
    }
  }
  
  return uuid;
}

/**
 * Generate device attributes for classification.
 */
export function generateDeviceAttributes(): Record<string, unknown> {
  return {
    os: randomItem(['Windows', 'macOS', 'Linux', 'iOS', 'Android']),
    osVersion: `${randomInt(10, 15)}.${randomInt(0, 9)}.${randomInt(0, 9)}`,
    browser: randomItem(['Chrome', 'Firefox', 'Safari', 'Edge']),
    deviceType: randomItem(['desktop', 'laptop', 'mobile', 'tablet']),
    managed: Math.random() > 0.5,
    serialNumber: `SN-${randomString(10).toUpperCase()}`,
  };
}

function randomItem<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}
