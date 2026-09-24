
(function() {
  // Explicit, environment-aware API URL resolution (BLOCKER-007)
  const getApiUrl = () => {
    // 1. Explicit runtime configuration (highest priority)
    if (typeof window !== 'undefined' && window.MERITON_API_URL) {
      return window.MERITON_API_URL;
    }
    // 2. Site-config explicit API URL
    if (typeof window !== 'undefined' && window.MeritOn_SITE && window.MeritOn_SITE.apiUrl) {
      return window.MeritOn_SITE.apiUrl;
    }

    const hostname = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    const port = (typeof window !== 'undefined' && window.location) ? window.location.port : '';

    // 3. Safe local development default
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return (port === '3000') ? '/api' : 'http://localhost:3000/api';
    }

    // 4. Same-origin deployment if frontend and backend share domain
    if (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file:')) {
      if (hostname.includes('render.com') || hostname.includes('meriton')) {
        return `${window.location.origin}/api`;
      }
    }

    // 5. Default production backend for CDN/GitHub Pages deployments
    return "https://meriton.onrender.com/api";
  };
  const API_URL = getApiUrl();
  
  // Hard safety check
  if (API_URL.includes("script.google.com")) {
    throw new Error("[MERITON] BLOCKED: Google Apps Script not allowed!");
  }
  
  
  // Public actions that don't require tokens
  const PUBLIC_ACTIONS = [
    "getAllTests",
    "loginUser",
    "adminLogin",
    "sendOTP",
    "registerUser",
    "forgotPassword",
    "resetPassword",
    "logoutSession",
    "getMaintenanceStatus"
  ];
  
  // Get session tokens from localStorage
  function getSessionTokens() {
    let sessionToken = null;
    
    // Try cbt_user first
    try {
      const cbtUser = JSON.parse(localStorage.getItem("cbt_user"));
      if (cbtUser && cbtUser.sessionToken) {
        sessionToken = cbtUser.sessionToken;
      }
    } catch (e) {}
    
    // Fallback to admin_token
    if (!sessionToken) {
      try {
        sessionToken = localStorage.getItem("admin_token");
      } catch (e) {}
    }
    
    return sessionToken;
  }
  
  // Build API object
  const api = {
    async get(action, params = {}) {
      try {
        const requestParams = { action, ...params };
        const sessionToken = getSessionTokens();
        const headers = {};
        
        // BLOCKER-005: Transmit tokens via HTTP headers rather than leaking in query string URLs
        if (!PUBLIC_ACTIONS.includes(action) && sessionToken) {
          headers["Authorization"] = `Bearer ${sessionToken}`;
          headers["X-Session-Token"] = sessionToken;
        }
        
        // Build query string WITHOUT injecting sessionToken into URL parameters
        const query = Object.keys(requestParams)
          .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(requestParams[key]))
          .join("&");
        
        const url = `${API_URL}?${query}`;
        
        const response = await fetch(url, {
          method: "GET",
          headers
        });
        if (!response.ok) {
          if (response.status === 503) {
            const errData = await response.json().catch(() => ({}));
            if (errData && errData.maintenance) {
              const currentPath = (typeof window !== 'undefined' && window.location) ? window.location.pathname.toLowerCase() : '';
              const isAdminRoute = currentPath.includes('admin') || currentPath.includes('analytics');
              const isMaintenancePage = currentPath.endsWith('maintenance.html');
              if (!isAdminRoute && !isMaintenancePage) {
                window.location.href = 'maintenance.html';
              }
            }
            return errData;
          }
          return { success: false, error: `HTTP ${response.status}` };
        }
        
        return await response.json();
      } catch (error) {
        console.error("API GET error:", error);
        return { success: false, error: error.message };
      }
    },
    
    async post(data) {
      try {
        // Create copy of data to avoid mutating original
        const requestData = { ...data };
        const sessionToken = getSessionTokens();
        const headers = {
          "Content-Type": "text/plain;charset=utf-8"
        };
        
        // BLOCKER-005: Transmit tokens via HTTP headers
        if (!PUBLIC_ACTIONS.includes(requestData.action) && sessionToken) {
          headers["Authorization"] = `Bearer ${sessionToken}`;
          headers["X-Session-Token"] = sessionToken;
          // Retain in payload for backward compatibility with legacy endpoints
          requestData.sessionToken = sessionToken;
        }
        
        const response = await fetch(API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
          if (response.status === 503) {
            const errData = await response.json().catch(() => ({}));
            if (errData && errData.maintenance) {
              const currentPath = (typeof window !== 'undefined' && window.location) ? window.location.pathname.toLowerCase() : '';
              const isAdminRoute = currentPath.includes('admin') || currentPath.includes('analytics');
              const isMaintenancePage = currentPath.endsWith('maintenance.html');
              if (!isAdminRoute && !isMaintenancePage) {
                window.location.href = 'maintenance.html';
              }
            }
            return errData;
          }
          return { success: false, error: `HTTP ${response.status}` };
        }
        
        return await response.json();
      } catch (error) {
        console.error("API POST error:", error);
        return { success: false, error: error.message };
      }
    }
  };
  
  // Debug functions
  window.meritonDebug = function() {
    let cbtUser = null;
    let sessionTokenPresent = false;
    
    try {
      cbtUser = JSON.parse(localStorage.getItem("cbt_user"));
      if (cbtUser && cbtUser.sessionToken) {
        sessionTokenPresent = true;
      }
    } catch (e) {}
    
    const adminTokenPresent = !!localStorage.getItem("admin_token");
    
    return {
      apiUrl: API_URL,
      currentPage: window.location.pathname,
      cbtUserExists: !!cbtUser,
      adminTokenPresent,
      sessionTokenPresent,
      online: navigator.onLine
    };
  };
  
  window.normalizeApiListResponse = function(res, key) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res[key])) return res[key];
    if (res && Array.isArray(res.data)) return res.data;
    if (res && Array.isArray(res.tests)) return res.tests;
    return [];
  };
  
  window.testBackend = async function() {
    try {
      const healthRes = await fetch("https://meriton.onrender.com/health");
      const health = await healthRes.json();
      const tests = await api.get("getAllTests");
      return { success: true, health, tests };
    } catch (error) {
      console.error("Backend test failed:", error);
      return { success: false, error: error.message };
    }
  };
  
  // Expose API globally
  window.api = api;
})();
