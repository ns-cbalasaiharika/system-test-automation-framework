import { Rate, Trend, Counter, Gauge } from "k6/metrics";

// ============================================================================
// Shared Metrics
// ============================================================================
export const errorRate = new Rate("errors");
export const requestsTotal = new Counter("requests_total");
export const activeVUs = new Gauge("active_vus");

// ============================================================================
// Client-Oppy Configuration Service Metrics
// ============================================================================
export const listLatency = new Trend("latency_get_configs", true);
export const getByIdLatency = new Trend("latency_get_config_by_id", true);
export const versionsLatency = new Trend("latency_get_versions", true);
export const platformsLatency = new Trend("latency_get_platforms", true);
export const createLatency = new Trend("latency_post_config", true);
export const updateLatency = new Trend("latency_patch_config", true);
export const deleteLatency = new Trend("latency_delete_config", true);
export const bulkDeleteLatency = new Trend("latency_bulk_delete", true);

export const configsCreated = new Counter("configs_created");
export const configsDeleted = new Counter("configs_deleted");
export const configsUpdated = new Counter("configs_updated");

// ============================================================================
// Addonman Service Metrics
// ============================================================================
export const getAddonLatency = new Trend("latency_get_addon", true);
export const listAddonsLatency = new Trend("latency_list_addons", true);
export const createAddonLatency = new Trend("latency_create_addon", true);
export const updateAddonLatency = new Trend("latency_update_addon", true);
export const deleteAddonLatency = new Trend("latency_delete_addon", true);

export const addonsCreated = new Counter("addons_created");
export const addonsDeleted = new Counter("addons_deleted");
export const addonsUpdated = new Counter("addons_updated");

// ============================================================================
// Downloader Service Metrics
// ============================================================================
export const downloadLatency = new Trend("latency_download", true);
export const downloadListLatency = new Trend("latency_download_list", true);
export const downloadTriggerLatency = new Trend("latency_download_trigger", true);

export const downloadsTriggered = new Counter("downloads_triggered");
export const downloadsCompleted = new Counter("downloads_completed");

// ============================================================================
// Device Classification Service Metrics
// ============================================================================
export const classifyLatency = new Trend("latency_classify_device", true);
export const lookupLatency = new Trend("latency_device_lookup", true);
export const batchClassifyLatency = new Trend("latency_batch_classify", true);

export const devicesClassified = new Counter("devices_classified");
export const deviceLookups = new Counter("device_lookups");
