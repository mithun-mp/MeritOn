const SystemConfig = require('../models/SystemConfig');

// In-memory cache for ultra-fast checks with 0 DB overhead during request handling
let cachedConfig = {
  enabled: false,
  startTime: null,
  endTime: null,
  message: 'MeritOn is undergoing scheduled maintenance. Please wait while we improve the platform.',
  updatedBy: 'system',
  updatedAt: new Date()
};

let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 15000; // 15 seconds refresh interval

/**
 * Refresh configuration from database if cache has expired
 */
async function refreshCacheIfNeeded() {
  const now = Date.now();
  if (now - lastCacheFetchTime < CACHE_TTL_MS) {
    return;
  }
  try {
    const doc = await SystemConfig.findOne({ key: 'maintenance' }).lean();
    if (doc && doc.value) {
      cachedConfig = {
        enabled: Boolean(doc.value.enabled),
        startTime: doc.value.startTime || null,
        endTime: doc.value.endTime || null,
        message: doc.value.message || 'MeritOn is undergoing scheduled maintenance.',
        updatedBy: doc.updatedBy || 'admin',
        updatedAt: doc.updatedAt || new Date()
      };
    }
    lastCacheFetchTime = now;
  } catch (err) {
    console.error('[MAINTENANCE] Error refreshing cache from DB:', err.message);
  }
}

/**
 * Determine authoritative maintenance state against server time
 * 
 * Logic:
 * - Maintenance disabled -> status: 'disabled', active: false
 * - Maintenance enabled but current time < startTime -> status: 'scheduled', active: false
 * - startTime <= current time < endTime -> status: 'active', active: true
 * - current time >= endTime -> status: 'expired', active: false
 */
function getMaintenanceState(currentTime = new Date()) {
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);
  const nowMs = now.getTime();

  if (!cachedConfig.enabled) {
    return {
      active: false,
      status: 'disabled',
      enabled: false,
      startTime: cachedConfig.startTime,
      endTime: cachedConfig.endTime,
      message: cachedConfig.message,
      serverTime: now.toISOString()
    };
  }

  const startMs = cachedConfig.startTime ? new Date(cachedConfig.startTime).getTime() : null;
  const endMs = cachedConfig.endTime ? new Date(cachedConfig.endTime).getTime() : null;

  // Case 1: Scheduled future maintenance
  if (startMs && !isNaN(startMs) && nowMs < startMs) {
    return {
      active: false,
      status: 'scheduled',
      enabled: true,
      startTime: cachedConfig.startTime,
      endTime: cachedConfig.endTime,
      message: cachedConfig.message,
      serverTime: now.toISOString()
    };
  }

  // Case 2: Expired maintenance window (automatic deactivation)
  if (endMs && !isNaN(endMs) && nowMs >= endMs) {
    return {
      active: false,
      status: 'expired',
      enabled: true,
      startTime: cachedConfig.startTime,
      endTime: cachedConfig.endTime,
      message: cachedConfig.message,
      serverTime: now.toISOString()
    };
  }

  // Case 3: Maintenance currently active
  return {
    active: true,
    status: 'active',
    enabled: true,
    startTime: cachedConfig.startTime,
    endTime: cachedConfig.endTime,
    message: cachedConfig.message,
    serverTime: now.toISOString()
  };
}

/**
 * Update maintenance configuration (Administrator only)
 */
async function setMaintenanceConfig(payload = {}, adminIdentifier = 'admin') {
  const enabled = Boolean(payload.enabled);
  let startTime = null;
  let endTime = null;

  if (payload.startTime) {
    const sDate = new Date(payload.startTime);
    if (isNaN(sDate.getTime())) {
      return { success: false, error: 'Invalid start time format' };
    }
    startTime = sDate.toISOString();
  }

  if (payload.endTime) {
    const eDate = new Date(payload.endTime);
    if (isNaN(eDate.getTime())) {
      return { success: false, error: 'Invalid end time format' };
    }
    endTime = eDate.toISOString();
  }

  // If enabled with both start and end, validate chronological order
  if (enabled && startTime && endTime) {
    const sMs = new Date(startTime).getTime();
    const eMs = new Date(endTime).getTime();
    if (eMs <= sMs) {
      return { success: false, error: 'Maintenance end time must be after the start time' };
    }
  }

  // Sanitize message: strip HTML tags and clamp length
  let message = String(payload.message || '').replace(/<[^>]*>?/gm, '').trim();
  if (!message) {
    message = 'MeritOn is undergoing scheduled maintenance. Please wait while we improve the platform.';
  }
  if (message.length > 500) {
    message = message.substring(0, 500);
  }

  const newConfigValue = {
    enabled,
    startTime,
    endTime,
    message
  };

  // Persist to MongoDB
  await SystemConfig.findOneAndUpdate(
    { key: 'maintenance' },
    {
      key: 'maintenance',
      value: newConfigValue,
      updatedBy: adminIdentifier,
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  // Update in-memory cache immediately
  cachedConfig = {
    ...newConfigValue,
    updatedBy: adminIdentifier,
    updatedAt: new Date()
  };
  lastCacheFetchTime = Date.now();

  // Runtime audit logging
  console.log(`[AUDIT] Maintenance configuration updated by ${adminIdentifier}:`, JSON.stringify(newConfigValue));

  console.log(`[MAINTENANCE] Configuration updated by ${adminIdentifier}: enabled=${enabled}, status=${getMaintenanceState().status}`);

  return {
    success: true,
    maintenance: getMaintenanceState()
  };
}

// Initial cache load at module import
refreshCacheIfNeeded().catch(err => console.error('[MAINTENANCE] Init load error:', err.message));

module.exports = {
  getMaintenanceState,
  setMaintenanceConfig,
  refreshCacheIfNeeded
};
