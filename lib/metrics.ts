import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// =============================================================================
// Shared Metrics - Common across all services
// =============================================================================
export const errorRate = new Rate('errors');
export const requestsTotal = new Counter('requests_total');
export const activeVUs = new Gauge('active_vus');

// =============================================================================
// Client-Oppy Configuration Service Metrics
// =============================================================================
export const listLatency = new Trend('latency_get_configs', true);
export const getByIdLatency = new Trend('latency_get_config_by_id', true);
export const versionsLatency = new Trend('latency_get_versions', true);
export const platformsLatency = new Trend('latency_get_platforms', true);
export const createLatency = new Trend('latency_post_config', true);
export const updateLatency = new Trend('latency_patch_config', true);
export const deleteLatency = new Trend('latency_delete_config', true);
export const bulkDeleteLatency = new Trend('latency_bulk_delete', true);
export const bulkStatusLatency = new Trend('latency_bulk_status', true);

export const configsCreated = new Counter('configs_created');
export const configsDeleted = new Counter('configs_deleted');
export const configsUpdated = new Counter('configs_updated');
export const bulkJobsPolled = new Counter('bulk_jobs_polled');

// =============================================================================
// Addonman Service Metrics
// =============================================================================
export const getAddonLatency = new Trend('latency_get_addon', true);
export const listAddonsLatency = new Trend('latency_list_addons', true);
export const createAddonLatency = new Trend('latency_create_addon', true);
export const updateAddonLatency = new Trend('latency_update_addon', true);
export const deleteAddonLatency = new Trend('latency_delete_addon', true);

export const addonsCreated = new Counter('addons_created');
export const addonsDeleted = new Counter('addons_deleted');
export const addonsUpdated = new Counter('addons_updated');

// =============================================================================
// Downloader Service Metrics
// =============================================================================
export const downloadLatency = new Trend('latency_download', true);
export const downloadListLatency = new Trend('latency_download_list', true);
export const downloadTriggerLatency = new Trend('latency_download_trigger', true);

export const downloadsTriggered = new Counter('downloads_triggered');
export const downloadsCompleted = new Counter('downloads_completed');

// =============================================================================
// Device Classification Service Metrics
// =============================================================================
export const classifyLatency = new Trend('latency_classify_device', true);
export const lookupLatency = new Trend('latency_device_lookup', true);
export const batchClassifyLatency = new Trend('latency_batch_classify', true);

export const devicesClassified = new Counter('devices_classified');
export const deviceLookups = new Counter('device_lookups');

// =============================================================================
// Provisioner Service Metrics
// =============================================================================
export const provisionTenantLatency = new Trend('latency_provision_tenant', true);
export const deprovisionTenantLatency = new Trend('latency_deprovision_tenant', true);
export const getBrandingLatency = new Trend('latency_get_branding', true);
export const updateClientStatusLatency = new Trend('latency_update_client_status', true);

export const tenantsProvisioned = new Counter('tenants_provisioned');
export const tenantsDeprovisioned = new Counter('tenants_deprovisioned');

// =============================================================================
// Enrollment Service Metrics
// =============================================================================
export const enrollLatency = new Trend('latency_enroll_device', true);
export const enrollmentStatusLatency = new Trend('latency_enrollment_status', true);

export const deviceEnrollments = new Counter('device_enrollments');
export const enrollmentApprovals = new Counter('enrollment_approvals');

// =============================================================================
// Certificate Service Metrics
// =============================================================================
export const getCertLatency = new Trend('latency_get_certificate', true);
export const requestCertLatency = new Trend('latency_request_certificate', true);
export const revokeCertLatency = new Trend('latency_revoke_certificate', true);

export const certsIssued = new Counter('certificates_issued');
export const certsRevoked = new Counter('certificates_revoked');

// =============================================================================
// User Manager Service Metrics
// =============================================================================
export const getUserLatency = new Trend('latency_get_user', true);
export const listUsersLatency = new Trend('latency_list_users', true);
export const syncUsersLatency = new Trend('latency_sync_users', true);

export const usersSynced = new Counter('users_synced');

// =============================================================================
// Client-Oppy Steering Service Metrics
// =============================================================================
export const steeringGetLatency = new Trend('latency_steering_get', true);
export const steeringListLatency = new Trend('latency_steering_list', true);
export const steeringCreateLatency = new Trend('latency_steering_create', true);
export const steeringUpdateLatency = new Trend('latency_steering_update', true);
export const steeringPatchLatency = new Trend('latency_steering_patch', true);
export const steeringDeleteLatency = new Trend('latency_steering_delete', true);

export const steeringConfigsCreated = new Counter('steering_configs_created');
export const steeringConfigsUpdated = new Counter('steering_configs_updated');
export const steeringConfigsDeleted = new Counter('steering_configs_deleted');

export const bypassLoggingGetLatency = new Trend('latency_bypass_logging_get', true);
export const bypassLoggingUpdateLatency = new Trend('latency_bypass_logging_update', true);

export const legacyGetSteeringListLatency = new Trend('latency_legacy_get_steering_list', true);
export const steeringStatusLatency = new Trend('latency_steering_status', true);

export const etagMismatches = new Counter('etag_mismatches');
export const etagEnforcementFailures = new Counter('etag_enforcement_failures');

// Legacy steering domain metrics (kept for backward compatibility)
export const getDomainsLatency = new Trend('latency_get_domains', true);
export const updateDomainLatency = new Trend('latency_update_domain', true);

export const domainsUpdated = new Counter('domains_updated');

// =============================================================================
// Metric Registry - For dynamic metric creation
// =============================================================================

interface MetricRegistry {
  trends: Map<string, Trend>;
  counters: Map<string, Counter>;
  rates: Map<string, Rate>;
  gauges: Map<string, Gauge>;
}

const registry: MetricRegistry = {
  trends: new Map(),
  counters: new Map(),
  rates: new Map(),
  gauges: new Map(),
};

/**
 * Get or create a Trend metric dynamically.
 * Useful for services that need custom latency metrics.
 */
export function getOrCreateTrend(name: string, isTime = true): Trend {
  if (!registry.trends.has(name)) {
    registry.trends.set(name, new Trend(name, isTime));
  }
  return registry.trends.get(name)!;
}

/**
 * Get or create a Counter metric dynamically.
 */
export function getOrCreateCounter(name: string): Counter {
  if (!registry.counters.has(name)) {
    registry.counters.set(name, new Counter(name));
  }
  return registry.counters.get(name)!;
}

/**
 * Get or create a Rate metric dynamically.
 */
export function getOrCreateRate(name: string): Rate {
  if (!registry.rates.has(name)) {
    registry.rates.set(name, new Rate(name));
  }
  return registry.rates.get(name)!;
}

/**
 * Get or create a Gauge metric dynamically.
 */
export function getOrCreateGauge(name: string): Gauge {
  if (!registry.gauges.has(name)) {
    registry.gauges.set(name, new Gauge(name));
  }
  return registry.gauges.get(name)!;
}

/**
 * Create a set of standard metrics for a new service.
 * Returns an object with latency trends and operation counters.
 */
export function createServiceMetrics(serviceName: string, operations: string[]): {
  latency: Record<string, Trend>;
  counts: Record<string, Counter>;
} {
  const latency: Record<string, Trend> = {};
  const counts: Record<string, Counter> = {};

  for (const op of operations) {
    const latencyName = `latency_${serviceName}_${op}`;
    const countName = `${serviceName}_${op}_count`;
    
    latency[op] = getOrCreateTrend(latencyName);
    counts[op] = getOrCreateCounter(countName);
  }

  return { latency, counts };
}
