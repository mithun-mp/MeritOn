/**
 * CBT Aptitude Platform - Enterprise Analytics Engine (v2.0 Production)
 * Optimized for Ultra-High Scalability, Transaction Safety & Quota Efficiency
 */

const CONFIG = {
  SPREADSHEET_ID: '1OLm9w7TKVk5W2OYIiaERCdzSjixgj2VnZtU7Mg16m7M',
  CACHE_VERSION: 'v2.0',
  PAGINATION: { DEFAULT_LIMIT: 50, MAX_CHUNK: 1000 },
  TIMEZONE: 'Asia/Kolkata',
  LOCK_TIMEOUT: 30000,
  CACHE_TTL: 300, // 5 minutes
  QUOTAS: { EMAIL_BATCH_DELAY: 500, MAX_ROWS_PER_READ: 10000 },
  LOG_LEVELS: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' }
};

let _ss_singleton = null;

/**
 * Centralized Spreadsheet Singleton Access
 */
function getSpreadsheet() {
  if (!_ss_singleton) {
    _ss_singleton = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return _ss_singleton;
}

const HEADERS = {
  Admin: ['Username', 'Password'],
  Tests: ['TestID', 'Name', 'Date', 'StartTime', 'EndTime', 'Duration', 'Sections', 'Mode', 'ExpiryTime', 'IsDeleted', 'DeletedAt'],
  Questions: ['TestID', 'Section', 'QID', 'Difficulty', 'Question', 'A', 'B', 'C', 'D', 'Correct', 'Marks', 'NegativeMarks', 'IsDeleted', 'DeletedAt'],
  Performance: [
    'userID', 'name', 'Email', 'TestId', 'TotalScore', 'TotalQuestions', 'SectionAnalyticsJSON', 
    'CorrectCount', 'WrongCount', 'UnansweredCount', 'SubmittedAt', 'ResultPublished', 'PublishedAt',
    'StartedAt', 'TotalTimeTaken', 'AutoSubmitted', 'FullScreenViolations', 'TabSwitchCount', 'State', 'NetScore', 'Rank', 'Percentile'
  ],
  Responses: [
    'userID', 'name', 'Email', 'TestId', 'QID', 'Section', 'Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 
    'SelectedAnswer', 'CorrectAnswer', 'IsCorrect', 'IsUnanswered', 'Difficulty', 'SubmittedAt', 'Marks', 'NegativeMarks'
  ],
  ErrorLogs: ['Timestamp', 'Severity', 'Function', 'Error', 'UserID', 'TestID', 'ExecutionTime'],
  AuditLogs: ['Timestamp', 'Action', 'UserID', 'TestID', 'Details']
};

const EXAM_STATES = {
  NOT_STARTED: 'NOT_STARTED', ACTIVE: 'ACTIVE', SUBMITTED: 'SUBMITTED',
  AUTO_SUBMITTED: 'AUTO_SUBMITTED', EXPIRED: 'EXPIRED', DISQUALIFIED: 'DISQUALIFIED'
};

/* =========================
   REQUEST VALIDATION MIDDLEWARE
========================= */
function validateRequest(data, requiredFields = []) {
  if (!data) throw new Error('Empty payload');
  const missing = requiredFields.filter(f => data[f] === undefined || data[f] === null || data[f] === '');
  if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
  return true;
}

/* =========================
   ROUTING ENGINE (GET)
========================= */
function doGet(e) {
  const startTime = Date.now();
  try {
    const params = e.parameter;
    const action = params.action;
    const testId = params.testId || params.TestId || params.TestID;
    const userId = params.userId || params.userID || params.UserID;

    if (!action) throw new Error('Action parameter required');

    let response;
    switch (action) {
      case 'getAllTests': response = getAllTests(params); break;
      case 'getQuestions':
    response = getQuestions(
        testId,
        params.includeAnswers === 'true'
    );
    break;
      case 'getAnswers': response = getAnswers(testId); break;
      case 'getResults': response = getResults(params); break;
      case 'getPerformance': response = getPerformance(params); break;
      case 'getResponses': response = getResponses(params); break;
      case 'getCandidateAnalytics': response = getCandidateAnalytics(userId); break;
      default: throw new Error('Invalid action');
    }

    return jsonResponse(response);
  } catch (err) {
    logProductionError('doGet', err.message, CONFIG.LOG_LEVELS.ERROR, '', '', Date.now() - startTime);
    return jsonResponse({ error: err.message });
  }
}

/* =========================
   ROUTING ENGINE (POST)
========================= */
function doPost(e) {
  const startTime = Date.now();
  let lock;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(CONFIG.LOCK_TIMEOUT);

    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    // Normalize testId and userId from various casing variants
    const testId = data.testId || data.TestId || data.TestID;
    const userId = data.userId || data.userID || data.UserID;

    if (!action) throw new Error('Action required');

    let response;
    switch (action) {
      case 'adminLogin': response = adminLogin(data.username, data.password); break;
      case 'createTest': response = createTest(data.testData); break;
      case 'updateTest': response = updateTest(testId, data.testData); break;
      case 'deleteTest': response = deleteTest(testId, data.permanent === true); break;
      case 'addQuestions': response = addQuestions(testId, data.questions); break;
      case 'uploadQuestions': response = addQuestions(testId, data.questions); break;
      case 'updateQuestion': response = updateQuestion(testId, data.qid, data.updatedData); break;
      case 'deleteQuestion': response = deleteQuestion(testId, data.qid, data.permanent === true); break;
      case 'submitTest': response = submitTest(data); break;
      case 'publishResult': response = publishResult(testId, userId); break;
      case 'publishAllResults': response = publishAllResults(testId); break;
      case 'createBackup': response = createBackup(); break;
      default: throw new Error('Invalid action');
    }

    return jsonResponse(response);
  } catch (err) {
    logProductionError('doPost', err.message, CONFIG.LOG_LEVELS.ERROR, '', '', Date.now() - startTime);
    return jsonResponse({ error: err.message });
  } finally {
    if (lock) lock.releaseLock();
  }
}

/* =========================
   CORE PRODUCTION HELPERS
========================= */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Enterprise Severity-Based Logging with Timing
 */
function logProductionError(fn, msg, severity = CONFIG.LOG_LEVELS.INFO, userId = '', testId = '', execTime = 0) {
  try {
    const sheet = getSheet('ErrorLogs');
    // Using batch-style append for logging consistency
    const logRow = [new Date(), severity, fn, msg, userId, testId, execTime + 'ms'];
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, logRow.length).setValues([logRow]);
  } catch (e) {
    console.error('Critical Logging Failure:', e);
  }
}

function logAudit(action, userId, testId, details = '') {
  try {
    const sheet = getSheet('AuditLogs');
    const auditRow = [new Date(), action, userId, testId, details];
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, auditRow.length).setValues([auditRow]);
  } catch (e) {}
}

/**
 * Optimized Cache Management with Versioning
 */
function clearCache(keys = []) {
  const cache = CacheService.getScriptCache();
  const versionedKeys = keys.map(k => `${CONFIG.CACHE_VERSION}_${k}`);
  cache.removeAll(versionedKeys);
}

function getCachedOrFetch(cacheKey, fetchFn, ttl = CONFIG.CACHE_TTL) {
  const cache = CacheService.getScriptCache();
  const versionedKey = `${CONFIG.CACHE_VERSION}_${cacheKey}`;
  const cached = cache.get(versionedKey);

  if (cached) {
    try { return JSON.parse(cached); } 
    catch (e) { cache.remove(versionedKey); }
  }

  const fresh = fetchFn();
  if (fresh) cache.put(versionedKey, JSON.stringify(fresh), ttl);

  return fresh;
}

/**
 * Optimized Sheet Access with Precise Range Fetching
 */
function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (HEADERS[name]) {
      const headerRow = HEADERS[name];
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    }
    return sheet;
  }

  // Fallback: Precise Column Extension
  if (HEADERS[name]) {
    const lastCol = sheet.getLastColumn();
    const currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    const missing = HEADERS[name].filter(h => !currentHeaders.includes(h));
    
    if (missing.length > 0) {
      sheet.getRange(1, Math.max(lastCol, 0) + 1, 1, missing.length).setValues([missing]);
    }
  }

  return sheet;
}

/**
 * Production-Grade Range Fetching with Chunk Support
 */
function getSheetData(name, includeDeleted = false) {
  const sheet = getSheet(name);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow <= 1) return { headers: HEADERS[name] || [], rows: [] };

  // Use precise range to avoid empty cell artifacts
  const data = sheet.getRange(1, 1, lastRow, Math.max(lastCol, 1)).getValues();
  const headers = data[0];
  const isDeletedIdx = headers.indexOf('IsDeleted');

  let rows = data.slice(1);
  if (!includeDeleted && isDeletedIdx !== -1) {
    rows = rows.filter(row => row[isDeletedIdx] !== true);
  }

  return { headers, rows };
}

function mapRowsToObjects(headers, rows) {
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

/**
 * High-Performance Indexed Lookup
 */
function buildIndex(rows, headers, columnName) {
  const idx = headers.indexOf(columnName);
  if (idx === -1) return {};
  const map = {};
  rows.forEach(row => {
    const val = row[idx];
    if (!map[val]) map[val] = [];
    map[val].push(row);
  });
  return map;
}

/**
 * Optimized Pagination Wrapper
 */
function paginate(data, params) {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || CONFIG.PAGINATION.DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  const totalRecords = data.length;
  const totalPages = Math.ceil(totalRecords / limit);
  const paginatedData = data.slice(offset, offset + limit);

  return {
    data: paginatedData,
    pagination: {
      totalRecords,
      totalPages,
      currentPage: page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/* =========================
   ADMIN LOGIC
========================= */
function adminLogin(u, p) {
  try {
    const { headers, rows } = getSheetData('Admin');
    const uIdx = headers.indexOf('Username');
    const pIdx = headers.indexOf('Password');
    
    if (uIdx === -1 || pIdx === -1) throw new Error('Invalid Admin sheet structure');
    
    const isValid = rows.some(row => 
      row[uIdx].toString().trim() === u.toString().trim() && 
      row[pIdx].toString().trim() === p.toString().trim()
    );
    
    return { success: isValid };
  } catch (err) {
    logProductionError('adminLogin', err.message, CONFIG.LOG_LEVELS.ERROR);
    return { success: false, error: 'Authentication service unavailable' };
  }
}

/* =========================
   TESTS (SCALABLE)
========================= */
function getAllTests(params = {}) {
  const fetchTests = () => {
    const { headers, rows } = getSheetData('Tests', params.includeDeleted === 'true');
    const tests = mapRowsToObjects(headers, rows);

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

    return tests.map(t => {
      const dateIST = new Date(new Date(t.Date).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      
      const startTimeObj = new Date(t.StartTime);
      const expiryTimeObj = new Date(t.ExpiryTime || t.EndTime);
      const endTimeObj = new Date(t.EndTime);

      const startStr  = Utilities.formatDate(startTimeObj, "Asia/Kolkata", "HH:mm");
      const expiryStr = Utilities.formatDate(expiryTimeObj, "Asia/Kolkata", "HH:mm");
      const endStr    = Utilities.formatDate(endTimeObj, "Asia/Kolkata", "HH:mm");

      // User-friendly AM/PM display
      const startDisplay = Utilities.formatDate(startTimeObj, "Asia/Kolkata", "hh:mm a");
      const expiryDisplay = Utilities.formatDate(expiryTimeObj, "Asia/Kolkata", "hh:mm a");

      const [sh, sm] = startStr.split(':').map(Number);
      const [xh, xm] = expiryStr.split(':').map(Number);

      const start = new Date(dateIST); start.setHours(sh, sm, 0);
      const expiry = new Date(dateIST); expiry.setHours(xh, xm, 0);

      const canLogin = (now >= start && now <= expiry);
      
      t.status = now < start ? 'Upcoming' : (canLogin ? 'Available' : 'Closed');
      t.canLogin = canLogin;
      t.StartTime = startStr; // Keep 24h for frontend logic
      t.ExpiryTime = expiryStr; // Keep 24h for frontend logic
      t.StartTimeDisplay = startDisplay;
      t.ExpiryTimeDisplay = expiryDisplay;
      t.EndTime = endStr;
      t.Date = Utilities.formatDate(dateIST, "Asia/Kolkata", "yyyy-MM-dd");

      return t;
    });
  };

  // Cache applied to global test list
  const processed = getCachedOrFetch('all_tests_' + (params.includeDeleted === 'true'), fetchTests);

  return params.page ? paginate(processed, params) : processed;
}

function createTest(t) {
  const sheet = getSheet('Tests');
  const testId = 'T' + Utilities.getUuid().slice(0, 8);

  const rowData = HEADERS.Tests.map(h => {
    switch(h) {
      case 'TestID': return testId;
      case 'Name': return t.name;
      case 'Date': return t.date;
      case 'StartTime': return t.startTime;
      case 'EndTime': return t.endTime;
      case 'Duration': return t.duration;
      case 'Sections': return JSON.stringify(t.sections);
      case 'Mode': return t.mode;
      case 'ExpiryTime': return t.expiryTime;
      case 'IsDeleted': return false;
      default: return null;
    }
  });

  // Batch insert instead of appendRow
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowData.length).setValues([rowData]);
  
  // Invalidate global test cache
  clearCache(['all_tests_true', 'all_tests_false']);
  return { success: true, testId };
}

function updateTest(testId, t) {
  const sheet = getSheet('Tests');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) throw new Error('Test not found');

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues(); // Cache data locally
  const headers = data[0];
  const testIdIdx = headers.indexOf('TestID');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][testIdIdx] == testId) { rowIndex = i + 1; break; }
  }

  if (rowIndex === -1) throw new Error('Test not found');

  const fieldMap = {
    name: 'Name', date: 'Date', startTime: 'StartTime', endTime: 'EndTime',
    duration: 'Duration', sections: 'Sections', mode: 'Mode', expiryTime: 'ExpiryTime'
  };

  for (const key in t) {
    const headerName = fieldMap[key];
    const colIdx = headers.indexOf(headerName);
    if (colIdx !== -1) {
      let val = t[key];
      if (headerName === 'Sections') val = JSON.stringify(val);
      sheet.getRange(rowIndex, colIdx + 1).setValue(val);
    }
  }

  // Invalidate test related cache
  clearCache(['all_tests_true', 'all_tests_false']);
  return { success: true };
}

/**
 * Optimized Bulk Delete / Soft Delete (v2.0)
 * Uses filtered array reconstruction for high performance
 */
function deleteTest(testId, permanent = false) {
  const ss = getSpreadsheet();
  
  // Helper for memory-safe bulk processing
  const bulkProcess = (sheetName, idColumnName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1) return;

    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0];
    const idIdx = headers.indexOf(idColumnName);
    const delIdx = headers.indexOf('IsDeleted');
    const delAtIdx = headers.indexOf('DeletedAt');

    if (permanent) {
      // Memory-safe reconstruction
      const filtered = data.filter((row, i) => i === 0 || row[idIdx] != testId);
      sheet.clearContents();
      if (filtered.length > 0) {
        sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
      }
    } else if (delIdx !== -1) {
      // Single-pass soft delete update
      const rows = data.slice(1);
      let changed = false;
      const updated = rows.map(row => {
        if (row[idIdx] == testId) {
          row[delIdx] = true;
          if (delAtIdx !== -1) row[delAtIdx] = new Date();
          changed = true;
        }
        return row;
      });
      if (changed) {
        sheet.getRange(2, 1, updated.length, headers.length).setValues(updated);
      }
    }
  };

  const startTime = Date.now();
  ['Tests', 'Questions', 'Performance', 'Responses'].forEach(s => {
    const idHeader = (s === 'Tests' || s === 'Questions') ? 'TestID' : 'TestId';
    bulkProcess(s, idHeader);
  });

  // Invalidate related cache
  clearCache(['all_tests_true', 'all_tests_false', 'questions_' + testId, 'answers_' + testId]);
  
  logProductionError('deleteTest', `Completed (${permanent ? 'Permanent' : 'Soft'})`, CONFIG.LOG_LEVELS.INFO, '', testId, Date.now() - startTime);
  return { success: true };
}

/* =========================
   QUESTIONS ENGINE
========================= */
function getQuestions(testId, includeAnswers = false) {

  const fetchQuestions = () => {

    const { headers, rows } = getSheetData('Questions');

    const testIdIdx = headers.indexOf('TestID');
    const correctIdx = headers.indexOf('Correct');

    return rows
      .filter(row => row[testIdIdx] == testId)
      .map(row => {

        const q = {};

        headers.forEach((h, i) => {

          // Hide correct answers only for students
          if (!includeAnswers && i === correctIdx) return;

          q[h] = row[i];
        });

        return q;
      });
  };

  return getCachedOrFetch(
    'questions_' + testId + '_' + includeAnswers,
    fetchQuestions
  );
}

function getAnswers(testId) {
  const fetchAnswers = () => {
    const { headers, rows } = getSheetData('Questions');
    const testIdIdx = headers.indexOf('TestID');
    const qidIdx = headers.indexOf('QID');
    const correctIdx = headers.indexOf('Correct');

    const answers = {};
    rows.filter(row => row[testIdIdx] == testId).forEach(row => {
      answers[row[qidIdx]] = row[correctIdx];
    });
    return answers;
  };

  return getCachedOrFetch('answers_' + testId, fetchAnswers);
}

function addQuestions(testId, questions) {
  const sheet = getSheet('Questions');
  const rows = questions.map(q => {
    if (!['A','B','C','D'].includes(q.correct)) throw new Error(`Invalid correct option for QID ${q.qid}`);
    
    return HEADERS.Questions.map(h => {
      switch(h) {
        case 'TestID': return testId;
        case 'Section': return q.section;
        case 'QID': return q.qid;
        case 'Difficulty': return q.difficulty;
        case 'Question': return String(q.question || '');
        case 'A': return String(q.a || '');
        case 'B': return String(q.b || '');
        case 'C': return String(q.c || '');
        case 'D': return String(q.d || '');
        case 'Correct': return q.correct;
        case 'Marks': return q.marks || 1;
        case 'NegativeMarks': return q.negativeMarks || 0;
        case 'IsDeleted': return false;
        default: return null;
      }
    });
  });

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, HEADERS.Questions.length).setValues(rows);
  
  // Invalidate questions cache
  clearCache(['questions_' + testId, 'answers_' + testId]);
  return { success: true };
}

function updateQuestion(testId, qid, updatedData) {
  const sheet = getSheet('Questions');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) throw new Error('Question not found');

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues(); // Cache data locally
  const headers = data[0];
  const testIdIdx = headers.indexOf('TestID');
  const qidIdx = headers.indexOf('QID');

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][testIdIdx] == testId && data[i][qidIdx] == qid) { rowIndex = i + 1; break; }
  }

  if (rowIndex === -1) throw new Error('Question not found');

  const fieldMap = {
    section: 'Section', difficulty: 'Difficulty', question: 'Question',
    a: 'A', b: 'B', c: 'C', d: 'D', correct: 'Correct', marks: 'Marks', negativeMarks: 'NegativeMarks'
  };

  for (const key in updatedData) {
    const headerName = fieldMap[key];
    const colIdx = headers.indexOf(headerName);
    if (colIdx !== -1) {
        let val = updatedData[key];
        // Formatting preservation: Only trim metadata
        if (['section', 'difficulty', 'correct'].includes(key)) val = String(val || '').trim();
        else val = String(val || '');
        
        sheet.getRange(rowIndex, colIdx + 1).setValue(val);
    }
  }

  // Invalidate questions cache
  clearCache(['questions_' + testId, 'answers_' + testId]);
  return { success: true };
}

function deleteQuestion(testId, qid, permanent = false) {
  const sheet = getSheet('Questions');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return { success: true };

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];
  const tIdx = headers.indexOf('TestID');
  const qIdx = headers.indexOf('QID');
  const delIdx = headers.indexOf('IsDeleted');

  if (permanent) {
    const filtered = data.filter((row, i) => i === 0 || !(row[tIdx] == testId && row[qIdx] == qid));
    sheet.clearContents();
    if (filtered.length > 0) sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
  } else if (delIdx !== -1) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][tIdx] == testId && data[i][qIdx] == qid) {
        sheet.getRange(i + 1, delIdx + 1).setValue(true);
        break;
      }
    }
  }

  // Invalidate questions cache
  clearCache(['questions_' + testId, 'answers_' + testId]);
  return { success: true };
}

/**
 * Production-Grade Payload Normalization Engine
 * Ensures strict schema compliance before any data processing
 */
function normalizePayload(data) {
  if (!data || typeof data !== 'object') return data;

  const normalized = {
    userID: (data.userID || data.UserID || data.userId || '').toString().trim(),
    name: (data.name || data.Name || '').toString().trim(),
    Email: (data.Email || data.email || '').toString().trim(),
    TestId: (data.TestId || data.TestID || data.testId || '').toString().trim()
  };
  
  // Security & Timing Fields
  if (data.FullScreenViolations !== undefined || data.fullscreenViolations !== undefined) {
    normalized.FullScreenViolations = data.FullScreenViolations ?? data.fullscreenViolations;
  }
  if (data.TabSwitchCount !== undefined || data.tabSwitchCount !== undefined) {
    normalized.TabSwitchCount = data.TabSwitchCount ?? data.tabSwitchCount;
  }
  if (data.StartedAt !== undefined || data.startedAt !== undefined) {
    normalized.StartedAt = data.StartedAt ?? data.startedAt;
  }
  
  // Explicitly remove non-standard variants to prevent pollution
  const pollution = [
    'UserID', 'userId', 'Name', 'email', 'TestID', 'testId', 
    'fullscreenViolations', 'tabSwitchCount', 'startedAt'
  ];
  pollution.forEach(k => delete data[k]);
  
  return { ...data, ...normalized };
}

/* =========================
   SUBMISSION ENGINE (v3.0 SCHEMA-DRIVEN)
========================= */
function submitTest(rawData) {
  const startTime = Date.now();
  
  // 1. Mandatory Schema Normalization
  const data = normalizePayload(rawData);
  const { userID, name, Email, TestId, answers, startedAt, FullScreenViolations, TabSwitchCount, autoSubmitted } = data;

  // 2. Production Request Validation
  validateRequest(data, ['userID', 'TestId', 'answers']);
  if (!Email.includes('@')) throw new Error('Invalid email structure');

  // 3. Transaction Safety: Re-check submission within lock
  const perfSheet = getSheet('Performance');
  const lastRow = perfSheet.getLastRow();
  const lastCol = perfSheet.getLastColumn();
  const perfData = lastRow > 1 ? perfSheet.getRange(1, 1, lastRow, lastCol).getValues() : [HEADERS.Performance];
  
  const pHeaders = perfData[0];
  const pUserIdIdx = pHeaders.indexOf('userID');
  const pTestIdIdx = pHeaders.indexOf('TestId');

  // Fast check for duplicate submission using indexed re-validation
  const alreadySubmitted = perfData.some(row => 
    row[pUserIdIdx].toString().trim() === userID && 
    row[pTestIdIdx].toString().trim() === TestId
  );
  if (alreadySubmitted) throw new Error('Submission already exists');

  // 4. Optimized Resource Fetching (In-Memory Lookup)
  const tests = getAllTests();
  const test = (Array.isArray(tests) ? tests : (tests.data || [])).find(t => t.TestID == TestId);
  if (!test) throw new Error('Invalid Test Reference');

  // Question Engine: Load with Snapshot integrity
  const { headers: qHeaders, rows: qRows } = getSheetData('Questions');
  const qMap = buildIndex(qRows, qHeaders, 'TestID')[TestId] || [];
  if (qMap.length === 0) throw new Error('Test question bank empty');

  // Header indexing for O(1) loop performance
  const qIdx = {
    qid: qHeaders.indexOf('QID'),
    section: qHeaders.indexOf('Section'),
    correct: qHeaders.indexOf('Correct'),
    marks: qHeaders.indexOf('Marks'),
    neg: qHeaders.indexOf('NegativeMarks'),
    text: qHeaders.indexOf('Question'),
    a: qHeaders.indexOf('A'), b: qHeaders.indexOf('B'), c: qHeaders.indexOf('C'), d: qHeaders.indexOf('D'),
    diff: qHeaders.indexOf('Difficulty')
  };

  // 5. Enterprise Scoring Engine (Single-Pass Aggregation)
  let stats = { raw: 0, net: 0, correct: 0, wrong: 0, unanswered: 0 };
  const sectionAnalytics = {};
  const responseRows = [];
  const submittedAt = new Date();

  qMap.forEach(row => {
    const qid = row[qIdx.qid];
    const section = row[qIdx.section];
    const correctAns = String(row[qIdx.correct] || '').trim().toUpperCase();
    const marks = Number(row[qIdx.marks] || 1);
    const negMarks = Number(row[qIdx.neg] || 0);
    
    const selectedAns = answers[qid] ? String(answers[qid]).trim().toUpperCase() : null;
    const isUnanswered = (selectedAns === null || selectedAns === '');
    const isCorrect = !isUnanswered && selectedAns === correctAns;

    if (!sectionAnalytics[section]) {
      sectionAnalytics[section] = { correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0 };
    }
    sectionAnalytics[section].total++;

    if (isCorrect) {
      stats.correct++; stats.raw += marks; stats.net += marks;
      sectionAnalytics[section].correct++; sectionAnalytics[section].score += marks;
    } else if (isUnanswered) {
      stats.unanswered++;
      sectionAnalytics[section].unanswered++;
    } else {
      stats.wrong++; stats.net -= negMarks;
      sectionAnalytics[section].wrong++; sectionAnalytics[section].score -= negMarks;
    }

    // Historical Immutable Snapshot (STRICT RESPONSES SCHEMA)
    responseRows.push([
      userID, name, Email, TestId, qid, section, String(row[qIdx.text] || ''),
      String(row[qIdx.a] || ''), String(row[qIdx.b] || ''), String(row[qIdx.c] || ''), String(row[qIdx.d] || ''),
      selectedAns || '', correctAns, isCorrect, isUnanswered, row[qIdx.diff], 
      submittedAt, marks, negMarks
    ]);
  });

  // 6. Batched Persistence Strategy (STRICT PERFORMANCE SCHEMA)
  const startTimeObj = startedAt ? new Date(startedAt) : null;
  const timeTaken = startTimeObj ? Math.floor((submittedAt - startTimeObj) / 1000) : 0;

  const perfRow = HEADERS.Performance.map(h => {
    switch(h) {
      case 'userID': return userID;
      case 'name': return name;
      case 'Email': return Email;
      case 'TestId': return TestId;
      case 'TotalScore': return stats.raw;
      case 'TotalQuestions': return qMap.length;
      case 'SectionAnalyticsJSON': return JSON.stringify(sectionAnalytics);
      case 'CorrectCount': return stats.correct;
      case 'WrongCount': return stats.wrong;
      case 'UnansweredCount': return stats.unanswered;
      case 'SubmittedAt': return submittedAt;
      case 'ResultPublished': return false;
      case 'StartedAt': return startTimeObj;
      case 'TotalTimeTaken': return timeTaken;
      case 'AutoSubmitted': return autoSubmitted === true;
      case 'FullScreenViolations': return FullScreenViolations || data.fullscreenViolations || 0;
      case 'TabSwitchCount': return TabSwitchCount || data.tabSwitchCount || 0;
      case 'State': return autoSubmitted ? EXAM_STATES.AUTO_SUBMITTED : EXAM_STATES.SUBMITTED;
      case 'NetScore': return isNaN(stats.net) ? 0 : stats.net;
      default: return null;
    }
  });

  // Batch insert summary and detailed responses
  perfSheet.getRange(perfSheet.getLastRow() + 1, 1, 1, perfRow.length).setValues([perfRow]);
  
  const respSheet = getSheet('Responses');
  if (responseRows.length > 0) {
    respSheet.getRange(respSheet.getLastRow() + 1, 1, responseRows.length, HEADERS.Responses.length).setValues(responseRows);
  }

  // Recalculate Ranks for the test cohort
  updateRanks(TestId);

  logProductionError('submitTest', 'Success', CONFIG.LOG_LEVELS.INFO, userID, TestId, Date.now() - startTime);
  return { success: true, score: stats.net, rawScore: stats.raw, correctCount: stats.correct, total: qMap.length, submittedAt };
}

/**
 * Advanced Ranking & Percentile Engine (v3.0 SCHEMA-DRIVEN)
 * Optimized for SINGLE batch write of multi-column updates
 */
function updateRanks(TestId) {
  const sheet = getSheet('Performance');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return;

  // Fetch only necessary data for ranking
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];
  const tIdx = headers.indexOf('TestId');
  const netIdx = headers.indexOf('NetScore');
  const correctIdx = headers.indexOf('CorrectCount');
  const timeIdx = headers.indexOf('TotalTimeTaken');
  const rankIdx = headers.indexOf('Rank');
  const percIdx = headers.indexOf('Percentile');

  if (tIdx === -1 || netIdx === -1 || rankIdx === -1 || percIdx === -1) return;

  // Filter only relevant test attempts
  const testRows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][tIdx] == TestId) {
      testRows.push({ 
        score: Number(data[i][netIdx]) || 0, 
        correct: Number(data[i][correctIdx]) || 0,
        time: Number(data[i][timeIdx]) || 999999,
        index: i 
      });
    }
  }

  if (testRows.length === 0) return;

  // Enterprise Ranking Logic:
  // 1. NetScore Descending
  // 2. CorrectCount Descending (Tie-breaker 1)
  // 3. TotalTimeTaken Ascending (Tie-breaker 2)
  testRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.time - b.time;
  });

  // Single-pass rank and percentile calculation
  let currentRank = 1;
  const totalCount = testRows.length;

  testRows.forEach((item, i) => {
    // Handling ties for the same rank if all tie-breakers are equal
    if (i > 0) {
      const prev = testRows[i-1];
      if (item.score < prev.score || item.correct < prev.correct || item.time > prev.time) {
        currentRank = i + 1;
      }
    }
    
    const percentile = ((totalCount - (currentRank - 1)) / totalCount) * 100;
    
    // Update local data buffer
    data[item.index][rankIdx] = currentRank;
    data[item.index][percIdx] = percentile.toFixed(2);
  });

  // Optimized: Targeted column writes
  const rankColumn = data.slice(1).map(row => [row[rankIdx]]);
  const percColumn = data.slice(1).map(row => [row[percIdx]]);

  sheet.getRange(2, rankIdx + 1, rankColumn.length, 1).setValues(rankColumn);
  sheet.getRange(2, percIdx + 1, percColumn.length, 1).setValues(percColumn);
}

/* =========================
   ANALYTICS APIs (v3.0 SCHEMA-DRIVEN)
========================= */
function getPerformance(params) {
  const { headers, rows } = getSheetData('Performance');
  let data = mapRowsToObjects(headers, rows);

  // Advanced Filtering (Server-Side)
  if (params.TestId || params.testId) data = data.filter(d => d.TestId == (params.TestId || params.testId));
  if (params.userID || params.userId) data = data.filter(d => d.userID == (params.userID || params.userId));
  if (params.search) {
    const s = params.search.toLowerCase();
    data = data.filter(d => (d.name || '').toLowerCase().includes(s) || (d.Email || '').toLowerCase().includes(s));
  }

  // Multi-Criteria Sorting
  if (params.sort === 'score') data.sort((a, b) => (Number(b.NetScore) || 0) - (Number(a.NetScore) || 0));
  else if (params.sort === 'accuracy') data.sort((a, b) => (Number(b.CorrectCount) / Number(b.TotalQuestions) || 0) - (Number(a.CorrectCount) / Number(a.TotalQuestions) || 0));
  else data.sort((a, b) => new Date(b.SubmittedAt) - new Date(a.SubmittedAt));

  return params.page ? paginate(data, params) : data;
}

function getResults(params) {
  return getPerformance(params);
}

function getResponses(params) {
  const { headers, rows } = getSheetData('Responses');
  let data = mapRowsToObjects(headers, rows);
  
  if (params.TestId || params.testId) data = data.filter(d => d.TestId == (params.TestId || params.testId));
  if (params.userID || params.userId) data = data.filter(d => d.userID == (params.userID || params.userId));

  return params.page ? paginate(data, params) : data;
}

/**
 * Enterprise Analytics Engine (v3.0 SCHEMA-DRIVEN)
 */
function getCandidateAnalytics(userId) {
  if (!userId) throw new Error('userID required');

  const { headers, rows } = getSheetData('Performance');
  const uIdx = headers.indexOf('userID');
  const scoreIdx = headers.indexOf('TotalScore');
  const netIdx = headers.indexOf('NetScore');
  const totalQIdx = headers.indexOf('TotalQuestions');
  const analyticsIdx = headers.indexOf('SectionAnalyticsJSON');
  const correctIdx = headers.indexOf('CorrectCount');
  const wrongIdx = headers.indexOf('WrongCount');
  const unansIdx = headers.indexOf('UnansweredCount');
  const dateIdx = headers.indexOf('SubmittedAt');
  const testIdIdx = headers.indexOf('TestId');
  const percIdx = headers.indexOf('Percentile');
  const rankIdx = headers.indexOf('Rank');
  const tabIdx = headers.indexOf('TabSwitchCount');
  const fullIdx = headers.indexOf('FullScreenViolations');

  // Single-pass filtering and aggregation
  const stats = {
    totalExams: 0, totalMarks: 0, totalNet: 0, totalQuestions: 0,
    totalCorrect: 0, totalWrong: 0, totalUnanswered: 0,
    totalTabSwitches: 0, totalFullScreenViolations: 0,
    examHistory: [], sectionWiseOverall: {}, bestRank: Infinity, avgPercentile: 0
  };

  rows.forEach(row => {
    if (row[uIdx].toString().trim() == userId.toString().trim()) {
      const s = Number(row[scoreIdx]) || 0;
      const n = Number(row[netIdx]) || 0;
      const t = Number(row[totalQIdx]) || 0;
      const p = Number(row[percIdx]) || 0;
      const r = Number(row[rankIdx]) || Infinity;

      stats.totalExams++;
      stats.totalMarks += s;
      stats.totalNet += n;
      stats.totalQuestions += t;
      stats.totalCorrect += Number(row[correctIdx]) || 0;
      stats.totalWrong += Number(row[wrongIdx]) || 0;
      stats.totalUnanswered += Number(row[unansIdx]) || 0;
      stats.totalTabSwitches += Number(row[tabIdx]) || 0;
      stats.totalFullScreenViolations += Number(row[fullIdx]) || 0;
      stats.avgPercentile += p;
      if (r < stats.bestRank) stats.bestRank = r;

      // Section Aggregation
      try {
        const sections = JSON.parse(row[analyticsIdx]);
        for (const name in sections) {
          if (!stats.sectionWiseOverall[name]) {
            stats.sectionWiseOverall[name] = { correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0 };
          }
          const sec = sections[name];
          stats.sectionWiseOverall[name].correct += sec.correct || 0;
          stats.sectionWiseOverall[name].wrong += sec.wrong || 0;
          stats.sectionWiseOverall[name].unanswered += sec.unanswered || 0;
          stats.sectionWiseOverall[name].total += sec.total || 0;
          stats.sectionWiseOverall[name].score += sec.score || 0;
        }
      } catch (e) {}

      stats.examHistory.push({
        testId: row[testIdIdx], score: n, percentile: p, date: row[dateIdx], state: row[headers.indexOf('State')]
      });
    }
  });

  if (stats.totalExams === 0) return { error: 'No data found for user' };

  stats.avgPercentile = (stats.avgPercentile / stats.totalExams).toFixed(2);
  if (stats.bestRank === Infinity) stats.bestRank = '-';

  return stats;
}

/* =========================
   RESULT PUBLISHING (STABLE)
========================= */
function publishResult(testId, userId) {
  const sheet = getSheet('Performance');
  const { headers, rows } = getSheetData('Performance');
  const tIdx = headers.indexOf('TestId');
  const uIdx = headers.indexOf('userID');
  const pubIdx = headers.indexOf('ResultPublished');
  const pubAtIdx = headers.indexOf('PublishedAt');

  const rowIndex = rows.findIndex(row => row[tIdx] == testId && row[uIdx] == userId);
  if (rowIndex === -1) throw new Error('Result not found');
  if (rows[rowIndex][pubIdx] === true) return { success: true, message: 'Already published' };

  const res = mapRowsToObjects(headers, [rows[rowIndex]])[0];
  const tests = getAllTests();
  const testList = Array.isArray(tests) ? tests : (tests.data || []);
  const test = testList.find(t => t.TestID == testId);
  res.TestName = test ? test.Name : testId;

  try {
    sendResultEmail(res, res.Rank);
    sheet.getRange(rowIndex + 2, pubIdx + 1, 1, 2).setValues([[true, new Date()]]);
    return { success: true };
  } catch (err) {
    logProductionError('publishResult', err.message, CONFIG.LOG_LEVELS.ERROR, userId, testId);
    throw err;
  }
}

/**
 * Enterprise Quota-Safe Batch Result Publishing
 * Supports time-driven continuation and quota retry
 */
function publishAllResults(testId) {
  const startTime = Date.now();
  const results = getResults({ testId });
  const pending = results.data ? results.data.filter(res => !res.ResultPublished) : results.filter(res => !res.ResultPublished);
  
  let count = 0;
  let failed = 0;

  for (const res of pending) {
    // Quota Safety: Stop if execution exceeds 5 minutes to prevent timeout
    if (Date.now() - startTime > 240000) {
      logProductionError('publishAllResults', 'Partial execution: Time limit near', CONFIG.LOG_LEVELS.WARN, '', testId);
      break;
    }

    try {
      publishResult(testId, res.userID);
      count++;
      Utilities.sleep(CONFIG.QUOTAS.EMAIL_BATCH_DELAY);
    } catch (e) {
      failed++;
      logProductionError('publishAllResults', `Quota/Mail Failure for ${res.userID}: ${e.message}`, CONFIG.LOG_LEVELS.WARN, res.userID, testId);
    }
  }

  return { 
    success: true, 
    publishedCount: count, 
    failedCount: failed, 
    remaining: pending.length - count - failed 
  };
}

function sendResultEmail(res, rank) {
  const isPass = (res.NetScore / res.TotalQuestions) >= 0.4;
  const sections = JSON.parse(res.SectionAnalyticsJSON);
  
  let sectionHtml = '<table style="width:100%; border-collapse: collapse; margin-top: 15px;">' +
    '<tr style="background-color: #f2f2f2;">' +
    '<th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Section</th>' +
    '<th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Score</th>' +
    '<th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Accuracy</th>' +
    '</tr>';
  
  for (const s in sections) {
    const acc = (sections[s].correct / (sections[s].correct + sections[s].wrong)) * 100 || 0;
    sectionHtml += `<tr>
      <td style="border: 1px solid #ddd; padding: 10px;">${s}</td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${sections[s].score}</td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${acc.toFixed(1)}%</td>
    </tr>`;
  }
  sectionHtml += '</table>';

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1a237e; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Assessment Report</h1>
        <p style="margin: 10px 0 0; opacity: 0.8;">${res.TestName}</p>
      </div>
      
      <div style="padding: 30px; line-height: 1.6;">
        <p>Dear <strong>${res.Name}</strong>,</p>
        <p>Your performance report is ready. You scored a net of <strong>${res.NetScore}</strong> marks.</p>
        
        <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
          <div style="font-size: 14px; color: #666; text-transform: uppercase;">Net Score</div>
          <div style="font-size: 48px; font-weight: bold; color: ${isPass ? '#2e7d32' : '#c62828'}; margin: 5px 0;">${res.NetScore}</div>
          <div style="font-size: 18px; font-weight: bold;">Rank: #${rank} | Percentile: ${res.Percentile}%</div>
        </div>

        <h3 style="color: #1a237e;">Sectional Breakdown</h3>
        ${sectionHtml}
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: res.Email,
    subject: `CBT Result: ${res.TestName}`,
    htmlBody: htmlBody
  });
}

/* =========================
   MAINTENANCE & BACKUP
========================= */
function createBackup() {
  const ss = getSpreadsheet();
  const folder = DriveApp.getFileById(CONFIG.SPREADSHEET_ID).getParents().next();
  const backupName = `Backup_${ss.getName()}_${Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd_HH-mm")}`;
  
  const backupFile = DriveApp.getFileById(CONFIG.SPREADSHEET_ID).makeCopy(backupName, folder);
  return { success: true, backupId: backupFile.getId() };
}