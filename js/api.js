/**
 * API Communication Module
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxe4-61HINJUU7JUaGf2KQzfJYIb6vtAOMCb3a8MQbjK3eobgq7uCmb2spA4W6x7kkOvw/exec";

const api = {
    async get(action, params = {}) {
        const startTime = Date.now();
        debugLog('API', 'GET', `Requesting action`);
        
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

        debugLog('API', 'POST', `Sending action`);

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
