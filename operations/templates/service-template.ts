/**
 * Service Template - Copy this file when adding a new service to the framework
 * 
 * Steps to add a new service:
 * 1. Copy this file to operations/<service-name>/<service-name>-operations.ts
 * 2. Replace 'TEMPLATE' with your service name
 * 3. Update the API endpoints and response types
 * 4. Add service URL to config/environments/*.yaml
 * 5. Create workload configs in config/workloads/
 * 6. Create scenario scripts in scenarios/<category>/
 */

import { BaseOperation } from '../base-operation';
import { getOrCreateTrend, getOrCreateCounter } from '../../lib/metrics';
import { parseBody, randomString, randomInt } from '../../lib/utils';
import type { RuntimeConfig } from '../../types/config';
import type { OperationResult, OperationHandlers } from '../../types/operations';

// =============================================================================
// Response Types - Define your service's API response types
// =============================================================================

interface TemplateItem {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ListTemplateResponse {
  success: boolean;
  data: TemplateItem[];
}

interface GetTemplateResponse {
  success: boolean;
  data: TemplateItem;
}

// =============================================================================
// Metrics - Custom metrics for this service
// =============================================================================

const listLatency = getOrCreateTrend('latency_template_list');
const getLatency = getOrCreateTrend('latency_template_get');
const createLatency = getOrCreateTrend('latency_template_create');
const updateLatency = getOrCreateTrend('latency_template_update');
const deleteLatency = getOrCreateTrend('latency_template_delete');

const itemsCreated = getOrCreateCounter('template_items_created');
const itemsUpdated = getOrCreateCounter('template_items_updated');
const itemsDeleted = getOrCreateCounter('template_items_deleted');

// =============================================================================
// Operation Class
// =============================================================================

export class TemplateServiceOperation extends BaseOperation {
  constructor(config: RuntimeConfig) {
    super(config);
  }

  /**
   * List all items.
   */
  list(): OperationResult<TemplateItem[]> {
    const { response, ok } = this.client.get('/api/v1/items', {
      tags: { endpoint: 'GET /api/v1/items' },
    });
    listLatency.add(response.timings.duration);

    const body = ok ? parseBody<ListTemplateResponse>(response) : null;
    return { response, ok, data: body?.data };
  }

  /**
   * Get a single item by ID.
   */
  getById(id: string): OperationResult<TemplateItem> {
    const { response, ok } = this.client.get(`/api/v1/items/${id}`, {
      tags: { endpoint: 'GET /api/v1/items/{id}' },
    });
    getLatency.add(response.timings.duration);

    const body = ok ? parseBody<GetTemplateResponse>(response) : null;
    return { response, ok, data: body?.data };
  }

  /**
   * Create a new item.
   */
  create(payload?: Partial<TemplateItem>): OperationResult<TemplateItem> {
    const body = payload || {
      name: `k6-item-${randomString(8)}`,
      status: 'active',
    };

    const { response, ok } = this.client.post('/api/v1/items', body, {
      tags: { endpoint: 'POST /api/v1/items' },
    });
    createLatency.add(response.timings.duration);
    if (ok) itemsCreated.add(1);

    const parsed = ok ? parseBody<GetTemplateResponse>(response) : null;
    return { response, ok, data: parsed?.data };
  }

  /**
   * Update an existing item.
   */
  update(id: string, payload?: Partial<TemplateItem>): OperationResult<TemplateItem> {
    const body = payload || {
      name: `k6-updated-${randomString(6)}`,
    };

    const { response, ok } = this.client.patch(`/api/v1/items/${id}`, body, {
      tags: { endpoint: 'PATCH /api/v1/items/{id}' },
    });
    updateLatency.add(response.timings.duration);
    if (ok) itemsUpdated.add(1);

    const parsed = ok ? parseBody<GetTemplateResponse>(response) : null;
    return { response, ok, data: parsed?.data };
  }

  /**
   * Delete an item.
   */
  delete(id: string): OperationResult {
    const { response, ok } = this.client.del(`/api/v1/items/${id}`, {
      tags: { endpoint: 'DELETE /api/v1/items/{id}' },
    });
    deleteLatency.add(response.timings.duration);
    if (ok) itemsDeleted.add(1);

    return { response, ok };
  }

  /**
   * Get a random item ID from the list.
   */
  getRandomId(): string | null {
    const result = this.list();
    if (!result.ok || !result.data || result.data.length === 0) {
      return null;
    }
    return result.data[randomInt(0, result.data.length - 1)].id;
  }

  /**
   * Get IDs that can be safely deleted (k6-created items).
   */
  getDeletableIds(): string[] {
    const result = this.list();
    if (!result.ok || !result.data) return [];

    return result.data
      .filter((item) => item.name.startsWith('k6-'))
      .map((item) => item.id);
  }
}

// =============================================================================
// Handler Factory - Creates operation handlers for scenario runner
// =============================================================================

export function createTemplateHandlers(ops: TemplateServiceOperation): OperationHandlers {
  return {
    listItems: () => ops.list(),

    getItem: () => {
      const id = ops.getRandomId();
      if (id) {
        ops.getById(id);
      }
    },

    createItem: () => ops.create(),

    updateItem: () => {
      const id = ops.getRandomId();
      if (id) ops.update(id);
    },

    deleteItem: () => {
      const ids = ops.getDeletableIds();
      if (ids.length > 0) {
        const id = ids[randomInt(0, ids.length - 1)];
        ops.delete(id);
      }
    },
  };
}

// =============================================================================
// Service Registration (Optional - for automatic discovery)
// =============================================================================

// Uncomment to register this service with the service registry:
// 
// import { defineService } from '../../lib/service-registry';
// 
// defineService({
//   name: 'template-service',
//   description: 'Template service for demonstration',
//   operations: ['list', 'get', 'create', 'update', 'delete'],
//   operationFactory: (config) => new TemplateServiceOperation(config),
//   handlerFactory: createTemplateHandlers,
// });
