/**
 * K6 System Test Automation Framework - Type Definitions
 * 
 * Central export point for all framework types.
 * Import from '@types' or 'types' to access these types.
 */

// Configuration Types
export type {
  ServiceName,
  ServiceEndpoints,
  ThinkTimeConfig,
  EnvironmentDefaults,
  EnvironmentConfig,
  LoadStage,
  ExecutorType,
  ProfileConfig,
  TrafficMix,
  LatencySLO,
  ErrorSLO,
  SLOConfig,
  ScenarioCategory,
  Priority,
  CustomExecutorConfig,
  ScenarioConfig,
  RuntimeConfig,
  K6Scenario,
  K6Thresholds,
  K6Options,
} from './config';

// Operation Types
export type {
  RequestTags,
  RequestOptions,
  OperationResult,
  IBaseOperation,
  // Client-oppy types
  ConfigTarget,
  ClientConfig,
  CreateConfigPayload,
  UpdateConfigPayload,
  ListConfigsResponse,
  GetConfigResponse,
  CreateConfigResponse,
  IConfigCrudOperation,
  IConfigListOperation,
  IConfigVersionsOperation,
  IConfigPlatformsOperation,
  IBulkDeleteOperation,
  // Addonman types
  Addon,
  CreateAddonPayload,
  UpdateAddonPayload,
  IAddonOperation,
  // Downloader types
  Download,
  IDownloaderOperation,
  // Device Classification types
  DeviceClassification,
  ClassifyDevicePayload,
  IDeviceClassificationOperation,
  // Provisioner types
  Tenant,
  BrandingConfig,
  ClientStatus,
  IProvisionerCoreOperation,
  IProvisionerPycoreOperation,
  // Enrollment types
  EnrollmentRequest,
  EnrollmentResponse,
  IEnrollmentOperation,
  // Certificate types
  Certificate,
  ICertServiceOperation,
  // User Manager types
  User,
  UserGroup,
  IUserManagerOperation,
  // Steering types
  SteeringDomain,
  ISteeringOperation,
  // Handler types
  OperationHandler,
  OperationHandlers,
  OperationHandlerFactory,
} from './operations';
