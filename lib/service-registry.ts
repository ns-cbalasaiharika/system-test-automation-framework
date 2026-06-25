/**
 * Service Registry - Extensible Service Management for the Framework
 * 
 * This module provides a centralized registry for managing service operations
 * and their associated metrics. Use this when adding new services to the framework.
 */

import type { RuntimeConfig, ServiceName } from '../types/config';
import type { OperationHandlers, OperationHandlerFactory } from '../types/operations';
import { BaseOperation } from '../operations/base-operation';
import { createServiceMetrics } from './metrics';
import { Trend, Counter } from 'k6/metrics';

// =============================================================================
// Service Registry Types
// =============================================================================

export interface ServiceDefinition<T extends BaseOperation = BaseOperation> {
  /** Service identifier matching config */
  name: ServiceName;
  
  /** Human-readable description */
  description: string;
  
  /** List of operations supported by this service */
  operations: string[];
  
  /** Factory function to create the operation class */
  operationFactory: (config: RuntimeConfig) => T;
  
  /** Factory function to create operation handlers */
  handlerFactory: OperationHandlerFactory<T>;
}

interface ServiceEntry<T extends BaseOperation = BaseOperation> {
  definition: ServiceDefinition<T>;
  metrics: {
    latency: Record<string, Trend>;
    counts: Record<string, Counter>;
  };
}

// =============================================================================
// Service Registry
// =============================================================================

class ServiceRegistry {
  private services: Map<ServiceName, ServiceEntry> = new Map();

  /**
   * Register a new service with the framework.
   */
  register<T extends BaseOperation>(definition: ServiceDefinition<T>): void {
    const metrics = createServiceMetrics(
      definition.name.replace(/-/g, '_'),
      definition.operations
    );

    this.services.set(definition.name, {
      definition: definition as unknown as ServiceDefinition,
      metrics,
    });
  }

  /**
   * Get a registered service definition.
   */
  get(name: ServiceName): ServiceEntry | undefined {
    return this.services.get(name);
  }

  /**
   * Check if a service is registered.
   */
  has(name: ServiceName): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names.
   */
  getServiceNames(): ServiceName[] {
    return Array.from(this.services.keys());
  }

  /**
   * Create operation handlers for a service.
   */
  createHandlers(name: ServiceName, config: RuntimeConfig): OperationHandlers | null {
    const entry = this.services.get(name);
    if (!entry) return null;

    const operation = entry.definition.operationFactory(config);
    return entry.definition.handlerFactory(operation);
  }

  /**
   * Get metrics for a service.
   */
  getMetrics(name: ServiceName): { latency: Record<string, Trend>; counts: Record<string, Counter> } | null {
    const entry = this.services.get(name);
    return entry?.metrics ?? null;
  }
}

// Global registry instance
export const serviceRegistry = new ServiceRegistry();

// =============================================================================
// Service Registration Helpers
// =============================================================================

/**
 * Decorator-style helper to define a service with operations.
 * 
 * @example
 * defineService({
 *   name: 'my-new-service',
 *   description: 'My new backend service',
 *   operations: ['list', 'get', 'create', 'update', 'delete'],
 *   operationFactory: (config) => new MyServiceOperation(config),
 *   handlerFactory: (ops) => ({
 *     list: () => ops.list(),
 *     get: () => ops.get(randomId()),
 *     create: () => ops.create(),
 *     update: () => ops.update(randomId()),
 *     delete: () => ops.delete(randomId()),
 *   }),
 * });
 */
export function defineService<T extends BaseOperation>(
  definition: ServiceDefinition<T>
): ServiceDefinition<T> {
  serviceRegistry.register(definition);
  return definition;
}

/**
 * Get or create handlers for a service based on config.
 */
export function getServiceHandlers(config: RuntimeConfig): OperationHandlers | null {
  return serviceRegistry.createHandlers(config.serviceName, config);
}

/**
 * Check if a service is registered in the registry.
 */
export function isServiceRegistered(serviceName: ServiceName): boolean {
  return serviceRegistry.has(serviceName);
}

/**
 * Get list of all registered services.
 */
export function getRegisteredServices(): ServiceName[] {
  return serviceRegistry.getServiceNames();
}

// =============================================================================
// Pre-built Service Templates
// =============================================================================

/**
 * Template for CRUD-style services.
 * Extend this for services with standard list/get/create/update/delete operations.
 */
export interface CRUDServiceTemplate<T> {
  list(): T[];
  getById(id: string | number): T | null;
  create(payload?: unknown): T;
  update(id: string | number, payload?: unknown): T;
  delete(id: string | number): void;
}

/**
 * Create standard CRUD handlers from a CRUD operation class.
 */
export function createCRUDHandlers<T extends BaseOperation & {
  list: () => unknown;
  getById: (id: string | number) => unknown;
  create: (payload?: unknown) => unknown;
  update: (id: string | number, payload?: unknown) => unknown;
  delete: (id: string | number) => unknown;
  getRandomId?: () => string | number | null;
  getDeletableIds?: () => Array<string | number>;
}>(ops: T, options: { randomInt: (min: number, max: number) => number }): OperationHandlers {
  const { randomInt } = options;

  return {
    list: () => ops.list(),
    
    get: () => {
      const id = ops.getRandomId?.() ?? 1;
      ops.getById(id);
    },
    
    create: () => ops.create(),
    
    update: () => {
      const id = ops.getRandomId?.();
      if (id) ops.update(id);
    },
    
    delete: () => {
      const ids = ops.getDeletableIds?.() ?? [];
      if (ids.length > 0) {
        const id = ids[randomInt(0, ids.length - 1)];
        ops.delete(id);
      }
    },
  };
}

// =============================================================================
// Service Documentation
// =============================================================================

/**
 * Generate documentation for all registered services.
 */
export function generateServiceDocs(): string {
  const docs: string[] = ['# Registered Services\n'];

  for (const name of serviceRegistry.getServiceNames()) {
    const entry = serviceRegistry.get(name);
    if (!entry) continue;

    const { definition } = entry;
    docs.push(`## ${definition.name}\n`);
    docs.push(`${definition.description}\n`);
    docs.push('### Operations\n');
    
    for (const op of definition.operations) {
      docs.push(`- ${op}`);
    }
    docs.push('\n');
  }

  return docs.join('\n');
}
