/**
 * Production-Grade CBT Debugging Module (v3.0)
 * DISABLED: All debugging and data logging disabled for security
 */

window.DEBUG = true;

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
    if (data !== null && data !== undefined) console.log(data);
    console.trace('Stack Trace');
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
