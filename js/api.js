/**
 * API Communication Module - MONGO ONLY
 */

(function () {
    if (typeof window.MERITON_DEBUG === "undefined") {
        window.MERITON_DEBUG = (function () {
            try {
                return localStorage.getItem("meriton_debug") === "true";
            } catch (e) {
                return false;
            }
        })();
    }

    window.MERITON_API_URL = "https://meriton.onrender.com/api";

    console.log("[MERITON] Backend locked to Mongo Render:", window.MERITON_API_URL);

    function checkUrlSafety(url) {
        if (url.includes("script.google.com")) {
            const error = "[MERITON] BLOCKED: Google Apps Script backend is not allowed.";
            console.error(error);
            throw new Error(error);
        }
        return url;
    }

    if (typeof window.MERITON_DEBUG_LOG_SET === "undefined") {
        window.MERITON_DEBUG_LOG_SET = true;
        const originalDebugLog = window.debugLog;

        window.debugLog = function (type, context, message, data = "") {
            if (!window.MERITON_DEBUG && ["INFO", "API", "STATE", "WARN"].includes(type)) return;

            if (type === "ERROR" && !window.MERITON_DEBUG) {
                console.error(`[${new Date().toLocaleTimeString()}] [${type}] [${context}] ${message}`, data || "");
                return;
            }

            const colors = {
                INFO: "#3b82f6",
                API: "#8b5cf6",
                STATE: "#10b981",
                WARN: "#f59e0b",
                ERROR: "#ef4444"
            };

            const color = colors[type] || "#64748b";
            const timestamp = new Date().toLocaleTimeString();

            if (typeof originalDebugLog === "function") {
                originalDebugLog(
                    `%c[${timestamp}] [${type}] [${context}]%c ${message}`,
                    `color: white; background: ${color}; padding: 2px 6px; border-radius: 4px; font-weight: bold;`,
                    "color: inherit;",
                    data
                );
            } else {
                console.log(`[${timestamp}] [${type}] [${context}] ${message}`, data || "");
            }
        };
    }

    if (typeof window.runConsoleDiagnostics === "undefined") {
        window.runConsoleDiagnostics = function () {
            console.group("%c MeritOn Diagnostics ", "background: #2563eb; color: white; font-size: 1.2rem; padding: 4px; border-radius: 4px;");
            console.log("Page:", window.location.pathname);
            console.log("User Agent:", navigator.userAgent);
            console.log("API URL:", window.MERITON_API_URL);

            const globals = ["api", "debugLog", "showConfirm", "AOS", "Chart", "jsPDF", "normalizePayload"];
            console.group("Globals Check");
            globals.forEach(g => {
                const ok = typeof window[g] !== "undefined";
                console.log(`${ok ? "✅" : "❌"} ${g}: ${typeof window[g]}`);
            });
            console.groupEnd();

            const elements = ["adminLoginForm", "loginForm", "registerWizard", "themeBtn", "meritonLoader"];
            console.group("DOM Elements Check");
            elements.forEach(id => {
                const el = document.getElementById(id);
                console.log(`${el ? "✅" : "⚪"} #${id}: ${el ? "Found" : "Not on this page"}`);
            });
            console.groupEnd();

            console.group("Storage");
            console.log("cbt_user:", !!localStorage.getItem("cbt_user"));
            console.log("admin_token:", !!localStorage.getItem("admin_token"));
            console.groupEnd();

            console.groupEnd();
            return "Diagnostics Complete";
        };
    }

    if (typeof window.api === "undefined") {
        window.api = {
            async get(action, params = {}) {
                const user = JSON.parse(localStorage.getItem("cbt_user") || "null");

                const publicActions = [
                    "getAllTests",
                    "loginUser",
                    "adminLogin",
                    "sendOTP",
                    "registerUser",
                    "forgotPassword",
                    "resetPassword",
                    "logoutSession"
                ];

                const isPublicAction = publicActions.includes(action);

                if (user && user.sessionToken) {
                    params.sessionToken = user.sessionToken;
                    window.debugLog("API", "GET", `Injected sessionToken for ${action}`);
                } else if (!isPublicAction) {
                    window.debugLog("WARN", "API", `No sessionToken found for ${action}`);
                }

                const query = new URLSearchParams({ action, ...params }).toString();
                const fullUrl = checkUrlSafety(`${window.MERITON_API_URL}?${query}`);

                window.debugLog("API", "GET", `Fetching: ${action}`, { params });

                try {
                    const response = await fetch(fullUrl);
                    const text = await response.text();

                    if (!response.ok) {
                        return {
                            success: false,
                            error: `HTTP ${response.status}`,
                            raw: text
                        };
                    }

                    if (!text) return {};

                    const data = JSON.parse(text);

                    if (data.error) {
                        window.debugLog("ERROR", "API", `Server Error in GET ${action}`, data.error);
                    } else {
                        window.debugLog("API", "GET", "Success");
                    }

                    return data;
                } catch (err) {
                    window.debugLog("ERROR", "API", `Failed to GET ${action}`, err.message);
                    return {
                        success: false,
                        error: err.message
                    };
                }
            },

            async post(rawData, retries = 2) {
                const data = window.normalizePayload ? window.normalizePayload(rawData) : rawData;
                const action = data.action || "unknown";

                const user = JSON.parse(localStorage.getItem("cbt_user") || "null");
                const adminToken = localStorage.getItem("admin_token");
                const sessionToken = (user && user.sessionToken) || adminToken;

                const publicActions = [
                    "loginUser",
                    "adminLogin",
                    "sendOTP",
                    "registerUser",
                    "forgotPassword",
                    "resetPassword",
                    "logoutSession"
                ];

                const isPublicAction = publicActions.includes(action);

                if (sessionToken && !data.sessionToken) {
                    data.sessionToken = sessionToken;
                    window.debugLog("API", "POST", `Injected sessionToken for ${action}`);
                } else if (sessionToken) {
                    window.debugLog("API", "POST", `Using provided sessionToken for ${action}`);
                } else if (!isPublicAction) {
                    window.debugLog("WARN", "API", `No sessionToken found for ${action}`);
                }

                window.debugLog("API", "POST", `Sending action ${action}`);

                try {
                    const response = await fetch(checkUrlSafety(window.MERITON_API_URL), {
                        method: "POST",
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8"
                        },
                        body: JSON.stringify(data)
                    });

                    const text = await response.text();

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${text}`);
                    }

                    const resData = JSON.parse(text);

                    if (resData.error) {
                        window.debugLog("ERROR", "API", `Server Error in POST ${action}`, resData.error);
                        return resData;
                    }

                    window.debugLog("API", "POST", "Success");
                    return resData;
                } catch (err) {
                    window.debugLog("ERROR", "API", `Failed to POST ${action}`, err.message);

                    if (retries > 0) {
                        window.debugLog("INFO", "API", `Retrying POST ${action}...`);
                        await new Promise(r => setTimeout(r, 1000));
                        return await this.post(rawData, retries - 1);
                    }

                    return {
                        success: false,
                        error: err.message
                    };
                }
            }
        };
    }

    if (typeof window.meritonDebug === "undefined") {
        window.meritonDebug = function () {
            const user = JSON.parse(localStorage.getItem("cbt_user") || "null");

            console.group("🧭 MeritOn Debug Info");
            console.log("Current API URL:", window.MERITON_API_URL);
            console.log("Current user:", user);
            console.log("Current role:", user?.role || "none");
            console.log("Session token present:", !!user?.sessionToken);
            console.log("Admin token present:", !!localStorage.getItem("admin_token"));
            console.log("Current page:", window.location.pathname);
            console.log("Network status:", navigator.onLine ? "online" : "offline");
            console.groupEnd();

            return {
                apiUrl: window.MERITON_API_URL,
                user,
                role: user?.role,
                sessionTokenPresent: !!user?.sessionToken,
                adminTokenPresent: !!localStorage.getItem("admin_token"),
                currentPage: window.location.pathname,
                online: navigator.onLine
            };
        };
    }

    if (typeof window.testBackend === "undefined") {
        window.testBackend = async function () {
            console.group("🔍 MeritOn Backend Test");

            try {
                const healthUrl = checkUrlSafety(window.MERITON_API_URL.replace("/api", "/health"));

                console.log("Testing /health...");
                const healthRes = await fetch(healthUrl);
                const health = await healthRes.json();
                console.log("/health:", health.success ? "✅ PASS" : "❌ FAIL", health);

                console.log("Testing getAllTests...");
                const tests = await window.api.get("getAllTests");
                console.log("getAllTests:", tests ? "✅ PASS" : "❌ FAIL", tests);

                console.groupEnd();

                return {
                    success: true,
                    health,
                    tests
                };
            } catch (err) {
                console.error("❌ Backend test failed:", err);
                console.groupEnd();

                return {
                    success: false,
                    error: err.message
                };
            }
        };
    }

    if (typeof window.testAuth === "undefined") {
        window.testAuth = async function () {
            console.group("🔑 MeritOn Auth Test");

            const user = JSON.parse(localStorage.getItem("cbt_user") || "null");
            const adminToken = localStorage.getItem("admin_token");

            try {
                if (adminToken) {
                    console.log("Testing verifyAdmin...");
                    const verify = await window.api.get("verifyAdmin", { sessionToken: adminToken });
                    console.log("verifyAdmin:", verify.success ? "✅ PASS" : "❌ FAIL", verify);
                } else {
                    console.log("ℹ️ No admin token present, skipping verifyAdmin");
                }

                console.log("Login status:", user ? "✅ Logged in" : "❌ Not logged in", user);

                console.groupEnd();

                return {
                    success: true,
                    user,
                    adminTokenPresent: !!adminToken
                };
            } catch (err) {
                console.error("❌ Auth test failed:", err);
                console.groupEnd();

                return {
                    success: false,
                    error: err.message
                };
            }
        };
    }
})();