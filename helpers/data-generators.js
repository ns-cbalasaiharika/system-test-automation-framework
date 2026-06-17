import { randomString, randomInt } from "../lib/utils.js";

/**
 * Generate a valid config creation payload.
 */
export function generateConfigPayload(options = {}) {
  const name = options.name || `k6-${randomString(8)}-${Date.now()}`;
  const targetType = options.targetType || randomTargetType();

  return {
    configurationName: name,
    targets: [
      {
        type: targetType,
        values: generateTargetValues(targetType),
      },
    ],
  };
}

/**
 * Generate a config update (PATCH) payload.
 */
export function generateUpdatePayload(options = {}) {
  const payload = {};

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
export function generateBulkPayloads(count, prefix = "k6-bulk") {
  const payloads = [];
  for (let i = 0; i < count; i++) {
    payloads.push({
      configurationName: `${prefix}-${i}-${randomString(4)}`,
      targets: [
        {
          type: "user_group",
          values: [
            { id: `grp-${randomString(4)}`, name: `group-${i}` },
          ],
        },
      ],
    });
  }
  return payloads;
}

function randomTargetType() {
  const types = ["user_group", "organizational_unit", "user"];
  return types[randomInt(0, types.length - 1)];
}

function generateTargetValues(type) {
  const count = randomInt(1, 3);
  const values = [];
  for (let i = 0; i < count; i++) {
    values.push({
      id: `k6-${type}-${randomString(6)}`,
      name: `k6-${type}-name-${randomString(4)}`,
    });
  }
  return values;
}
