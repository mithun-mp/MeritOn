/**
 * API Communication Module
 */

// Use existing secure debugLog from site-config.js
// Only define MERITON_DEBUG flag for internal use
window.MERITON_DEBUG = (function() {
    try {
        return localStorage.getItem("meriton_debug") === "true";
    } catch (e) {
        return false;
    }
})();

// Backend switching configuration
const BACKEND_MODE = localStorage.getItem("meriton_backend") || "apps_script";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxe4-61HINJUU7JUaGf2KQzfJYIb6vtAOMCb3a8MQbjK3eobgq7uCmb2spA4W6x7kkOvw/exec";
const MONGO_BACKEND_URL = "http://localhost:3000/api";
const API_URL = BACKEND_MODE === "mongo" ? MONGO_BACKEND_URL : APPS_SCRIPT_URL;

// Helper to switch backend
window.setMeritonBackend = function(mode) {
    const validModes = ["apps_script", "mongo"];
    if (!validModes.includes(mode)) {
        console.error("Invalid backend mode. Use 'apps_script' or 'mongo'.");
        return;
    }
    localStorage.setItem("meriton_backend", mode);
    location.reload();
};

// Debug log for active backend
if (window.MERITON_DEBUG) {
    console.log(`[MERITON] Active backend: ${BACKEND_MODE}`);
}

// Keep enhanced debugLog but make it use the sanitized base
const originalDebugLog = window.debugLog;
window.debugLog = function(type, context, message, data = '') {
    // Only log if debug mode is explicitly enabled
    if (!window.MERITON_DEBUG && ['INFO', 'API', 'STATE', 'WARN'].includes(type)) return;

    // For error logs, always log but sanitize data
    if (type === 'ERROR' && !window.MERITON_DEBUG) {
        // Log minimal error info without sensitive data in production
        console.error(`[${new Date().toLocaleTimeString()}] [${type}] [${context}] ${message}`);
        return;
    }

    const colors = {
        INFO: '#3b82f6',
        API: '#8b5cf6',
        STATE: '#10b981',
        WARN: '#f59e0b',
        ERROR: '#ef4444'
    };
    const color = colors[type] || '#64748b';
    const timestamp = new Date().toLocaleTimeString();
    
    // Use the sanitized debugLog for the actual logging
    originalDebugLog(
        `%c[${timestamp}] [${type}] [${context}]%c ${message}`,
        `color: white; background: ${color}; padding: 2px 6px; border-radius: 4px; font-weight: bold;`,
        'color: inherit;',
        data
    );
};

/**
 * Diagnostics Helper
 */
window.runConsoleDiagnostics = function() {
    console.group('%c MeritOn Diagnostics ', 'background: #2563eb; color: white; font-size: 1.2rem; padding: 4px; border-radius: 4px;');
    
    console.log('Page:', window.location.pathname);
    console.log('User Agent:', navigator.userAgent);
    
    // Check Globals
    const globals = ['api', 'debugLog', 'showConfirm', 'AOS', 'Chart', 'jsPDF', 'normalizePayload'];
    console.group('Globals Check');
    globals.forEach(g => {
        const ok = typeof window[g] !== 'undefined';
        console.log(`${ok ? '✅' : '❌'} ${g}: ${typeof window[g]}`);
    });
    console.groupEnd();

    // Check DOM Elements (Common culprits)
    const elements = ['adminLoginForm', 'loginForm', 'registerWizard', 'themeBtn', 'meritonLoader'];
    console.group('DOM Elements Check');
    elements.forEach(id => {
        const el = document.getElementById(id);
        console.log(`${el ? '✅' : '⚪'} #${id}: ${el ? 'Found' : 'Not on this page'}`);
    });
    console.groupEnd();

    // Storage
    console.group('Storage');
    console.log('cbt_user:', !!localStorage.getItem('cbt_user'));
    console.log('admin_token:', !!localStorage.getItem('admin_token'));
    console.groupEnd();

    console.groupEnd();
    return 'Diagnostics Complete';
};

const api = {
    async get(action, params = {}) {
        const startTime = Date.now();
        
        // Automatically inject sessionToken if available
        const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
        const publicActions = ['getAllTests', 'loginUser', 'adminLogin', 'sendOTP', 'registerUser', 'forgotPassword', 'resetPassword', 'logoutSession'];
        const isPublicAction = publicActions.includes(action);

        if (user && user.sessionToken) {
            params.sessionToken = user.sessionToken;
            debugLog('API', 'GET', `Injected sessionToken for ${action}`);
        } else if (!isPublicAction) {
            debugLog('WARN', 'API', `No sessionToken found for ${action}`);
        }

        const query = new URLSearchParams({ action, ...params }).toString();
        const fullUrl = `${API_URL}?${query}`;
        
        debugLog('API', 'GET', `Fetching: ${action}`, { params });

        try {
            const response = await fetch(fullUrl);
            const duration = Date.now() - startTime;

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = await response.text();
            if (!text) return {};

            const data = JSON.parse(text);
            
            if (data.error) {
                debugLog('ERROR', 'API', `Server Error in ${action}`, data.error);
            } else {
                debugLog('API', 'GET', `Success`);
            }

            return data;
        } catch (err) {
            debugLog('ERROR', 'API', `Failed to GET ${action}`, err.message);
            throw err;
        }
    },

    async post(rawData, retries = 2) {
        const startTime = Date.now();
        const data = window.normalizePayload ? window.normalizePayload(rawData) : rawData;
        const action = data.action || 'unknown';

        // Automatically inject sessionToken or adminToken if available
        const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
        const adminToken = localStorage.getItem('admin_token');
        const sessionToken = (user && user.sessionToken) || adminToken;

        const publicActions = ['loginUser', 'adminLogin', 'sendOTP', 'registerUser', 'forgotPassword', 'resetPassword', 'logoutSession'];
        const isPublicAction = publicActions.includes(action);

        if (sessionToken && !data.sessionToken) {
            data.sessionToken = sessionToken;
            debugLog('API', 'POST', `Injected sessionToken for ${action}`);
        } else if (sessionToken) {
            debugLog('API', 'POST', `Using provided sessionToken for ${action}`);
        } else if (!isPublicAction) {
            debugLog('WARN', 'API', `No sessionToken found for ${action}`);
        }

        debugLog('API', 'POST', `Sending action ${action}`);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(data)
            });
            const duration = Date.now() - startTime;

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = await response.text();
            const resData = JSON.parse(text);

            if (resData.error) {
                debugLog('ERROR', 'API', `Server Error in POST ${action}`, resData.error);
                if (retries > 0) return await this.post(rawData, retries - 1);
            } else {
                debugLog('API', 'POST', `Success`);
            }

            return resData;
        } catch (err) {
            debugLog('ERROR', 'API', `Failed to POST ${action}`, err.message);
            if (retries > 0) {
                debugLog('INFO', 'API', `Retrying POST ${action}...`);
                await new Promise(r => setTimeout(r, 1000));
                return await this.post(rawData, retries - 1);
            }
            throw err;
        }
    }
};
