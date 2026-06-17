import http from "k6/http";
import { sleep } from "k6";

/**
 * Pre-seeds the target environment with test configs.
 * Call from scenario setup() function.
 */
export function seedConfigs(baseUrl, headers, count) {
  const created = [];

  for (let i = 0; i < count; i++) {
    const body = JSON.stringify({
      configurationName: `k6-seed-${i}-${Date.now()}`,
      targets: [
        {
          type: "user_group",
          values: [
            { id: `seed-grp-${i}`, name: `seed-group-${i}` },
          ],
        },
      ],
    });

    const res = http.post(`${baseUrl}/client/config`, body, { headers });
    if (res.status === 201) {
      try {
        const data = JSON.parse(res.body);
        if (data.data && data.data.id) {
          created.push(data.data.id);
        }
      } catch (_) {}
    }

    sleep(0.1);
  }

  return created;
}

/**
 * Removes all k6-created test configs (id > 5).
 * Call from scenario teardown() function.
 */
export function cleanupConfigs(baseUrl, headers) {
  const listRes = http.get(`${baseUrl}/client/config`, { headers });
  if (listRes.status !== 200) return 0;

  let deleted = 0;
  try {
    const body = JSON.parse(listRes.body);
    if (!body.success || !body.data) return 0;

    const deletable = body.data
      .filter((c) => parseInt(c.id) > 5)
      .map((c) => c.id);

    for (const id of deletable) {
      const res = http.del(`${baseUrl}/client/config/${id}`, null, { headers });
      if (res.status === 204) deleted++;
      sleep(0.05);
    }
  } catch (_) {}

  return deleted;
}

/**
 * Wait for service to be healthy before starting test.
 */
export function waitForReady(baseUrl, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = http.get(`${baseUrl}/api/v1/ready`);
      if (res.status === 200) {
        const body = JSON.parse(res.body);
        if (body.status === "ready") return true;
      }
    } catch (_) {}
    sleep(1);
  }
  return false;
}
