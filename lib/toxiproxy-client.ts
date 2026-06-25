/**
 * Toxiproxy Client for Fault Injection
 *
 * Provides programmatic control over Toxiproxy for injecting faults
 * during system tests. Supports latency, connection drops, bandwidth
 * limits, and more.
 */

import http from 'k6/http';

export interface ToxicAttributes {
  latency?: number;
  jitter?: number;
  rate?: number;
  timeout?: number;
  bytes?: number;
  average_size?: number;
  size_variation?: number;
  delay?: number;
}

export interface Toxic {
  name: string;
  type: ToxicType;
  stream?: 'upstream' | 'downstream';
  toxicity?: number;
  attributes: ToxicAttributes;
}

export type ToxicType =
  | 'latency'
  | 'bandwidth'
  | 'slow_close'
  | 'timeout'
  | 'reset_peer'
  | 'slicer'
  | 'limit_data';

export interface Proxy {
  name: string;
  listen: string;
  upstream: string;
  enabled: boolean;
  toxics?: Toxic[];
}

export interface ToxiproxyResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Client for interacting with Toxiproxy API.
 * Use this to programmatically inject and remove faults during tests.
 */
export class ToxiproxyClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  /**
   * List all configured proxies.
   */
  listProxies(): ToxiproxyResult & { proxies?: Record<string, Proxy> } {
    const response = http.get(`${this.apiUrl}/proxies`, {
      tags: { component: 'toxiproxy', operation: 'list_proxies' },
    });

    if (response.status === 200) {
      return {
        success: true,
        message: 'Proxies listed successfully',
        proxies: JSON.parse(response.body as string),
      };
    }

    return {
      success: false,
      message: `Failed to list proxies: ${response.status}`,
    };
  }

  /**
   * Get a specific proxy by name.
   */
  getProxy(name: string): ToxiproxyResult & { proxy?: Proxy } {
    const response = http.get(`${this.apiUrl}/proxies/${name}`, {
      tags: { component: 'toxiproxy', operation: 'get_proxy', proxy: name },
    });

    if (response.status === 200) {
      return {
        success: true,
        message: `Proxy ${name} retrieved`,
        proxy: JSON.parse(response.body as string),
      };
    }

    return {
      success: false,
      message: `Failed to get proxy ${name}: ${response.status}`,
    };
  }

  /**
   * Add latency to a proxy.
   */
  addLatency(
    proxyName: string,
    latencyMs: number,
    jitterMs = 0,
    stream: 'upstream' | 'downstream' = 'downstream'
  ): ToxiproxyResult {
    const toxic: Toxic = {
      name: `latency_${stream}`,
      type: 'latency',
      stream,
      toxicity: 1.0,
      attributes: {
        latency: latencyMs,
        jitter: jitterMs,
      },
    };

    return this.addToxic(proxyName, toxic);
  }

  /**
   * Add bandwidth limit to a proxy.
   */
  addBandwidthLimit(
    proxyName: string,
    bytesPerSecond: number,
    stream: 'upstream' | 'downstream' = 'downstream'
  ): ToxiproxyResult {
    const toxic: Toxic = {
      name: `bandwidth_${stream}`,
      type: 'bandwidth',
      stream,
      toxicity: 1.0,
      attributes: {
        rate: bytesPerSecond,
      },
    };

    return this.addToxic(proxyName, toxic);
  }

  /**
   * Add connection timeout to a proxy.
   */
  addTimeout(proxyName: string, timeoutMs: number): ToxiproxyResult {
    const toxic: Toxic = {
      name: 'timeout',
      type: 'timeout',
      toxicity: 1.0,
      attributes: {
        timeout: timeoutMs,
      },
    };

    return this.addToxic(proxyName, toxic);
  }

  /**
   * Reset peer connections (simulates connection drop).
   */
  resetPeer(proxyName: string, timeoutMs = 0): ToxiproxyResult {
    const toxic: Toxic = {
      name: 'reset_peer',
      type: 'reset_peer',
      toxicity: 1.0,
      attributes: {
        timeout: timeoutMs,
      },
    };

    return this.addToxic(proxyName, toxic);
  }

  /**
   * Limit data transferred before closing connection.
   */
  limitData(proxyName: string, bytes: number): ToxiproxyResult {
    const toxic: Toxic = {
      name: 'limit_data',
      type: 'limit_data',
      toxicity: 1.0,
      attributes: {
        bytes,
      },
    };

    return this.addToxic(proxyName, toxic);
  }

  /**
   * Slow close - delay closing connections.
   */
  slowClose(proxyName: string, delayMs: number): ToxiproxyResult {
    const toxic: Toxic = {
      name: 'slow_close',
      type: 'slow_close',
      toxicity: 1.0,
      attributes: {
        delay: delayMs,
      },
    };

    return this.addToxic(proxyName, toxic);
  }

  /**
   * Add a custom toxic to a proxy.
   */
  addToxic(proxyName: string, toxic: Toxic): ToxiproxyResult {
    const response = http.post(
      `${this.apiUrl}/proxies/${proxyName}/toxics`,
      JSON.stringify(toxic),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: {
          component: 'toxiproxy',
          operation: 'add_toxic',
          proxy: proxyName,
          toxic_type: toxic.type,
        },
      }
    );

    if (response.status === 200 || response.status === 201) {
      console.log(`[TOXIPROXY] Added ${toxic.type} to ${proxyName}`);
      return {
        success: true,
        message: `Added ${toxic.type} toxic to ${proxyName}`,
        data: JSON.parse(response.body as string),
      };
    }

    console.warn(`[TOXIPROXY] Failed to add ${toxic.type} to ${proxyName}: ${response.status}`);
    return {
      success: false,
      message: `Failed to add toxic: ${response.status} - ${response.body}`,
    };
  }

  /**
   * Remove a specific toxic from a proxy.
   */
  removeToxic(proxyName: string, toxicName: string): ToxiproxyResult {
    const response = http.del(
      `${this.apiUrl}/proxies/${proxyName}/toxics/${toxicName}`,
      null,
      {
        tags: {
          component: 'toxiproxy',
          operation: 'remove_toxic',
          proxy: proxyName,
        },
      }
    );

    if (response.status === 204 || response.status === 200) {
      console.log(`[TOXIPROXY] Removed ${toxicName} from ${proxyName}`);
      return {
        success: true,
        message: `Removed ${toxicName} from ${proxyName}`,
      };
    }

    return {
      success: false,
      message: `Failed to remove toxic: ${response.status}`,
    };
  }

  /**
   * List all toxics on a proxy.
   */
  listToxics(proxyName: string): ToxiproxyResult & { toxics?: Toxic[] } {
    const response = http.get(`${this.apiUrl}/proxies/${proxyName}/toxics`, {
      tags: { component: 'toxiproxy', operation: 'list_toxics', proxy: proxyName },
    });

    if (response.status === 200) {
      return {
        success: true,
        message: 'Toxics listed',
        toxics: JSON.parse(response.body as string),
      };
    }

    return {
      success: false,
      message: `Failed to list toxics: ${response.status}`,
    };
  }

  /**
   * Remove all toxics from a proxy (reset to clean state).
   */
  reset(proxyName: string): ToxiproxyResult {
    const listResult = this.listToxics(proxyName);

    if (!listResult.success || !listResult.toxics) {
      return {
        success: false,
        message: `Failed to list toxics for reset: ${listResult.message}`,
      };
    }

    let removed = 0;
    for (const toxic of listResult.toxics) {
      const removeResult = this.removeToxic(proxyName, toxic.name);
      if (removeResult.success) {
        removed++;
      }
    }

    console.log(`[TOXIPROXY] Reset ${proxyName}: removed ${removed} toxics`);
    return {
      success: true,
      message: `Reset ${proxyName}: removed ${removed} toxics`,
    };
  }

  /**
   * Reset all proxies (remove all toxics from all proxies).
   */
  resetAll(): ToxiproxyResult {
    const listResult = this.listProxies();

    if (!listResult.success || !listResult.proxies) {
      return {
        success: false,
        message: `Failed to list proxies for reset: ${listResult.message}`,
      };
    }

    let totalRemoved = 0;
    for (const proxyName of Object.keys(listResult.proxies)) {
      const resetResult = this.reset(proxyName);
      if (resetResult.success) {
        totalRemoved++;
      }
    }

    console.log(`[TOXIPROXY] Reset all: processed ${totalRemoved} proxies`);
    return {
      success: true,
      message: `Reset all proxies: processed ${totalRemoved}`,
    };
  }

  /**
   * Enable a proxy.
   */
  enableProxy(proxyName: string): ToxiproxyResult {
    const response = http.post(
      `${this.apiUrl}/proxies/${proxyName}`,
      JSON.stringify({ enabled: true }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { component: 'toxiproxy', operation: 'enable_proxy', proxy: proxyName },
      }
    );

    if (response.status === 200) {
      console.log(`[TOXIPROXY] Enabled ${proxyName}`);
      return {
        success: true,
        message: `Enabled ${proxyName}`,
      };
    }

    return {
      success: false,
      message: `Failed to enable proxy: ${response.status}`,
    };
  }

  /**
   * Disable a proxy (blocks all traffic).
   */
  disableProxy(proxyName: string): ToxiproxyResult {
    const response = http.post(
      `${this.apiUrl}/proxies/${proxyName}`,
      JSON.stringify({ enabled: false }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { component: 'toxiproxy', operation: 'disable_proxy', proxy: proxyName },
      }
    );

    if (response.status === 200) {
      console.log(`[TOXIPROXY] Disabled ${proxyName}`);
      return {
        success: true,
        message: `Disabled ${proxyName}`,
      };
    }

    return {
      success: false,
      message: `Failed to disable proxy: ${response.status}`,
    };
  }

  /**
   * Check if Toxiproxy is healthy.
   */
  healthCheck(): ToxiproxyResult {
    const response = http.get(`${this.apiUrl}/version`, {
      tags: { component: 'toxiproxy', operation: 'health_check' },
    });

    if (response.status === 200) {
      return {
        success: true,
        message: 'Toxiproxy is healthy',
        data: response.body,
      };
    }

    return {
      success: false,
      message: `Toxiproxy health check failed: ${response.status}`,
    };
  }
}

/**
 * Predefined fault injection presets for common scenarios.
 */
export const FaultPresets = {
  /**
   * Simulate slow database (S4.1, S9)
   */
  slowDatabase: (client: ToxiproxyClient, latencyMs = 500) => {
    client.addLatency('mariadb-rw', latencyMs, 50);
    client.addLatency('mariadb-ro', latencyMs, 50);
  },

  /**
   * Simulate database RW failure (S4.1)
   */
  databaseRwDown: (client: ToxiproxyClient) => {
    client.disableProxy('mariadb-rw');
  },

  /**
   * Simulate database RO failure (S4.1)
   */
  databaseRoDown: (client: ToxiproxyClient) => {
    client.disableProxy('mariadb-ro');
  },

  /**
   * Simulate Kafka partition (S10)
   */
  kafkaPartition: (client: ToxiproxyClient) => {
    client.disableProxy('kafka');
  },

  /**
   * Simulate User Manager down (S4.2, S4.3)
   */
  userManagerDown: (client: ToxiproxyClient) => {
    client.resetPeer('user-manager');
  },

  /**
   * Simulate Provisioner 50% errors (S4.2)
   */
  provisionerDegraded: (client: ToxiproxyClient) => {
    client.addBandwidthLimit('provisioner', 1);
  },

  /**
   * Simulate Addonman slow (S4.2)
   */
  addonmanSlow: (client: ToxiproxyClient, latencyMs = 5000) => {
    client.addLatency('addonman', latencyMs);
  },

  /**
   * Simulate NPA down (S4.2, S4.3)
   */
  npaDown: (client: ToxiproxyClient) => {
    client.resetPeer('npa-qdispatcher');
  },

  /**
   * Reset all faults
   */
  resetAll: (client: ToxiproxyClient) => {
    client.resetAll();
    client.enableProxy('mariadb-rw');
    client.enableProxy('mariadb-ro');
    client.enableProxy('kafka');
    client.enableProxy('user-manager');
    client.enableProxy('provisioner');
    client.enableProxy('addonman');
    client.enableProxy('npa-qdispatcher');
    client.enableProxy('ris');
  },
};
