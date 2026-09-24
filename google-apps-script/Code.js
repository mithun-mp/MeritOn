/**
 * ============================================================================
 * MeritOn — Google Apps Script Mail Delivery & Recipient Directory Service
 * ============================================================================
 * 
 * SPREADSHEET CONFIGURATION:
 * Spreadsheet ID: 1Tqx8Tkct2RTuXIleYaNmeG1y_DvfQdShE6h278ZFRRo
 * Sheet Name: Sheet1
 * Columns: Email | Name | UnivId | Department | BatchYear | College
 * 
 * SCRIPT PROPERTIES REQUIRED:
 * - MERITON_SECRET: Shared secret between MeritOn Backend and Apps Script
 * - SPREADSHEET_ID: 1Tqx8Tkct2RTuXIleYaNmeG1y_DvfQdShE6h278ZFRRo (Optional, defaults to this ID)
 * - SHEET_NAME: Sheet1 (Optional, defaults to Sheet1)
 * 
 * WEB APP DEPLOYMENT:
 * - Execute as: Me (<your-google-account>)
 * - Who has access: Anyone
 * ============================================================================
 */

// Default configuration constants
var DEFAULT_SPREADSHEET_ID = '1Tqx8Tkct2RTuXIleYaNmeG1y_DvfQdShE6h278ZFRRo';
var DEFAULT_SHEET_NAME = 'Sheet1';
var SENDER_NAME = 'MeritOn Assessments';

/**
 * HTTP GET Handler — Status and Health Check
 */
function doGet(e) {
  return createJsonResponse({
    success: true,
    service: 'MeritOn Mail Delivery Service',
    status: 'online',
    timestamp: new Date().toISOString()
  });
}

/**
 * HTTP POST Handler — Primary API Endpoint
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        success: false,
        error: 'Empty request body received'
      });
    }

    var requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({
        success: false,
        error: 'Invalid JSON payload'
      });
    }

    // 1. Authenticate Request
    var authResult = authenticateRequest(requestData, e.postData.contents);
    if (!authResult.valid) {
      return createJsonResponse({
        success: false,
        error: authResult.error || 'Authentication failed'
      });
    }

    var action = requestData.action;

    // 2. Dispatch Action
    switch (action) {
      case 'healthCheck':
      case 'ping':
        return handleHealthCheck();

      case 'sendUnverifiedMail':
        return handleSendUnverifiedMail(requestData);

      case 'sendVerifiedMail':
        return handleSendVerifiedMail(requestData);

      case 'syncVerifiedUser':
        return handleSyncVerifiedUser(requestData);

      case 'sendGroupMail':
        return handleSendGroupMail(requestData);

      default:
        return createJsonResponse({
          success: false,
          error: 'Unknown action: ' + action
        });
    }

  } catch (err) {
    Logger.log('[doPost Error] ' + err.toString());
    return createJsonResponse({
      success: false,
      error: 'Execution error: ' + (err.message || err.toString())
    });
  }
}

/**
 * Authentication Validator (HMAC-SHA256 Signature + Shared Secret Fallback)
 */
function authenticateRequest(data, rawContents) {
  var properties = PropertiesService.getScriptProperties();
  var configuredSecret = properties.getProperty('MERITON_SECRET');

  if (!configuredSecret) {
    return {
      valid: false,
      error: 'MERITON_SECRET is not configured in Script Properties.'
    };
  }

  // 1. Direct Secret Match (Secondary Fallback)
  var providedSecret = data.secret || data.authKey;
  if (providedSecret && providedSecret === configuredSecret) {
    return { valid: true };
  }

  // 2. HMAC-SHA256 Signature Validation
  var signature = data.signature;
  var timestamp = data.timestamp;

  if (signature && timestamp) {
    var now = Date.now();
    var reqTime = Number(timestamp);

    // 10 minutes tolerance window
    if (Math.abs(now - reqTime) > 600000) {
      return { valid: false, error: 'Request expired: timestamp drift exceeds 10 minutes.' };
    }

    var action = data.action || '';
    var message = reqTime + ':' + action;
    var expectedSignature = computeHmacSha256(message, configuredSecret);

    if (signature.toLowerCase() === expectedSignature.toLowerCase()) {
      return { valid: true };
    }

    // Also verify if signature includes payload hash
    if (data.payload) {
      var fullMessage = reqTime + ':' + action + ':' + JSON.stringify(data.payload);
      var expectedFull = computeHmacSha256(fullMessage, configuredSecret);
      if (signature.toLowerCase() === expectedFull.toLowerCase()) {
        return { valid: true };
      }
    }

    return { valid: false, error: 'Cryptographic signature mismatch.' };
  }

  return { valid: false, error: 'Authentication failed: missing signature or valid secret.' };
}

/**
 * Compute HMAC-SHA256 hex string
 */
function computeHmacSha256(message, key) {
  var rawBytes = Utilities.computeHmacSha256Signature(message, key);
  return rawBytes.map(function(byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Health Check Action
 */
function handleHealthCheck() {
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    return createJsonResponse({
      success: true,
      service: 'MeritOn Mail Delivery Service',
      status: 'healthy',
      recipientCount: Math.max(0, lastRow - 1)
    });
  } catch (err) {
    return createJsonResponse({
      success: false,
      error: 'Sheet connection failed: ' + err.message
    });
  }
}

/**
 * Action: sendUnverifiedMail
 * Sends an email directly to an unverified recipient (e.g. registration OTP).
 * CRITICAL CONSTRAINT: Must NOT insert or modify Sheet1.
 */
function handleSendUnverifiedMail(data) {
  var email = data.email || data.to;
  var subject = data.subject;
  var html = data.html || data.body;
  var text = data.text;

  if (!email || !isValidEmail(email)) {
    return createJsonResponse({ success: false, error: 'Valid recipient email is required.' });
  }
  if (!subject) {
    return createJsonResponse({ success: false, error: 'Email subject is required.' });
  }
  if (!html && !text) {
    return createJsonResponse({ success: false, error: 'Email content (html or text) is required.' });
  }

  try {
    MailApp.sendEmail({
      to: email.trim(),
      subject: subject,
      htmlBody: html || '',
      body: text || stripHtml(html || ''),
      name: SENDER_NAME
    });

    return createJsonResponse({
      success: true,
      message: 'Unverified email sent successfully'
    });
  } catch (mailErr) {
    Logger.log('[sendUnverifiedMail Error] ' + mailErr.toString());
    return createJsonResponse({
      success: false,
      error: 'Google Mail delivery failed: ' + mailErr.message
    });
  }
}

/**
 * Action: sendVerifiedMail
 * Sends email to an individual verified user.
 * Looks up UnivId in Sheet1 to determine the verified email address.
 * If trusted email is supplied by backend, falls back to it if Sheet lookup fails.
 */
function handleSendVerifiedMail(data) {
  var univId = data.univId || data.UnivId || data.UnivID;
  var fallbackEmail = data.email || data.to;
  var subject = data.subject;
  var html = data.html || data.body;
  var text = data.text;

  if (!univId && !fallbackEmail) {
    return createJsonResponse({ success: false, error: 'UnivId or recipient email is required.' });
  }
  if (!subject) {
    return createJsonResponse({ success: false, error: 'Email subject is required.' });
  }
  if (!html && !text) {
    return createJsonResponse({ success: false, error: 'Email content is required.' });
  }

  var recipientEmail = '';

  // Look up in Sheet1 if UnivId provided
  if (univId) {
    try {
      var sheet = getSheet();
      var colMap = getColumnMapping(sheet);
      var values = sheet.getDataRange().getValues();
      var cleanUnivId = String(univId).trim().toUpperCase();

      for (var i = 1; i < values.length; i++) {
        var rowUnivId = String(values[i][colMap.univid - 1] || '').trim().toUpperCase();
        if (rowUnivId === cleanUnivId) {
          recipientEmail = String(values[i][colMap.email - 1] || '').trim().toLowerCase();
          break;
        }
      }
    } catch (sheetErr) {
      Logger.log('[sendVerifiedMail Sheet Read Warning] ' + sheetErr.toString());
    }
  }

  // Fallback to trusted backend-provided email if UnivId not found in Sheet
  if (!recipientEmail && fallbackEmail && isValidEmail(fallbackEmail)) {
    recipientEmail = fallbackEmail.trim().toLowerCase();
  }

  if (!recipientEmail || !isValidEmail(recipientEmail)) {
    return createJsonResponse({
      success: false,
      error: 'Verified recipient not found for UnivId: ' + (univId || 'N/A')
    });
  }

  try {
    MailApp.sendEmail({
      to: recipientEmail,
      subject: subject,
      htmlBody: html || '',
      body: text || stripHtml(html || ''),
      name: SENDER_NAME
    });

    return createJsonResponse({
      success: true,
      message: 'Verified email sent successfully',
      recipient: recipientEmail
    });
  } catch (mailErr) {
    return createJsonResponse({
      success: false,
      error: 'Google Mail delivery failed: ' + mailErr.message
    });
  }
}

/**
 * Action: syncVerifiedUser
 * Creates or updates verified recipient in Sheet1 using UnivId as primary identifier.
 */
function handleSyncVerifiedUser(data) {
  var univId = String(data.univId || data.UnivId || data.UnivID || '').trim().toUpperCase();
  var email = String(data.email || '').trim().toLowerCase();
  var name = String(data.name || data.fullName || data.FullName || '').trim();
  var department = String(data.department || data.Department || '').trim();
  var batchYear = String(data.batchYear || data.BatchYear || data.year || data.Year || '').trim();
  var college = String(data.college || data.College || '').trim();

  if (!univId) {
    return createJsonResponse({ success: false, error: 'UnivId is required for verified user sync.' });
  }
  if (!email || !isValidEmail(email)) {
    return createJsonResponse({ success: false, error: 'Valid email is required for verified user sync.' });
  }

  var sheet = getSheet();
  var colMap = getColumnMapping(sheet);
  var values = sheet.getDataRange().getValues();

  var existingRowIndex = -1;
  var emailConflictRow = -1;

  for (var i = 1; i < values.length; i++) {
    var rowUnivId = String(values[i][colMap.univid - 1] || '').trim().toUpperCase();
    var rowEmail = String(values[i][colMap.email - 1] || '').trim().toLowerCase();

    if (rowUnivId === univId) {
      existingRowIndex = i + 1; // 1-indexed sheet row
      break;
    }
    if (rowEmail === email && rowUnivId && rowUnivId !== univId) {
      emailConflictRow = i + 1;
    }
  }

  // Reject conflict if same email is claimed by a different UnivId
  if (existingRowIndex === -1 && emailConflictRow !== -1) {
    return createJsonResponse({
      success: false,
      error: 'Conflict: Email ' + email + ' is already registered under a different UnivId in row ' + emailConflictRow
    });
  }

  // UPDATE existing row
  if (existingRowIndex !== -1) {
    sheet.getRange(existingRowIndex, colMap.email).setValue(email);
    sheet.getRange(existingRowIndex, colMap.name).setValue(name);
    sheet.getRange(existingRowIndex, colMap.univid).setValue(univId);
    sheet.getRange(existingRowIndex, colMap.department).setValue(department);
    sheet.getRange(existingRowIndex, colMap.batchyear).setValue(batchYear);
    sheet.getRange(existingRowIndex, colMap.college).setValue(college);

    return createJsonResponse({
      success: true,
      action: 'updated',
      univId: univId,
      row: existingRowIndex
    });
  }

  // CREATE new row
  var maxCols = Math.max(colMap.email, colMap.name, colMap.univid, colMap.department, colMap.batchyear, colMap.college);
  var newRow = new Array(maxCols);
  for (var k = 0; k < maxCols; k++) newRow[k] = '';

  newRow[colMap.email - 1] = email;
  newRow[colMap.name - 1] = name;
  newRow[colMap.univid - 1] = univId;
  newRow[colMap.department - 1] = department;
  newRow[colMap.batchyear - 1] = batchYear;
  newRow[colMap.college - 1] = college;

  sheet.appendRow(newRow);

  return createJsonResponse({
    success: true,
    action: 'created',
    univId: univId,
    row: sheet.getLastRow()
  });
}

/**
 * Action: sendGroupMail
 * Reads Sheet1 once into memory, filters recipients by criteria, and dispatches email.
 * Filters supported:
 * - department
 * - batchYear
 * - college
 * - all: true (all verified users)
 */
function handleSendGroupMail(data) {
  var filter = data.filter || {};
  var subject = data.subject;
  var html = data.html || data.body;
  var text = data.text;

  if (!subject) {
    return createJsonResponse({ success: false, error: 'Email subject is required.' });
  }
  if (!html && !text) {
    return createJsonResponse({ success: false, error: 'Email content is required.' });
  }

  var isAll = filter.all === true || String(filter.all).toLowerCase() === 'true';
  var targetDept = filter.department ? String(filter.department).trim().toLowerCase() : '';
  var targetBatch = filter.batchYear || filter.year ? String(filter.batchYear || filter.year).trim().toLowerCase() : '';
  var targetCollege = filter.college ? String(filter.college).trim().toLowerCase() : '';

  // Treat 'all' as wildcard
  if (targetDept === 'all') targetDept = '';
  if (targetBatch === 'all') targetBatch = '';
  if (targetCollege === 'all') targetCollege = '';

  var sheet = getSheet();
  var colMap = getColumnMapping(sheet);
  var values = sheet.getDataRange().getValues();

  var recipientEmails = [];
  var seenEmails = {};

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var email = String(row[colMap.email - 1] || '').trim().toLowerCase();
    var dept = String(row[colMap.department - 1] || '').trim().toLowerCase();
    var batch = String(row[colMap.batchyear - 1] || '').trim().toLowerCase();
    var college = String(row[colMap.college - 1] || '').trim().toLowerCase();

    if (!email || !isValidEmail(email)) continue;
    if (seenEmails[email]) continue;

    var matches = true;

    if (!isAll) {
      if (targetDept && dept !== targetDept) matches = false;
      if (targetCollege && college !== targetCollege) matches = false;
      if (targetBatch) {
        // Support substring/exact matching (e.g. '2027' in '2025-2027')
        if (batch !== targetBatch && batch.indexOf(targetBatch) === -1) {
          matches = false;
        }
      }
    }

    if (matches) {
      seenEmails[email] = true;
      recipientEmails.push(email);
    }
  }

  var matchedCount = recipientEmails.length;
  if (matchedCount === 0) {
    return createJsonResponse({
      success: true,
      matched: 0,
      sent: 0,
      failed: 0,
      message: 'No recipients matched the specified criteria.'
    });
  }

  var sentCount = 0;
  var failedCount = 0;

  for (var j = 0; j < recipientEmails.length; j++) {
    try {
      MailApp.sendEmail({
        to: recipientEmails[j],
        subject: subject,
        htmlBody: html || '',
        body: text || stripHtml(html || ''),
        name: SENDER_NAME
      });
      sentCount++;
    } catch (sendErr) {
      Logger.log('[sendGroupMail Error for ' + recipientEmails[j] + '] ' + sendErr.toString());
      failedCount++;
    }
  }

  return createJsonResponse({
    success: true,
    matched: matchedCount,
    sent: sentCount,
    failed: failedCount
  });
}

/**
 * Helper: Retrieve Google Sheet instance
 */
function getSheet() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  var sheetName = properties.getProperty('SHEET_NAME') || DEFAULT_SHEET_NAME;

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }
  return sheet;
}

/**
 * Helper: Identify Column Indexes dynamically from Row 1
 */
function getColumnMapping(sheet) {
  var lastCol = sheet.getLastColumn();
  var map = { email: 1, name: 2, univid: 3, department: 4, batchyear: 5, college: 6 };
  if (lastCol === 0) return map;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (h === 'email') map.email = i + 1;
    else if (h === 'name' || h === 'fullname') map.name = i + 1;
    else if (h === 'univid' || h === 'regno' || h === 'rollno') map.univid = i + 1;
    else if (h === 'department' || h === 'dept') map.department = i + 1;
    else if (h === 'batchyear' || h === 'year' || h === 'batch') map.batchyear = i + 1;
    else if (h === 'college') map.college = i + 1;
  }
  return map;
}

/**
 * Helper: Email regex validation
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Helper: Strip HTML tags for plaintext body
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Helper: Return JSON Response
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
