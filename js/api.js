
(function() {
  // Hardcoded API URL - MONGO RENDER ONLY
  const API_URL = "https://meriton.onrender.com/api";
  
  // Hard safety check
  if (API_URL.includes("script.google.com")) {
    throw new Error("[MERITON] BLOCKED: Google Apps Script not allowed!");
  }
  
  console.log("[MERITON] Backend locked to Mongo Render:", API_URL);
  
  // Public actions that don't require tokens
  const PUBLIC_ACTIONS = [
    "getAllTests",
    "loginUser",
    "adminLogin",
    "sendOTP",
    "registerUser",
    "forgotPassword",
    "resetPassword",
    "logoutSession"
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
        
        // Inject session token if not public action
        if (!PUBLIC_ACTIONS.includes(action)) {
          const sessionToken = getSessionTokens();
          if (sessionToken) {
            requestParams.sessionToken = sessionToken;
          }
        }
        
        // Build query string
        const query = Object.keys(requestParams)
          .map(key => encodeURIComponent(key) + "=" + encodeURIComponent(requestParams[key]))
          .join("&");
        
        const url = `${API_URL}?${query}`;
        
        const response = await fetch(url);
        if (!response.ok) {
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
        
        // Inject session token if not public action
        if (requestData.action && !PUBLIC_ACTIONS.includes(requestData.action)) {
          const sessionToken = getSessionTokens();
          if (sessionToken) {
            requestData.sessionToken = sessionToken;
          }
        }
        
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
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
    
    console.group("🧭 MERITON DEBUG");
    console.log("API URL:", API_URL);
    console.log("Current page:", window.location.pathname);
    console.log("cbt_user exists:", !!cbtUser);
    console.log("admin_token exists:", adminTokenPresent);
    console.log("Session token exists:", sessionTokenPresent);
    console.log("Online status:", navigator.onLine);
    console.groupEnd();
    
    return {
      apiUrl: API_URL,
      currentPage: window.location.pathname,
      cbtUserExists: !!cbtUser,
      adminTokenPresent,
      sessionTokenPresent,
      online: navigator.onLine
    };
  };
  
  window.testBackend = async function() {
    console.group("🔍 MERITON TEST BACKEND");
    
    try {
      console.log("Testing /health...");
      const healthRes = await fetch("https://meriton.onrender.com/health");
      const health = await healthRes.json();
      console.log("/health:", health);
      
      console.log("Testing getAllTests...");
      const tests = await api.get("getAllTests");
      console.log("getAllTests:", tests);
      
      console.groupEnd();
      return { success: true, health, tests };
    } catch (error) {
      console.error("❌ Backend test failed:", error);
      console.groupEnd();
      return { success: false, error: error.message };
    }
  };
  
  // Expose API globally
  window.api = api;
})();
