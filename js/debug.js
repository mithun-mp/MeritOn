/**
 * Production-Grade MeritOn Debugging Module (v3.0)
 * DISABLED: All debugging and data logging disabled for security
 */

// Environment-driven debug mode (SEC-010 / UI-001)
const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1'
);

window.DEBUG = isLocalhost && (typeof localStorage !== 'undefined' && localStorage.getItem('MERITON_DEBUG') === 'true');

function sanitizeLogData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
        const cloned = JSON.parse(JSON.stringify(obj));
        const sensitiveKeys = ['password', 'oldpassword', 'newpassword', 'sessiontoken', 'token', 'otp', 'betaotp', 'authorization'];
        function scrub(target) {
            if (!target || typeof target !== 'object') return;
            for (const key of Object.keys(target)) {
                if (sensitiveKeys.includes(key.toLowerCase())) {
                    target[key] = '[REDACTED]';
                } else if (typeof target[key] === 'object') {
                    scrub(target[key]);
                }
            }
        }
        scrub(cloned);
        return cloned;
    } catch (e) {
        return '[Scrubbed Data]';
    }
}

const debugLog = (type, module, message, data = null) => {
    if (!window.DEBUG) return;

    const timestamp = new Date().toLocaleTimeString();
    const styles = {
        INFO: 'color: #3b82f6; font-weight: bold;',
        WARN: 'color: #f59e0b; font-weight: bold;',
        ERROR: 'color: #ef4444; font-weight: bold;',
        API: 'color: #10b981; font-weight: bold;',
        STATE: 'color: #8b5cf6; font-weight: bold;',
        UI: 'color: #ec4899; font-weight: bold;',
        PERF: 'color: #06b6d4; font-weight: bold;'
    };

    const style = styles[type] || 'color: #94a3b8;';
    
    console.groupCollapsed(`%c[${timestamp}] [${type}] [${module}] ${message}`, style);
    if (data !== null && data !== undefined) {
        console.log(sanitizeLogData(data));
    }
    console.groupEnd();
};

window.debugLog = debugLog;

// Global Error Handler
window.onerror = (message, source, lineno, colno, error) => {
    debugLog('ERROR', 'GLOBAL', message, { source, lineno, colno, error });
    return false;
};

window.onunhandledrejection = event => {
    debugLog('ERROR', 'GLOBAL', 'Unhandled promise rejection', event.reason);
    return false;
};
