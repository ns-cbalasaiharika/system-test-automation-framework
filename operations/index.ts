/**
 * K6 System Test Automation Framework - Operations
 * 
 * Central export point for all service operations.
 * Each service has its own directory with specialized operations.
 */

// Base Operation
export { BaseOperation } from './base-operation';

// =============================================================================
// CLIENT-OPPY CONFIGURATION SERVICE
// Primary service for client configuration management
// =============================================================================
export {
  ConfigCrudOperation,
  ConfigListOperation,
  ConfigVersionsOperation,
  ConfigPlatformsOperation,
  BulkDeleteOperation,
  TenantAwareCrudOperation,
} from './client-oppy';

// =============================================================================
// OTHER SERVICES
// See README.md in each service folder for implementation guidance:
// - operations/addonman/README.md
// - operations/downloader/README.md
// - operations/device-classification/README.md
// - operations/provisioner/README.md
// - operations/user-manager/README.md
// - operations/enrollment/README.md
// =============================================================================
