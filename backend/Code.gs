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
  Users: [
    'UserID', 'FullName', 'Email', 'UnivID', 'Password', 'Role', 'Phone', 'College', 'Department', 'Year', 'Status', 
    'EmailVerified', 'ExamNotifications', 'ResultNotifications', 'LastExamNotification', 'LastResultNotification', 
    'CreatedAt', 'LastLogin', 'LastLoginIP', 'ProfilePhoto', 'IsDeleted', 'DeletedAt'
  ],
  Tests: ['TestID', 'Name', 'Date', 'StartTime', 'EndTime', 'Duration', 'Sections', 'Mode', 'ExpiryTime', 'IsDeleted', 'DeletedAt'],
  Questions: ['TestID', 'Section', 'QID', 'Difficulty', 'Question', 'A', 'B', 'C', 'D', 'Correct', 'Marks', 'NegativeMarks', 'IsDeleted', 'DeletedAt'],
  Performance: [
    'userID', 'name', 'Email', 'TestId', 'TotalScore', 'TotalQuestions', 'SectionAnalyticsJSON',
    'CorrectCount', 'WrongCount', 'UnansweredCount', 'SubmittedAt', 'ResultPublished', 'PublishedAt',
    'StartedAt', 'TotalTimeTaken', 'AutoSubmitted', 'FullScreenViolations', 'TabSwitchCount', 'State',
    'NetScore', 'Rank', 'Percentile', 'OverallPercentage', 'AverageSectionPercentage'
  ],
  SubmissionQueue: ['Timestamp','UserID','TestId','Payload','Status','Result'],
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
      case 'getUser': response = getUser(userId); break;
      case 'getAllUsers': response = getAllUsers(params); break;
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

    const rawData = JSON.parse(e.postData.contents);
    const data = normalizePayload(rawData);
    const action = data.action;
    
    // Use normalized fields
    const testId = data.TestId;
    const userId = data.userID;
    const email = data.Email;
    const identifier = data.identifier || email;

    if (!action) throw new Error('Action required');

    let response;
    switch (action) {
      case 'adminLogin': response = adminLogin(data.username || identifier, data.password); break;
      case 'registerUser': response = registerUser(data.userData); break;
      case 'loginUser': response = loginUser(identifier, data.password, data.ip || data.lastLoginIP); break;
      case 'sendOTP': response = sendOTP(email, data.type); break;
      case 'forgotPassword': response = forgotPassword(identifier); break;
      case 'resetPassword': response = resetPassword(identifier, data.otp, data.newPassword); break;
      case 'updateUser': response = updateUser(userId, data.userData); break;
      case 'deleteUser': response = deleteUser(userId); break;
      case 'sendExamNotification': response = sendExamNotification(testId, data.details, data.filters); break;
      case 'sendResultNotification': response = sendResultNotification(testId); break;
      case 'createTest': response = createTest(data.testData); break;
      case 'updateTest': response = updateTest(testId, data.testData); break;
      case 'deleteTest': response = deleteTest(testId, data.permanent === true); break;
      case 'addQuestions': response = addQuestions(testId, data.questions); break;
      case 'uploadQuestions': response = addQuestions(testId, data.questions); break;
      case 'updateQuestion': response = updateQuestion(testId, data.QID, data.updatedData); break;
      case 'bulkUpdateQuestions': response = bulkUpdateQuestions(testId, data.updates); break;
      case 'deleteQuestion': response = deleteQuestion(testId, data.QID, data.permanent === true); break;
      case 'submitTest': response = submitTest(data); break;
      case 'publishResult': response = publishResult(testId, userId); break;
      case 'publishAllResults': response = publishAllResults(testId); break;
      case 'publishAnswerKey': response = publishAnswerKey(testId); break;
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
 * Enterprise Schema-Safe Row Builder
 * Ensures strict column ordering and prevents duplicate data artifacts
 * @param {string} sheetName - The name of the sheet schema to follow
 * @param {object} data - The raw object data to convert into a row array
 * @param {boolean} forceString - If true, treats content fields with formatting preservation
 */
function buildSafeRow(sheetName, data, forceString = false) {
  const headers = HEADERS[sheetName];
  if (!headers) throw new Error(`Schema not defined for ${sheetName}`);
  
  // Fields that require strict string preservation to prevent Google Sheets auto-formatting (e.g., dates, formulas)
  const preservationFields = [
    'Question', 'A', 'B', 'C', 'D', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 
    'Correct', 'CorrectAnswer', 'SelectedAnswer', 'QID', 'TestID', 'TestId', 'UnivID', 'userID'
  ];

  return headers.map(h => {
    let val = data[h];
    if (val === undefined || val === null) val = '';
    
    const strVal = String(val);

    // Apply safety prefix for specific fields to force RAW TEXT storage
    // This prevents "1 2 2003" -> Date or "=1+1" -> Formula
    if (preservationFields.includes(h)) {
      // Always prepend apostrophe for these fields unless it's already a clean string that Sheets won't mangle
      // But to be 100% safe as per prompt, we prefix.
      return "'" + strVal;
    }
    
    return val;
  });
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
   USER MANAGEMENT
========================= */

/**
 * Generate 6-digit OTP and store in Cache
 */
function sendOTP(email, type = 'registration') {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const cache = CacheService.getScriptCache();
    cache.put(`OTP_${email}_${type}`, otp, 600);

    const isReg = type === 'registration';
    const subject = isReg ? 'Verify Your Email - CBT Platform' : 'Reset Your Password - CBT Platform';
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 550px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 50px 40px; text-align: center;">
                    <div style="background: rgba(255,255,255,0.1); width: 64px; height: 64px; border-radius: 18px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                      <span style="font-size: 32px;">🔐</span>
                    </div>
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">CBT PLATFORM</h1>
                    <p style="color: #94a3b8; margin: 10px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">Security Verification</p>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 50px 40px; color: #334155;">
                    <h2 style="margin: 0 0 20px; color: #0f172a; font-size: 22px; font-weight: 700; text-align: center;">${isReg ? 'Verify Your Identity' : 'Reset Password Request'}</h2>
                    <p style="margin: 0; line-height: 1.6; text-align: center; font-size: 16px; color: #64748b;">
                      ${isReg ? 'To complete your registration, please use the following one-time password (OTP) to verify your email address.' : 'We received a request to reset your password. Use the following code to proceed with the reset process.'}
                    </p>
                    
                    <div style="margin: 40px 0; text-align: center;">
                      <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 20px; padding: 30px; display: inline-block; min-width: 200px;">
                        <span style="font-family: 'SF Mono', 'Fira Code', monospace; font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #2563eb; display: block; margin-left: 12px;">${otp}</span>
                      </div>
                    </div>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fff7ed; border-radius: 12px; border-left: 4px solid #f97316; margin-top: 30px;">
                      <tr>
                        <td style="padding: 15px 20px;">
                          <p style="margin: 0; font-size: 13px; color: #9a3412; line-height: 1.5;">
                            <strong>Security Notice:</strong> This code is strictly confidential and will expire in <strong>10 minutes</strong>. If you did not request this, please ignore this email.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8; font-weight: 500;">
                      &copy; 2026 CBT Aptitude Platform. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function verifyOTP(email, otp, type = 'registration') {
  const cache = CacheService.getScriptCache();
  const stored = cache.get(`OTP_${email}_${type}`);
  if (!stored) throw new Error('Verification code expired. Please resend.');
  if (stored !== otp) throw new Error('Invalid verification code. Please try again.');
  
  cache.remove(`OTP_${email}_${type}`);
  return true;
}

function registerUser(u) {
  try {
    validateRequest(u, ['FullName', 'Email', 'Password', 'UnivID', 'OTP']);
    const email = (u.Email || '').toString().toLowerCase().trim();
    const univId = (u.UnivID || '').toString().trim();
    
    if (!email) throw new Error('Email is required');
    if (!univId) throw new Error('University ID is required');

    // 1. Verify OTP
    verifyOTP(email, u.OTP, 'registration');
    
    const { headers, rows } = getSheetData('Users', true);
    const emailIdx = headers.indexOf('Email');
    const univIdIdx = headers.indexOf('UnivID');
    
    // 2. Check duplicates
    if (rows.some(row => (row[emailIdx] || '').toString().toLowerCase() === email)) {
      throw new Error('Email already registered');
    }
    if (rows.some(row => (row[univIdIdx] || '').toString() === univId)) {
      throw new Error('University ID already registered');
    }
    
    const internalUserId = 'U' + (rows.length + 1).toString().padStart(5, '0');
    
    const userData = {
      ...u,
      UserID: internalUserId,
      UnivID: univId,
      Email: email,
      College: u.College || 'GEC THRISSUR',
      Role: u.Role || 'student',
      Status: 'active',
      EmailVerified: true,
      ExamNotifications: true,
      ResultNotifications: true,
      CreatedAt: new Date(),
      IsDeleted: false
    };
    
    const row = buildSafeRow('Users', userData);
    const sheet = getSheet('Users');
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    
    return { success: true, userId: internalUserId, univId: univId };
  } catch (err) {
    logProductionError('registerUser', err.message, CONFIG.LOG_LEVELS.ERROR);
    return { success: false, error: err.message };
  }
}

function loginUser(identifier, password, ip = '') {
  try {
    if (!identifier) throw new Error('Email or University ID required');
    if (!password) throw new Error('Password required');

    // 1. Priority Check: Admin Login (Allows admins to login from both pages)
    const adminRes = adminLogin(identifier, password);
    if (adminRes.success) return adminRes;

    // 2. Standard Candidate Check
    const { headers, rows } = getSheetData('Users');
    const eIdx = headers.indexOf('Email');
    const uIdx = headers.indexOf('UnivID');
    const pIdx = headers.indexOf('Password');
    const sIdx = headers.indexOf('Status');
    const idIdx = headers.indexOf('UserID');
    const nIdx = headers.indexOf('FullName');
    const rIdx = headers.indexOf('Role');
    const ipIdx = headers.indexOf('LastLoginIP');
    
    const searchVal = identifier.toString().toLowerCase().trim();

    const userRow = rows.find(row => {
      const email = (row[eIdx] || '').toString().toLowerCase().trim();
      const univId = (row[uIdx] || '').toString().toLowerCase().trim();
      const pass = (row[pIdx] || '').toString();
      
      return (email === searchVal || univId === searchVal) && pass === password.toString();
    });
    
    if (!userRow) {
      throw new Error('Invalid email/university ID or password');
    }
    
    if (userRow[sIdx] !== 'active') throw new Error(`Account is ${userRow[sIdx]}`);
    
    const userId = userRow[idIdx];
    const sheet = getSheet('Users');
    const rowIndex = rows.findIndex(r => r[idIdx] === userId) + 2;
    
    // Update LastLogin and IP
    const loginIdx = headers.indexOf('LastLogin');
    
    if (loginIdx !== -1) {
      sheet.getRange(rowIndex, loginIdx + 1).setValue(new Date());
    }
    
    if (ipIdx !== -1 && ip) {
      sheet.getRange(rowIndex, ipIdx + 1).setValue(ip);
    }

    return {
      success: true,
      userId: userRow[idIdx],
      univId: userRow[uIdx],
      fullName: userRow[nIdx],
      email: userRow[eIdx],
      role: (userRow[rIdx] || 'student').toString().toLowerCase().trim(),
      status: userRow[sIdx],
      college: userRow[headers.indexOf('College')] || 'GEC THRISSUR',
      lastLoginIP: userRow[ipIdx] || ''
    };
  } catch (err) {
    logProductionError('loginUser', err.message, CONFIG.LOG_LEVELS.ERROR);
    return { success: false, error: err.message };
  }
}

function forgotPassword(identifier) {
  try {
    if (!identifier) throw new Error('Identifier required');
    const { headers, rows } = getSheetData('Users');
    const eIdx = headers.indexOf('Email');
    const uIdx = headers.indexOf('UnivID');
    
    const searchVal = identifier.toLowerCase().trim();
    const userRow = rows.find(row => 
      (row[eIdx] || '').toString().toLowerCase() === searchVal || 
      (row[uIdx] || '').toString().toLowerCase() === searchVal
    );
    
    if (!userRow) throw new Error('No account found with this email or ID');
    const email = userRow[eIdx];
    
    return sendOTP(email, 'forgot_password');
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function resetPassword(identifier, otp, newPassword) {
  try {
    if (!identifier) throw new Error('Identifier required');
    const { headers, rows } = getSheetData('Users');
    const eIdx = headers.indexOf('Email');
    const uIdx = headers.indexOf('UnivID');
    const pIdx = headers.indexOf('Password');
    
    const searchVal = identifier.toLowerCase().trim();
    const userRow = rows.find(row => 
      (row[eIdx] || '').toString().toLowerCase() === searchVal || 
      (row[uIdx] || '').toString().toLowerCase() === searchVal
    );
    
    if (!userRow) throw new Error('User not found');
    const email = userRow[eIdx];
    
    verifyOTP(email, otp, 'forgot_password');
    
    const sheet = getSheet('Users');
    const rowIndex = rows.findIndex(row => (row[eIdx] || '').toString().toLowerCase() === email.toLowerCase()) + 2;
    sheet.getRange(rowIndex, pIdx + 1).setValue(newPassword);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getUser(userId) {
  try {
    const { headers, rows } = getSheetData('Users');
    const idIdx = headers.indexOf('UserID');
    const userRow = rows.find(row => row[idIdx] === userId);
    
    if (!userRow) throw new Error('User not found');
    
    const user = {};
    headers.forEach((h, i) => {
      if (h !== 'Password') user[h] = userRow[i];
    });
    
    return user;
  } catch (err) {
    return { error: err.message };
  }
}

function updateUser(userId, data) {
  try {
    const sheet = getSheet('Users');
    const { headers, rows } = getSheetData('Users');
    const idIdx = headers.indexOf('UserID');
    const rowIndex = rows.findIndex(row => row[idIdx] === userId) + 2;
    
    if (rowIndex === 1) throw new Error('User not found');
    
    const allowed = ['Phone', 'College', 'Department', 'Year', 'ProfilePhoto', 'ExamNotifications', 'ResultNotifications'];
    
    allowed.forEach(field => {
      if (data[field] !== undefined) {
        const colIdx = headers.indexOf(field);
        if (colIdx !== -1) {
          sheet.getRange(rowIndex, colIdx + 1).setValue(data[field]);
        }
      }
    });
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteUser(userId) {
  try {
    const sheet = getSheet('Users');
    const { headers, rows } = getSheetData('Users');
    const idIdx = headers.indexOf('UserID');
    const delIdx = headers.indexOf('IsDeleted');
    const delAtIdx = headers.indexOf('DeletedAt');
    const rowIndex = rows.findIndex(row => row[idIdx] === userId) + 2;
    
    if (rowIndex === 1) throw new Error('User not found');
    
    sheet.getRange(rowIndex, delIdx + 1).setValue(true);
    sheet.getRange(rowIndex, delAtIdx + 1).setValue(new Date());
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getAllUsers(params) {
  try {
    const { headers, rows } = getSheetData('Users');
    const users = mapRowsToObjects(headers, rows).map(u => {
      delete u.Password;
      return u;
    });
    return params.page ? paginate(users, params) : users;
  } catch (err) {
    return { error: err.message };
  }
}

/* =========================
   ADMIN LOGIC
========================= */
function adminLogin(u, p) {
  try {
    if (!u || !p) return { success: false };

    const searchVal = u.toString().toLowerCase().trim();
    const passVal = p.toString().trim();

    // 1. Check Admin Sheet (Primary)
    const { headers: aHeaders, rows: aRows } = getSheetData('Admin');
    const auIdx = aHeaders.indexOf('Username');
    const apIdx = aHeaders.indexOf('Password');
    
    if (auIdx !== -1 && apIdx !== -1) {
      const adminRow = aRows.find(row => 
        row[auIdx].toString().toLowerCase().trim() === searchVal && 
        row[apIdx].toString().trim() === passVal
      );
      
      if (adminRow) {
        return {
          success: true,
          userId: 'ADMIN',
          univId: 'ADMIN',
          fullName: 'System Administrator',
          email: adminRow[auIdx],
          role: 'admin',
          status: 'active',
          college: 'GEC THRISSUR'
        };
      }
    }

    // 2. Check Users Sheet (Fallback for Admins registered in Users)
    const { headers: uHeaders, rows: uRows } = getSheetData('Users');
    const ueIdx = uHeaders.indexOf('Email');
    const uuIdx = uHeaders.indexOf('UnivID');
    const upIdx = uHeaders.indexOf('Password');
    const urIdx = uHeaders.indexOf('Role');
    const usIdx = uHeaders.indexOf('Status');
    const uidIdx = uHeaders.indexOf('UserID');
    const unIdx = uHeaders.indexOf('FullName');
    const ucIdx = uHeaders.indexOf('College');

    if (ueIdx !== -1 && upIdx !== -1 && urIdx !== -1) {
      const userRow = uRows.find(row => {
        const email = (row[ueIdx] || '').toString().toLowerCase().trim();
        const univId = (row[uuIdx] || '').toString().toLowerCase().trim();
        const pass = (row[upIdx] || '').toString();
        const role = (row[urIdx] || '').toString().toLowerCase().trim();
        
        return (email === searchVal || univId === searchVal) && 
               pass === passVal && 
               role === 'admin';
      });

      if (userRow) {
        if (userRow[usIdx] !== 'active') return { success: false, error: `Account is ${userRow[usIdx]}` };
        return {
          success: true,
          userId: userRow[uidIdx],
          univId: userRow[uuIdx],
          fullName: userRow[unIdx],
          email: userRow[ueIdx],
          role: 'admin',
          status: 'active',
          college: userRow[ucIdx] || 'GEC THRISSUR'
        };
      }
    }
    
    return { success: false };
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
    
    const qData = {
      TestID: testId,
      Section: q.section,
      QID: q.qid,
      Difficulty: q.difficulty,
      Question: q.question,
      A: q.a,
      B: q.b,
      C: q.c,
      D: q.d,
      Correct: q.correct,
      Marks: q.marks || 1,
      NegativeMarks: q.negativeMarks || 0,
      IsDeleted: false
    };
    return buildSafeRow('Questions', qData);
  });

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, HEADERS.Questions.length).setValues(rows);
  
  // Invalidate questions cache
  clearCache(['questions_' + testId, 'answers_' + testId]);
  return { success: true };
}

function bulkUpdateQuestions(testId, updates) {
  const sheet = getSheet('Questions');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return { success: true };

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];
  const testIdIdx = headers.indexOf('TestID');
  const qidIdx = headers.indexOf('QID');

  const fieldMap = {
    section: 'Section', difficulty: 'Difficulty', question: 'Question',
    a: 'A', b: 'B', c: 'C', d: 'D', correct: 'Correct', marks: 'Marks', negativeMarks: 'NegativeMarks'
  };

  let changed = false;
  const searchTestId = String(testId || '').trim();

  updates.forEach(u => {
    const searchQid = String(u.qid || '').trim();
    const rowIndex = data.findIndex((row, i) => 
      i > 0 && 
      String(row[testIdIdx] || '').trim() == searchTestId && 
      String(row[qidIdx] || '').trim() == searchQid
    );

    if (rowIndex !== -1) {
      for (const key in u.updatedData) {
        const headerName = fieldMap[key];
        const colIdx = headers.indexOf(headerName);
        if (colIdx !== -1) {
          let val = u.updatedData[key];
          if (['section', 'difficulty', 'correct'].includes(key)) {
            val = String(val || '').trim();
          }
          // Preserve exact formatting for content fields using apostrophe prefix
          if (['Question', 'A', 'B', 'C', 'D', 'Correct'].includes(headerName)) {
            val = "'" + String(val);
          }
          data[rowIndex][colIdx] = val;
          changed = true;
        }
      }
    }
  });

  if (changed) {
    sheet.getRange(1, 1, lastRow, lastCol).setValues(data);
  }

  clearCache(['questions_' + testId, 'answers_' + testId]);
  return { success: true };
}

function updateQuestion(testId, qid, updatedData) {
  const sheet = getSheet('Questions');
  const { headers, rows } = getSheetData('Questions', true);
  const testIdIdx = headers.indexOf('TestID');
  const qidIdx = headers.indexOf('QID');

  const searchTestId = String(testId || '').trim();
  const searchQid = String(qid || '').trim();

  const rowIndex = rows.findIndex(row => 
    String(row[testIdIdx] || '').trim() == searchTestId && 
    String(row[qidIdx] || '').trim() == searchQid
  ) + 2;
  if (rowIndex === 1) throw new Error('Question not found');

  const fieldMap = {
    section: 'Section', difficulty: 'Difficulty', question: 'Question',
    a: 'A', b: 'B', c: 'C', d: 'D', correct: 'Correct', marks: 'Marks', negativeMarks: 'NegativeMarks'
  };

  for (const key in updatedData) {
    const headerName = fieldMap[key];
    const colIdx = headers.indexOf(headerName);
    if (colIdx !== -1) {
        let val = updatedData[key];
        // Only trim metadata, preserve question/options formatting
        if (['section', 'difficulty', 'correct'].includes(key)) {
          val = String(val || '').trim();
        }
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

  const searchTestId = String(testId || '').trim();
  const searchQid = String(qid || '').trim();

  if (permanent) {
    const filtered = data.filter((row, i) => i === 0 || !(
      String(row[tIdx] || '').trim() == searchTestId && 
      String(row[qIdx] || '').trim() == searchQid
    ));
    sheet.clearContents();
    if (filtered.length > 0) sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
  } else if (delIdx !== -1) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][tIdx] || '').trim() == searchTestId && 
          String(data[i][qIdx] || '').trim() == searchQid) {
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
    UnivID: (data.UnivID || data.univId || data.univid || '').toString().trim(),
    TestId: (data.TestId || data.TestID || data.testId || '').toString().trim(),
    QID: (data.QID || data.qid || '').toString().trim()
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
    'UserID', 'userId', 'Name', 'email', 'univId', 'univid', 'TestID', 'testId', 'qid',
    'fullscreenViolations', 'tabSwitchCount', 'startedAt'
  ];
  pollution.forEach(k => delete data[k]);
  
  return { ...data, ...normalized };
}

/* =========================
   ACADEMIC EVALUATION ENGINE (v4.0)
   Percentage = correct / total (marks do not affect %)
   Percentile = candidates strictly below / total candidates
========================= */
function logPerf(message, detail) {
  Logger.log('[PERF] ' + message + (detail ? ' ' + JSON.stringify(detail) : ''));
}

function calcAccuracyPercentage(correct, total) {
  const t = Number(total) || 0;
  const c = Number(correct) || 0;
  if (t <= 0) return 0;
  return Math.round((c / t) * 10000) / 100;
}

function finalizeSectionAnalytics(sectionAnalytics) {
  const finalized = sectionAnalytics || {};
  Object.keys(finalized).forEach(name => {
    const s = finalized[name];
    s.total = Number(s.total) || 0;
    s.correct = Number(s.correct) || 0;
    s.wrong = Number(s.wrong) || 0;
    s.unanswered = Number(s.unanswered) || 0;
    s.percentage = calcAccuracyPercentage(s.correct, s.total);
    if (s.score === undefined) s.score = 0;
    logPerf('Section Percentage Calculated', { section: name, percentage: s.percentage, correct: s.correct, total: s.total });
  });
  return finalized;
}

function calcOverallPercentage(correct, totalQuestions) {
  const pct = calcAccuracyPercentage(correct, totalQuestions);
  logPerf('Overall Percentage Calculated', { correct: correct, total: totalQuestions, percentage: pct });
  return pct;
}

function calcAverageSectionPercentage(sectionAnalytics) {
  const keys = Object.keys(sectionAnalytics || {});
  if (keys.length === 0) return 0;
  const sum = keys.reduce((acc, k) => acc + (Number(sectionAnalytics[k].percentage) || 0), 0);
  return Math.round((sum / keys.length) * 100) / 100;
}

/** True if `other` performed strictly worse than `candidate` (ranking tie-break order). */
function isCandidateStrictlyWorse(other, candidate) {
  if (other.index === candidate.index) return false;
  if (other.percentage < candidate.percentage) return true;
  if (other.percentage > candidate.percentage) return false;
  if (other.correct < candidate.correct) return true;
  if (other.correct > candidate.correct) return false;
  return other.time > candidate.time;
}

function backfillPerformancePercentages(row, headers) {
  const correctIdx = headers.indexOf('CorrectCount');
  const totalQIdx = headers.indexOf('TotalQuestions');
  const analyticsIdx = headers.indexOf('SectionAnalyticsJSON');
  const percIdx = headers.indexOf('Percentile');
  const overallIdx = headers.indexOf('OverallPercentage');
  const avgSecIdx = headers.indexOf('AverageSectionPercentage');

  if (correctIdx === -1 || totalQIdx === -1) return;

  const correct = Number(row[correctIdx]) || 0;
  const total = Number(row[totalQIdx]) || 0;
  let sectionAnalytics = {};

  if (analyticsIdx !== -1 && row[analyticsIdx]) {
    try {
      sectionAnalytics = finalizeSectionAnalytics(JSON.parse(row[analyticsIdx]));
      row[analyticsIdx] = JSON.stringify(sectionAnalytics);
    } catch (e) {
      sectionAnalytics = {};
    }
  }

  if (overallIdx !== -1) row[overallIdx] = calcOverallPercentage(correct, total);
  if (percIdx !== -1) row[percIdx] = row[overallIdx] || 0;
  if (avgSecIdx !== -1) row[avgSecIdx] = calcAverageSectionPercentage(sectionAnalytics);
}

/* =========================
   SUBMISSION ENGINE (v3.0 SCHEMA-DRIVEN)
========================= */
/**
 * Internal: process a single submission immediately. Returns submission result object.
 */
function processSubmissionInternal(rawData) {
  const startTime = Date.now();
  const data = normalizePayload(rawData);
  const { userID, TestId, answers, startedAt, FullScreenViolations, TabSwitchCount, autoSubmitted } = data;

  validateRequest(data, ['userID', 'TestId', 'answers']);

  const user = getUser(userID);
  if (!user || user.error || user.Status !== 'active' || user.IsDeleted) {
    throw new Error('Unauthorized or inactive candidate identity');
  }
  const { FullName: name, Email } = user;

  const perfSheet = getSheet('Performance');
  const { headers: pHeaders, rows: pRows } = getSheetData('Performance');
  const pUserIdIdx = pHeaders.indexOf('userID');
  const pTestIdIdx = pHeaders.indexOf('TestId');

  const alreadySubmitted = pRows.some(row => 
    row[pUserIdIdx].toString().trim() === userID && 
    row[pTestIdIdx].toString().trim() === TestId
  );
  if (alreadySubmitted) throw new Error('Submission already exists');

  const tests = getAllTests();
  const test = (Array.isArray(tests) ? tests : (tests.data || [])).find(t => t.TestID == TestId);
  if (!test) throw new Error('Invalid Test Reference');

  const { headers: qHeaders, rows: qRows } = getSheetData('Questions');
  const qMap = buildIndex(qRows, qHeaders, 'TestID')[TestId] || [];
  if (qMap.length === 0) throw new Error('Test question bank empty');

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

  let stats = { raw: 0, net: 0, correct: 0, wrong: 0, unanswered: 0 };
  const sectionAnalytics = {};
  const responseRows = [];
  const submittedAt = new Date();

  qMap.forEach(row => {
    const qid = row[qIdx.qid];
    const section = row[qIdx.section];
    const correctAns = String(row[qIdx.correct] || '').toUpperCase();
    const marks = Number(row[qIdx.marks] || 1);
    const negMarks = Number(row[qIdx.neg] || 0);
    
    const selectedAns = answers[qid] ? String(answers[qid]) : null;
    const isUnanswered = (selectedAns === null || selectedAns === '');
    const isCorrect = !isUnanswered && selectedAns.trim().toUpperCase() === correctAns.trim().toUpperCase();

    const sectionKey = section || 'General';
    if (!sectionAnalytics[sectionKey]) {
      sectionAnalytics[sectionKey] = { correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0 };
    }
    sectionAnalytics[sectionKey].total++;

    if (isCorrect) {
      stats.correct++; stats.raw += marks; stats.net += marks;
      sectionAnalytics[sectionKey].correct++;
      sectionAnalytics[sectionKey].score += marks;
    } else if (isUnanswered) {
      stats.unanswered++;
      sectionAnalytics[sectionKey].unanswered++;
    } else {
      stats.wrong++; stats.net -= negMarks;
      sectionAnalytics[sectionKey].wrong++;
      sectionAnalytics[sectionKey].score -= negMarks;
    }

    const respData = {
      userID: userID,
      name: name,
      Email: Email,
      TestId: TestId,
      QID: qid,
      Section: section,
      Question: row[qIdx.text],
      OptionA: row[qIdx.a],
      OptionB: row[qIdx.b],
      OptionC: row[qIdx.c],
      OptionD: row[qIdx.d],
      SelectedAnswer: selectedAns || '',
      CorrectAnswer: correctAns,
      IsCorrect: isCorrect,
      IsUnanswered: isUnanswered,
      Difficulty: row[qIdx.diff],
      SubmittedAt: submittedAt,
      Marks: marks,
      NegativeMarks: negMarks
    };
    responseRows.push(buildSafeRow('Responses', respData));
  });

  const finalizedSections = finalizeSectionAnalytics(sectionAnalytics);
  const overallPercentage = calcOverallPercentage(stats.correct, qMap.length);
  const averageSectionPercentage = calcAverageSectionPercentage(finalizedSections);

  const startTimeObj = startedAt ? new Date(startedAt) : null;
  const timeTaken = startTimeObj ? Math.floor((submittedAt - startTimeObj) / 1000) : 0;

  const perfData = {
    userID: userID,
    name: name,
    Email: Email,
    TestId: TestId,
    TotalScore: stats.raw,
    TotalQuestions: qMap.length,
    SectionAnalyticsJSON: JSON.stringify(finalizedSections),
    CorrectCount: stats.correct,
    WrongCount: stats.wrong,
    UnansweredCount: stats.unanswered,
    SubmittedAt: submittedAt,
    ResultPublished: false,
    StartedAt: startTimeObj,
    TotalTimeTaken: timeTaken,
    AutoSubmitted: autoSubmitted === true,
    FullScreenViolations: FullScreenViolations || 0,
    TabSwitchCount: TabSwitchCount || 0,
    State: autoSubmitted ? EXAM_STATES.AUTO_SUBMITTED : EXAM_STATES.SUBMITTED,
    NetScore: isNaN(stats.net) ? 0 : stats.net,
    Rank: 0,
    Percentile: overallPercentage,
    OverallPercentage: overallPercentage,
    AverageSectionPercentage: averageSectionPercentage
  };

  const perfRow = buildSafeRow('Performance', perfData);
  perfSheet.getRange(perfSheet.getLastRow() + 1, 1, 1, perfRow.length).setValues([perfRow]);
  
  const respSheet = getSheet('Responses');
  if (responseRows.length > 0) {
    respSheet.getRange(respSheet.getLastRow() + 1, 1, responseRows.length, HEADERS.Responses.length).setValues(responseRows);
  }

  updateRanks(TestId);
  logAudit('submitTest', userID, TestId, 'Submission success');
  
  return {
    success: true,
    score: stats.net,
    rawScore: stats.raw,
    correctCount: stats.correct,
    total: qMap.length,
    submittedAt: submittedAt,
    overallPercentage: overallPercentage,
    averageSectionPercentage: averageSectionPercentage
  };
}

/**
 * Append submission payload to queue and attempt to process the queue.
 */
function enqueueSubmission(rawData) {
  const data = normalizePayload(rawData);
  validateRequest(data, ['userID', 'TestId', 'answers']);

  const sheet = getSheet('SubmissionQueue');
  const row = [new Date(), data.userID, data.TestId, JSON.stringify(rawData), 'queued', ''];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  // Attempt to process all queued entries now (still under script lock)
  const results = processSubmissionQueue();

  // Return the result matching this user/test if processed
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (String(r.userID) === String(data.userID) && String(r.TestId) === String(data.TestId)) {
      return r.result || { success: false, error: r.error || 'Queued' };
    }
  }

  // If not found, return a queued acknowledgement
  return { success: true, queued: true };
}

/**
 * Process all entries in the SubmissionQueue sheet (FIFO). Marks rows as processed/failed.
 */
function processSubmissionQueue() {
  const sheet = getSheet('SubmissionQueue');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(1, 1, lastRow, Math.max(lastCol, 1)).getValues();
  const headers = data[0];
  const tsIdx = headers.indexOf('Timestamp');
  const userIdx = headers.indexOf('UserID');
  const testIdx = headers.indexOf('TestId');
  const payloadIdx = headers.indexOf('Payload');
  const statusIdx = headers.indexOf('Status');
  const resultIdx = headers.indexOf('Result');

  const rows = data.slice(1);
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = row[statusIdx];
    if (String(status).toLowerCase().startsWith('processed')) continue;

    try {
      const payload = JSON.parse(row[payloadIdx]);
      const res = processSubmissionInternal(payload);
      sheet.getRange(i + 2, statusIdx + 1).setValue('processed');
      sheet.getRange(i + 2, resultIdx + 1).setValue(JSON.stringify(res));
      results.push({ userID: payload.userID, TestId: payload.TestId, result: res });
    } catch (e) {
      sheet.getRange(i + 2, statusIdx + 1).setValue('failed: ' + e.message);
      sheet.getRange(i + 2, resultIdx + 1).setValue(JSON.stringify({ error: e.message }));
      results.push({ userID: row[userIdx], TestId: row[testIdx], error: e.message });
    }
  }

  return results;
}

/**
 * Backwards-compatible API entrypoint: will enqueue and process submissions safely.
 */
function submitTest(rawData) {
  return enqueueSubmission(rawData);
}

/**
 * Ranking & Percentile Engine (v4.0)
 * Rank: sorted position (NetScore → CorrectCount → Time)
 * Percentile: user's accuracy percentage for the test (CorrectCount / TotalQuestions * 100)
 */
function updateRanks(TestId) {
  const sheet = getSheet('Performance');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return;

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];
  const tIdx = headers.indexOf('TestId');
  const correctIdx = headers.indexOf('CorrectCount');
  const timeIdx = headers.indexOf('TotalTimeTaken');
  const netIdx = headers.indexOf('NetScore');
  const rankIdx = headers.indexOf('Rank');
  const percIdx = headers.indexOf('Percentile');
  const overallIdx = headers.indexOf('OverallPercentage');
  const avgSecIdx = headers.indexOf('AverageSectionPercentage');

  if (tIdx === -1 || correctIdx === -1 || netIdx === -1 || rankIdx === -1 || percIdx === -1 || overallIdx === -1) return;

  const testRows = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][tIdx]) === String(TestId)) {
      backfillPerformancePercentages(data[i], headers);
      testRows.push({
        score: Number(data[i][netIdx]) || 0,
        correct: Number(data[i][correctIdx]) || 0,
        time: Number(data[i][timeIdx]) || 999999,
        overallPercentage: Number(data[i][overallIdx]) || 0,
        index: i
      });
    }
  }

  if (testRows.length === 0) return;

  testRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.time - b.time;
  });

  const totalCount = testRows.length;

  testRows.forEach((item, i) => {
    const rank = i + 1;
    const percentile = item.overallPercentage;

    data[item.index][rankIdx] = rank;
    data[item.index][percIdx] = percentile;

    logPerf('Rank Updated', { TestId: TestId, rank: rank, row: item.index + 1 });
    logPerf('Percentile Stored', { TestId: TestId, row: item.index + 1, percentile: percentile });
  });

  const rowCount = data.length - 1;
  if (rowCount <= 0) return;

  sheet.getRange(2, rankIdx + 1, rowCount, 1).setValues(data.slice(1).map(row => [row[rankIdx]]));
  sheet.getRange(2, percIdx + 1, rowCount, 1).setValues(data.slice(1).map(row => [row[percIdx]]));

  if (overallIdx !== -1) {
    sheet.getRange(2, overallIdx + 1, rowCount, 1).setValues(data.slice(1).map(row => [row[overallIdx]]));
  }
  if (avgSecIdx !== -1) {
    sheet.getRange(2, avgSecIdx + 1, rowCount, 1).setValues(data.slice(1).map(row => [row[avgSecIdx]]));
  }
  const analyticsIdx = headers.indexOf('SectionAnalyticsJSON');
  if (analyticsIdx !== -1) {
    sheet.getRange(2, analyticsIdx + 1, rowCount, 1).setValues(data.slice(1).map(row => [row[analyticsIdx]]));
  }
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
  const overallIdx = headers.indexOf('OverallPercentage');
  const avgSecIdx = headers.indexOf('AverageSectionPercentage');

  const stats = {
    totalExams: 0, totalMarks: 0, totalNet: 0, totalQuestions: 0,
    totalCorrect: 0, totalWrong: 0, totalUnanswered: 0,
    totalTabSwitches: 0, totalFullScreenViolations: 0,
    examHistory: [], sectionWiseOverall: {}, bestRank: Infinity,
    avgPercentile: 0, avgOverallPercentage: 0
  };

  rows.forEach(row => {
    if (row[uIdx].toString().trim() == userId.toString().trim()) {
      const s = Number(row[scoreIdx]) || 0;
      const n = Number(row[netIdx]) || 0;
      const t = Number(row[totalQIdx]) || 0;
      const p = Number(row[percIdx]) || 0;
      const r = Number(row[rankIdx]) || Infinity;
      const correct = Number(row[correctIdx]) || 0;
      const overallPct = overallIdx !== -1 && row[overallIdx] !== ''
        ? Number(row[overallIdx])
        : calcOverallPercentage(correct, t);
      const avgSecPct = avgSecIdx !== -1 && row[avgSecIdx] !== ''
        ? Number(row[avgSecIdx])
        : 0;

      stats.totalExams++;
      stats.totalMarks += s;
      stats.totalNet += n;
      stats.totalQuestions += t;
      stats.totalCorrect += correct;
      stats.totalWrong += Number(row[wrongIdx]) || 0;
      stats.totalUnanswered += Number(row[unansIdx]) || 0;
      stats.totalTabSwitches += Number(row[tabIdx]) || 0;
      stats.totalFullScreenViolations += Number(row[fullIdx]) || 0;
      stats.avgPercentile += p;
      stats.avgOverallPercentage += overallPct;
      if (r < stats.bestRank) stats.bestRank = r;

      try {
        const sections = finalizeSectionAnalytics(JSON.parse(row[analyticsIdx] || '{}'));
        for (const name in sections) {
          if (!stats.sectionWiseOverall[name]) {
            stats.sectionWiseOverall[name] = { correct: 0, wrong: 0, unanswered: 0, total: 0, score: 0, percentage: 0 };
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
        testId: row[testIdIdx],
        score: n,
        netScore: n,
        overallPercentage: overallPct,
        averageSectionPercentage: avgSecPct,
        percentile: p,
        rank: r === Infinity ? '-' : r,
        date: row[dateIdx],
        state: row[headers.indexOf('State')]
      });
    }
  });

  if (stats.totalExams === 0) return { error: 'No data found for user' };

  stats.avgPercentile = (stats.avgPercentile / stats.totalExams).toFixed(2);
  stats.avgOverallPercentage = (stats.avgOverallPercentage / stats.totalExams).toFixed(2);
  if (stats.bestRank === Infinity) stats.bestRank = '-';

  const sectionStats = [];
  for (const name in stats.sectionWiseOverall) {
    const s = stats.sectionWiseOverall[name];
    const accuracy = calcAccuracyPercentage(s.correct, s.total);
    sectionStats.push({ name, accuracy, percentage: accuracy, ...s });
  }
  
  sectionStats.sort((a, b) => b.accuracy - a.accuracy);
  stats.strongestSections = sectionStats.slice(0, 3).map(s => s.name);
  stats.weakestSections = sectionStats.slice(-3).reverse().map(s => s.name);
  stats.sectionBreakdown = sectionStats;

  return stats;
}

/* =========================
   NOTIFICATIONS & EMAIL SYSTEM
========================= */

function sendExamNotification(testId, details = '', filters = {}) {
  try {
    const tests = getAllTests();
    const test = (Array.isArray(tests) ? tests : (tests.data || [])).find(t => t.TestID == testId);
    if (!test) throw new Error('Test not found');

    const { headers, rows } = getSheetData('Users');
    const uIdx = headers.indexOf('UserID');
    const nIdx = headers.indexOf('FullName');
    const eIdx = headers.indexOf('Email');
    const sIdx = headers.indexOf('Status');
    const notifIdx = headers.indexOf('ExamNotifications');
    const lastNotifIdx = headers.indexOf('LastExamNotification');
    const delIdx = headers.indexOf('IsDeleted');
    const collegeIdx = headers.indexOf('College');
    const deptIdx = headers.indexOf('Department');
    const yearIdx = headers.indexOf('Year');

    const selectedCollege = (filters && filters.College) ? String(filters.College).trim().toLowerCase() : '';
    const selectedDepartment = (filters && filters.Department) ? String(filters.Department).trim().toLowerCase() : '';
    const selectedYear = (filters && filters.Year) ? String(filters.Year).trim().toLowerCase() : '';

    const activeUsers = rows.filter(row => {
      if (row[sIdx] !== 'active' || row[notifIdx] !== true || row[delIdx] === true) return false;
      if (selectedCollege && selectedCollege !== 'all' && String(row[collegeIdx] || '').trim().toLowerCase() !== selectedCollege) return false;
      if (selectedDepartment && selectedDepartment !== 'all' && String(row[deptIdx] || '').trim().toLowerCase() !== selectedDepartment) return false;
      if (selectedYear && selectedYear !== 'all' && String(row[yearIdx] || '').trim().toLowerCase() !== selectedYear) return false;
      return true;
    });

    const sheet = getSheet('Users');
    let count = 0;

    activeUsers.forEach(userRow => {
      const email = userRow[eIdx];
      const name = userRow[nIdx];
      const userId = userRow[uIdx];

      const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 50px 40px; text-align: center;">
                      <div style="background: rgba(255,255,255,0.2); width: 64px; height: 64px; border-radius: 18px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                        <span style="font-size: 32px;">📝</span>
                      </div>
                      <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Examination Alert</h1>
                      <p style="color: #bfdbfe; margin: 10px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">CBT Aptitude Platform</p>
                    </td>
                  </tr>
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px; color: #334155;">
                      <p style="font-size: 16px; margin-bottom: 25px;">Dear <strong>${name}</strong>,</p>
                      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px; color: #64748b;">
                        A new assessment has been scheduled for your profile. Please review the examination details and ensure your availability.
                      </p>
                      
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; border-radius: 20px; margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 30px;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                              <tr>
                                <td style="padding-bottom: 15px; font-size: 14px; color: #64748b;">Exam Title</td>
                                <td style="padding-bottom: 15px; font-size: 16px; color: #0f172a; font-weight: 700; text-align: right;">${test.Name}</td>
                              </tr>
                              <tr>
                                <td style="padding-bottom: 15px; font-size: 14px; color: #64748b;">Scheduled Date</td>
                                <td style="padding-bottom: 15px; font-size: 16px; color: #0f172a; font-weight: 700; text-align: right;">${test.Date}</td>
                              </tr>
                              <tr>
                                <td style="padding-bottom: 15px; font-size: 14px; color: #64748b;">Start Window</td>
                                <td style="padding-bottom: 15px; font-size: 16px; color: #0f172a; font-weight: 700; text-align: right;">${test.StartTimeDisplay || test.StartTime}</td>
                              </tr>
                              <tr>
                                <td style="font-size: 14px; color: #64748b;">Duration</td>
                                <td style="font-size: 16px; color: #0f172a; font-weight: 700; text-align: right;">${test.Duration} Minutes</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 20px; border-radius: 8px; margin-bottom: 35px;">
                        <h4 style="margin: 0 0 8px; color: #9a3412; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Proctoring Instructions</h4>
                        <p style="margin: 0; font-size: 14px; color: #c2410c; line-height: 1.5;">
                          ${details || 'Please login at least 10 minutes prior to the start time. Ensure you are in a quiet environment with a stable internet connection. Full-screen mode is mandatory.'}
                        </p>
                      </div>

                      <table width="100%" border="0" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center">
                            <a href="${CONFIG.PORTAL_URL || '#'}" style="background-color: #2563eb; color: #ffffff; padding: 18px 40px; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 10px 20px rgba(37,99,235,0.2);">Access Candidate Portal</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        &copy; 2026 CBT Aptitude Platform. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      try {
        MailApp.sendEmail({
          to: email,
          subject: `Upcoming CBT Examination: ${test.Name}`,
          htmlBody: htmlBody
        });

        // Update LastExamNotification
        const rowIndex = rows.findIndex(r => r[uIdx] === userId) + 2;
        sheet.getRange(rowIndex, lastNotifIdx + 1).setValue(new Date());
        count++;
        Utilities.sleep(CONFIG.QUOTAS.EMAIL_BATCH_DELAY);
      } catch (e) {
        logProductionError('sendExamNotification', `Failed for ${email}: ${e.message}`, CONFIG.LOG_LEVELS.WARN, userId, testId);
      }
    });

    return { success: true, count };
  } catch (err) {
    logProductionError('sendExamNotification', err.message, CONFIG.LOG_LEVELS.ERROR, '', testId);
    return { success: false, error: err.message };
  }
}

function sendResultNotification(testId) {
  try {
    const results = getResults({ testId });
    const data = results.data || results;
    
    let count = 0;
    data.forEach(res => {
      if (res.ResultPublished) {
        const user = getUser(res.userID);
        if (user && user.ResultNotifications && user.Status === 'active') {
          sendResultEmail(res, res.Rank);
          count++;
          Utilities.sleep(CONFIG.QUOTAS.EMAIL_BATCH_DELAY);
        }
      }
    });
    
    return { success: true, count };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function sendResultEmail(res, rank) {
  const overallPct = res.OverallPercentage != null && res.OverallPercentage !== ''
    ? Number(res.OverallPercentage)
    : calcOverallPercentage(res.CorrectCount, res.TotalQuestions);
  const isPass = overallPct >= 40;
  const sections = finalizeSectionAnalytics(JSON.parse(res.SectionAnalyticsJSON || '{}'));
  
  let sectionRowsHtml = '';
  for (const s in sections) {
    const acc = sections[s].percentage != null
      ? Number(sections[s].percentage)
      : calcAccuracyPercentage(sections[s].correct, sections[s].total);
    sectionRowsHtml += `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 14px;">${s}</td>
        <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 700; text-align: center; font-size: 14px;">${sections[s].correct}/${sections[s].total}</td>
        <td style="padding: 15px; border-bottom: 1px solid #f1f5f9; color: #2563eb; font-weight: 700; text-align: center; font-size: 14px;">${acc.toFixed(1)}%</td>
      </tr>
    `;
  }

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.12);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 60px 40px; text-align: center;">
                  <div style="background: rgba(255,255,255,0.1); width: 72px; height: 72px; border-radius: 22px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 25px;">
                    <span style="font-size: 36px;">🏆</span>
                  </div>
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Performance Report</h1>
                  <p style="color: #94a3b8; margin: 10px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">Result Published</p>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 40px; color: #334155;">
                  <p style="font-size: 16px; margin-bottom: 25px;">Dear <strong>${res.name}</strong>,</p>
                  <p style="font-size: 16px; line-height: 1.6; margin-bottom: 35px; color: #64748b;">
                    Great job! Your assessment results for <strong>${res.TestName || 'the examination'}</strong> are now available for review.
                  </p>
                  
                  <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 24px; padding: 40px; text-align: center; margin-bottom: 40px; border: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px;">Your Net Score</p>
                    <h2 style="margin: 15px 0; font-size: 64px; font-weight: 800; color: ${isPass ? '#10b981' : '#ef4444'};">${res.NetScore}</h2>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 25px;">
                      <tr>
                        <td width="50%" align="right" style="padding-right: 15px;">
                          <div style="background: white; padding: 12px 20px; border-radius: 14px; border: 1px solid #e2e8f0; display: inline-block;">
                            <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 2px;">Global Rank</span>
                            <strong style="color: #0f172a; font-size: 18px;">#${rank}</strong>
                          </div>
                        </td>
                        <td width="50%" align="left" style="padding-left: 15px;">
                          <div style="background: white; padding: 12px 20px; border-radius: 14px; border: 1px solid #e2e8f0; display: inline-block;">
                            <span style="color: #64748b; font-size: 12px; display: block; margin-bottom: 2px;">Percentile</span>
                            <strong style="color: #2563eb; font-size: 18px;">${res.Percentile}%</strong>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <h3 style="font-size: 18px; color: #0f172a; margin: 0 0 20px; font-weight: 700;">Sectional Analysis</h3>
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden;">
                    <tr style="background-color: #f8fafc;">
                      <th style="padding: 15px; text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase;">Section</th>
                      <th style="padding: 15px; text-align: center; color: #64748b; font-size: 12px; text-transform: uppercase;">Score</th>
                      <th style="padding: 15px; text-align: center; color: #64748b; font-size: 12px; text-transform: uppercase;">Accuracy</th>
                    </tr>
                    ${sectionRowsHtml}
                  </table>

                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 45px;">
                    <tr>
                      <td align="center">
                        <a href="${CONFIG.PORTAL_URL || '#'}/result.html?testId=${res.TestId}" style="background-color: #0f172a; color: #ffffff; padding: 20px 45px; text-decoration: none; border-radius: 16px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 15px 30px rgba(15,23,42,0.2);">View Detailed Analytics</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                    This is an official automated performance report from the CBT Platform.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  MailApp.sendEmail({
    to: res.Email,
    subject: `Result Published: ${res.TestName}`,
    htmlBody: htmlBody
  });
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

function publishAnswerKey(testId) {
  if (!testId) throw new Error('Test ID required');
  const tests = getAllTests();
  const testList = Array.isArray(tests) ? tests : (tests.data || []);
  const test = testList.find(t => String(t.TestID) === String(testId));
  const testName = test ? test.Name : `Test ${testId}`;

  const questions = getQuestions(testId, true);
  if (!questions || questions.length === 0) throw new Error('No questions found for this test');

  const results = getResults({ testId });
  const submittedCandidates = (results.data ? results.data : results)
    .filter(r => r.Email && r.SubmittedAt)
    .map(r => ({
      Email: r.Email,
      FullName: r.FullName || r.name || r.Name || r.username || r.userID,
      TestId: r.TestId || r.TestID
    }));

  if (submittedCandidates.length === 0) {
    throw new Error('No submitted candidate results available');
  }

  const testDate = test ? (test.Date || test.DateDisplay || '') : '';
  const answerKeyHtml = buildAnswerKeyEmailHtml(testName, testDate, questions);
  let pdfAttachment;
  try {
    pdfAttachment = createAnswerKeyPdf(testName, testDate, questions);
  } catch (err) {
    pdfAttachment = null;
  }

  let sentCount = 0;
  let failedCount = 0;

  submittedCandidates.forEach(candidate => {
    try {
      const mailOptions = {
        to: candidate.Email,
        subject: `Answer Key for ${testName}`,
        htmlBody: answerKeyHtml
      };
      if (pdfAttachment) {
        mailOptions.attachments = [pdfAttachment];
      }

      MailApp.sendEmail(mailOptions);
      sentCount++;
      Utilities.sleep(CONFIG.QUOTAS.EMAIL_BATCH_DELAY);
    } catch (err) {
      failedCount++;
      logProductionError('publishAnswerKey', `Failed to send to ${candidate.Email}: ${err.message}`, CONFIG.LOG_LEVELS.WARN, '', testId);
    }
  });

  logAudit('PublishAnswerKey', '', testId, `Sent to ${sentCount} candidates, failed ${failedCount}`);
  return { success: true, sentCount, failedCount }; 
}

function buildAnswerKeyEmailHtml(testName, testDate, questions) {
  const testDateText = testDate || (questions && questions.length > 0 ? (questions[0].TestDate || questions[0].Date || '') : '');
  let currentSection = null;
  const rows = questions.map((q, index) => {
    const section = q.Section || q.section || 'General';
    const difficulty = q.Difficulty || q.difficulty || 'N/A';
    const correct = (q.Correct || q.correct || '').toString().trim().toUpperCase();
    const sectionHeader = section !== currentSection ? `
      <tr>
        <td colspan="7" style="padding: 12px 16px; background: #eef2ff; color: #1d4ed8; font-weight: 700; border: 1px solid #e5e7eb;">Section: ${section}</td>
      </tr>` : '';
    currentSection = section;
    return `${sectionHeader}
      <tr style="background: #ffffff;">
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">${index + 1}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">${difficulty}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">${q.Question || q.question || ''}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">A. ${q.A || q.a || ''}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">B. ${q.B || q.b || ''}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">C. ${q.C || q.c || ''}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb;">D. ${q.D || q.d || ''}</td>
        <td style="padding: 12px 16px; border: 1px solid #e5e7eb; text-align:center;">${correct}</td>
      </tr>`;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111; max-width: 900px; margin: 0 auto;">
      <div style="background: #1d4ed8; color: #fff; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin:0; font-size: 24px;">Answer Key</h1>
        <p style="margin: 8px 0 0; font-size: 16px; opacity: 0.85;">${testName}${testDate ? ` | ${testDate}` : ''}</p>
      </div>
      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">Below is the answer key for the completed exam, including section separation, difficulty, and all options.</p>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="background:#e2e8f0;">
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">#</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">Difficulty</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">Question</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">Option A</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">Option B</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">Option C</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:left;">Option D</th>
              <th style="padding: 12px 16px; border: 1px solid #cbd5e1; text-align:center;">Correct</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top: 24px; color: #64748b; font-size: 13px;">This email contains the published answer key for your records.</p>
      </div>
    </div>`;
}

function createAnswerKeyPdf(testName, testDate, questions) {
  const htmlBody = buildAnswerKeyEmailHtml(testName, testDate, questions);
  const sanitizedName = testName.replace(/[^a-zA-Z0-9-_ ]/g, '_').trim();
  const blob = HtmlService.createHtmlOutput(`
    <html><head><meta charset="UTF-8"></head><body>${htmlBody}</body></html>
  `).getBlob().setName(`${sanitizedName}-AnswerKey.html`);
  return blob.getAs('application/pdf').setName(`${sanitizedName}-AnswerKey.pdf`);
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
        <p>Dear <strong>${res.name || res.Name || res.FullName || res.userID}</strong>,</p>
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