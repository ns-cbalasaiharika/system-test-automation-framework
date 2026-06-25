/**
 * Operation Types for the K6 System Test Automation Framework
 * 
 * These types define the structure of API operations and responses,
 * designed to be extensible for any backend service.
 */

import type { RefinedResponse, ResponseType } from 'k6/http';
import type { RuntimeConfig, ServiceName } from './config';

// =============================================================================
// HTTP Client Types
// =============================================================================

export interface RequestTags {
  method?: string;
  path?: string;
  endpoint?: string;
  service?: ServiceName;
  [key: string]: string | undefined;
}

export interface RequestOptions {
  tags?: RequestTags;
  expectedStatus?: number;
  headers?: Record<string, string>;
}

export interface OperationResult<T = unknown> {
  response: RefinedResponse<ResponseType>;
  ok: boolean;
  data?: T;
}

// =============================================================================
// Base Operation Interface
// =============================================================================

/**
 * Interface that all service operations must implement.
 * This ensures consistency across different service integrations.
 */
export interface IBaseOperation {
  readonly config: RuntimeConfig;
  readonly baseUrl: string;
}

// =============================================================================
// Client Configuration Service Types (client-oppy)
// =============================================================================

export interface ConfigTarget {
  type: 'user_group' | 'organizational_unit' | 'user';
  values: Array<{
    id: string;
    name: string;
  }>;
}

export interface ClientConfig {
  id: string | number;
  configurationName: string;
  priority?: number;
  targets?: ConfigTarget[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateConfigPayload {
  configurationName: string;
  targets: ConfigTarget[];
}

export interface UpdateConfigPayload {
  configurationName?: string;
  targets?: ConfigTarget[];
}

export interface ListConfigsResponse {
  success: boolean;
  data: ClientConfig[];
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface GetConfigResponse {
  success: boolean;
  data: ClientConfig;
}

export interface CreateConfigResponse {
  success: boolean;
  data: ClientConfig;
}

// Client-oppy Operation Interfaces
export interface IConfigCrudOperation extends IBaseOperation {
  getById(id: string | number): OperationResult<ClientConfig>;
  create(payload?: CreateConfigPayload): OperationResult<ClientConfig> & { configId: string | null };
  update(id: string | number, payload?: UpdateConfigPayload): OperationResult;
  delete(id: string | number): OperationResult;
  getRandomId(): string | number | null;
  getDeletableIds(): Array<string | number>;
}

export interface IConfigListOperation extends IBaseOperation {
  list(): OperationResult<ClientConfig[]>;
}

export interface IConfigVersionsOperation extends IBaseOperation {
  getVersions(): OperationResult;
}

export interface IConfigPlatformsOperation extends IBaseOperation {
  getPlatforms(): OperationResult;
}

export interface BulkDeleteResponse {
  jobId: string;
}

export interface BulkJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalCount?: number;
  deletedCount?: number;
  failedCount?: number;
  completedAt?: string;
}

export interface IBulkDeleteOperation extends IBaseOperation {
  bulkDelete(ids: Array<string | number>, idempotencyToken?: string): OperationResult<BulkDeleteResponse>;
}

export interface IBulkStatusOperation extends IBaseOperation {
  getJobStatus(jobId: string): OperationResult<BulkJobStatus>;
  pollUntilComplete(jobId: string, timeoutMs?: number, intervalMs?: number): OperationResult<BulkJobStatus>;
}

// =============================================================================
// Addonman Service Types
// =============================================================================

export interface Addon {
  id: string;
  name: string;
  version: string;
  type: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAddonPayload {
  name: string;
  version: string;
  type: string;
}

export interface UpdateAddonPayload {
  name?: string;
  version?: string;
  type?: string;
}

export interface IAddonOperation extends IBaseOperation {
  listAddons(): OperationResult<Addon[]>;
  getAddon(id: string): OperationResult<Addon>;
  createAddon(payload?: CreateAddonPayload): OperationResult<Addon>;
  updateAddon(id: string, payload: UpdateAddonPayload): OperationResult<Addon>;
  deleteAddon(id: string): OperationResult;
}

// =============================================================================
// Downloader Service Types
// =============================================================================

export interface Download {
  id: string;
  fileName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  downloadUrl?: string;
  size?: number;
  createdAt?: string;
}

export interface IDownloaderOperation extends IBaseOperation {
  listDownloads(): OperationResult<Download[]>;
  getDownload(id: string): OperationResult<Download>;
  triggerDownload(activationKey: string): OperationResult<Download>;
}

// =============================================================================
// Device Classification Service Types
// =============================================================================

export interface DeviceClassification {
  deviceId: string;
  classification: string;
  confidence: number;
  tags?: string[];
  evaluatedAt?: string;
}

export interface ClassifyDevicePayload {
  deviceId: string;
  attributes: Record<string, unknown>;
}

export interface IDeviceClassificationOperation extends IBaseOperation {
  classify(payload: ClassifyDevicePayload): OperationResult<DeviceClassification>;
  lookup(deviceId: string): OperationResult<DeviceClassification>;
  batchClassify(payloads: ClassifyDevicePayload[]): OperationResult<DeviceClassification[]>;
}

// =============================================================================
// Provisioner Service Types
// =============================================================================

export interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt?: string;
}

export interface BrandingConfig {
  tenantId: string;
  logoUrl?: string;
  primaryColor?: string;
  companyName?: string;
}

export interface ClientStatus {
  clientId: string;
  tenantId: string;
  status: 'online' | 'offline' | 'unknown';
  lastSeen?: string;
}

export interface IProvisionerCoreOperation extends IBaseOperation {
  getTenant(tenantId: string): OperationResult<Tenant>;
  createTenant(payload: Partial<Tenant>): OperationResult<Tenant>;
  deleteTenant(tenantId: string): OperationResult;
}

export interface IProvisionerPycoreOperation extends IBaseOperation {
  getBranding(upn: string): OperationResult<BrandingConfig>;
  getBrandingByEmail(email: string): OperationResult<BrandingConfig>;
  updateClientStatus(payload: Partial<ClientStatus>): OperationResult;
  getClientConfig(clientId: string): OperationResult;
}

// =============================================================================
// Enrollment Service Types
// =============================================================================

export interface EnrollmentRequest {
  deviceId: string;
  userId: string;
  tenantId: string;
}

export interface EnrollmentResponse {
  enrollmentId: string;
  status: 'pending' | 'approved' | 'rejected';
  certificateId?: string;
}

export interface IEnrollmentOperation extends IBaseOperation {
  enroll(request: EnrollmentRequest): OperationResult<EnrollmentResponse>;
  getEnrollmentStatus(enrollmentId: string): OperationResult<EnrollmentResponse>;
}

// =============================================================================
// Certificate Service Types
// =============================================================================

export interface Certificate {
  id: string;
  type: 'ca' | 'org' | 'user';
  subject: string;
  validFrom: string;
  validTo: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface ICertServiceOperation extends IBaseOperation {
  getCertificate(certId: string): OperationResult<Certificate>;
  requestCertificate(type: Certificate['type'], subject: string): OperationResult<Certificate>;
  revokeCertificate(certId: string): OperationResult;
}

// =============================================================================
// User Manager Service Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  displayName?: string;
  groups?: string[];
  tenantId: string;
}

export interface UserGroup {
  id: string;
  name: string;
  members: string[];
}

export interface IUserManagerOperation extends IBaseOperation {
  getUser(userId: string): OperationResult<User>;
  listUsers(tenantId: string): OperationResult<User[]>;
  getGroup(groupId: string): OperationResult<UserGroup>;
  syncUsers(tenantId: string, users: Partial<User>[]): OperationResult;
}

// =============================================================================
// Client-Oppy Steering Service Types
// =============================================================================

export interface SteeringTarget {
  type: 'user_group' | 'organizational_unit' | 'user';
  values: Array<{
    id: string;
    name: string;
  }>;
}

export interface SteeringConfig {
  id: string | number;
  name: string;
  priority?: number;
  targets?: SteeringTarget[];
  steeringMode?: 'dynamic' | 'static' | 'bypass';
  secureAccess?: boolean;
  failclose?: boolean;
  createdAt?: string;
  updatedAt?: string;
  etag?: string;
}

export interface CreateSteeringPayload {
  name: string;
  targets: SteeringTarget[];
  steeringMode?: 'dynamic' | 'static' | 'bypass';
  secureAccess?: boolean;
  failclose?: boolean;
}

export interface UpdateSteeringPayload {
  name?: string;
  targets?: SteeringTarget[];
  steeringMode?: 'dynamic' | 'static' | 'bypass';
  secureAccess?: boolean;
  failclose?: boolean;
}

export interface ListSteeringResponse {
  success?: boolean;
  data: SteeringConfig[];
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface BypassLoggingConfig {
  enabled: boolean;
  updatedAt?: string;
}

export interface SteeringServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  uptime?: number;
  dependencies?: Record<string, { status: string; latency?: number }>;
}

export interface ISteeringCrudOperation extends IBaseOperation {
  getById(id: string | number): OperationResult<SteeringConfig> & { etag: string | null };
  list(): OperationResult<SteeringConfig[]>;
  create(payload?: CreateSteeringPayload): OperationResult<SteeringConfig> & { configId: string | null; etag: string | null };
  update(id: string | number, payload: UpdateSteeringPayload, etag: string): OperationResult<SteeringConfig> & { newEtag: string | null };
  patch(id: string | number, payload: Partial<UpdateSteeringPayload>, etag: string): OperationResult<SteeringConfig> & { newEtag: string | null };
  delete(id: string | number, etag: string): OperationResult;
  getRandomId(): string | number | null;
  getRandomConfigWithEtag(): { id: string | number; etag: string } | null;
  updateWithoutEtag(id: string | number, payload: UpdateSteeringPayload): OperationResult;
  deleteWithoutEtag(id: string | number): OperationResult;
}

export interface IBypassLoggingOperation extends IBaseOperation {
  get(): OperationResult<BypassLoggingConfig>;
  update(config: BypassLoggingConfig): OperationResult<BypassLoggingConfig>;
  enable(): OperationResult<BypassLoggingConfig>;
  disable(): OperationResult<BypassLoggingConfig>;
  toggle(): OperationResult<BypassLoggingConfig>;
}

export interface ILegacySteeringOperation extends IBaseOperation {
  getSteeringList(tenantId?: string): OperationResult<SteeringConfig[]>;
  getStatus(): OperationResult<SteeringServiceStatus>;
  alive(): OperationResult;
  ready(): OperationResult;
  verifyParity(modernConfigs: SteeringConfig[], legacyConfigs: SteeringConfig[]): boolean;
}

// Legacy steering domain types (for backward compatibility)
export interface SteeringDomain {
  domain: string;
  action: 'allow' | 'block' | 'bypass';
  category?: string;
}

export interface ISteeringDomainOperation extends IBaseOperation {
  getDomains(tenantId: string): OperationResult<SteeringDomain[]>;
  updateDomain(domain: SteeringDomain): OperationResult;
}

// =============================================================================
// Operation Handler Types (for scenario runner)
// =============================================================================

export type OperationHandler = () => void;

export type OperationHandlers = Record<string, OperationHandler>;

// =============================================================================
// Service Operation Factory Types
// =============================================================================

/**
 * Factory function type for creating service-specific operation handlers.
 * Each service should provide a factory that creates handlers from its operations.
 */
export type OperationHandlerFactory<T> = (operations: T) => OperationHandlers;
