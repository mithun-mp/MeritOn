/**
 * API Communication Module
 */

/**
 * Global Debug Utility
 */
window.debugLog = function(type, context, message, data = '') {
    const colors = {
        INFO: '#3b82f6',
        API: '#8b5cf6',
        STATE: '#10b981',
        WARN: '#f59e0b',
        ERROR: '#ef4444'
    };
    const color = colors[type] || '#64748b';
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(
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

const API_URL = "https://script.google.com/macros/s/AKfycbxe4-61HINJUU7JUaGf2KQzfJYIb6vtAOMCb3a8MQbjK3eobgq7uCmb2spA4W6x7kkOvw/exec";

const api = {
    async get(action, params = {}) {
        const startTime = Date.now();
        
        // Automatically inject sessionToken if available
        const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
        if (user && user.sessionToken) {
            params.sessionToken = user.sessionToken;
            debugLog('API', 'GET', `Injected sessionToken for ${action}`);
        } else {
            debugLog('WARN', 'API', `No sessionToken found for ${action}`);
        }

        const query = new URLSearchParams({ action, ...params }).toString();
        const fullUrl = `${API_URL}?${query}`;

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

        // Automatically inject sessionToken if available
        const user = JSON.parse(localStorage.getItem('cbt_user') || 'null');
        if (user && user.sessionToken && !data.sessionToken) {
            data.sessionToken = user.sessionToken;
            debugLog('API', 'POST', `Injected sessionToken for ${action}`);
        } else if (user && user.sessionToken) {
            debugLog('API', 'POST', `Using provided sessionToken for ${action}`);
        } else {
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
