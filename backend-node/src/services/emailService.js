/**
 * MeritOn Email Service — Google Apps Script Transport Layer
 * 
 * Replaces built-in SMTP delivery with authenticated Google Apps Script Web App calls.
 * 
 * Architecture:
 * MeritOn Backend (Generates OTP/Subject/Body)
 *    ↓ Authenticated HTTPS POST with HMAC-SHA256 signature
 * Google Apps Script Web App
 *    ↓
 * Google Mail Service (MailApp) & Recipient Directory (Google Sheets Sheet1)
 */

const crypto = require('crypto');

// Configuration
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxve7y4bVlBg0wPblLzGn7ZxoBTcY-MB2zOZGg_5IQsqilnzZI5nqr8G9LRgVsJfskTEA/exec';
const SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;
const SCRIPT_SECRET = process.env.GOOGLE_APPS_SCRIPT_SECRET || process.env.MERITON_APPS_SCRIPT_SECRET || '';
const REQUEST_TIMEOUT_MS = parseInt(process.env.MAIL_REQUEST_TIMEOUT_MS || '15000', 10);

// Log configuration status safely at startup without leaking credentials
const isConfigured = Boolean(SCRIPT_SECRET);
console.log(`[MAIL] Google Apps Script delivery enabled. Configured: ${isConfigured ? 'yes' : 'no (pending GOOGLE_APPS_SCRIPT_SECRET)'}`);

/**
 * Generate HMAC-SHA256 signature for authenticating with Google Apps Script
 */
function generateAuth(action, payload = {}) {
  const timestamp = Date.now();
  if (!SCRIPT_SECRET) {
    return { timestamp, signature: '', secret: '' };
  }

  const message = `${timestamp}:${action}`;
  const signature = crypto.createHmac('sha256', SCRIPT_SECRET).update(message).digest('hex');

  return {
    timestamp,
    signature,
    secret: SCRIPT_SECRET // Transmit as fallback
  };
}

/**
 * Low-level HTTP POST dispatcher to Google Apps Script Web App
 */
async function callAppsScript(action, payload = {}) {
  if (!SCRIPT_URL) {
    return { success: false, error: 'Google Apps Script URL is not configured' };
  }

  const auth = generateAuth(action, payload);
  const requestBody = {
    action,
    timestamp: auth.timestamp,
    signature: auth.signature,
    secret: auth.secret,
    ...payload
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const statusText = response.statusText || `HTTP ${response.status}`;
      return { success: false, error: `Apps Script request failed: ${statusText}` };
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error('[MAIL] Failed to parse Apps Script response JSON:', text.substring(0, 300));
      return { success: false, error: 'Invalid JSON response from Google Apps Script' };
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`[MAIL] Apps Script request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      return { success: false, error: 'Mail delivery request timed out' };
    }
    console.error('[MAIL] Apps Script request error:', err.message);
    return { success: false, error: err.message || 'Failed to communicate with mail service' };
  }
}

/**
 * Generic email dispatcher (primarily for Unverified Recipients e.g. registration OTP)
 * CRITICAL RULE: Does not store recipient in Sheet1.
 */
async function sendEmail({ to, subject, html, text } = {}) {
  const email = to || '';
  if (!email) {
    return { success: false, error: 'Recipient email address is required' };
  }
  if (!subject) {
    return { success: false, error: 'Subject is required' };
  }

  return await callAppsScript('sendUnverifiedMail', {
    email,
    subject,
    html: html || '',
    text: text || ''
  });
}

/**
 * Verified individual email dispatcher
 * Targets a verified user using their UnivId (looks up verified email from Sheet1).
 */
async function sendVerifiedEmail({ univId, email, subject, html, text } = {}) {
  if (!univId && !email) {
    return { success: false, error: 'UnivId or recipient email is required' };
  }

  return await callAppsScript('sendVerifiedMail', {
    univId,
    email,
    subject,
    html: html || '',
    text: text || ''
  });
}

/**
 * Verified User Directory Synchronization
 * Creates or updates verified recipient entry in Sheet1 after successful registration.
 * Non-blocking: callers should catch errors so account creation is never blocked.
 */
async function syncVerifiedUser({ email, name, univId, department, batchYear, college } = {}) {
  if (!univId || !email) {
    return { success: false, error: 'UnivId and Email are required for directory synchronization' };
  }

  return await callAppsScript('syncVerifiedUser', {
    email,
    name: name || '',
    univId,
    department: department || '',
    batchYear: batchYear || '',
    college: college || ''
  });
}

/**
 * Group Mail Dispatcher
 * Sends a single request to Apps Script, which queries Sheet1 once in memory and dispatches mail.
 * 
 * @param {Object} options
 * @param {Object} options.filter Filter options: { department, batchYear, college, all }
 * @param {string} options.subject Email subject
 * @param {string} options.html HTML email body
 * @param {string} options.text Optional plaintext email body
 */
async function sendGroupMail({ filter = {}, subject, html, text } = {}) {
  if (!subject) {
    return { success: false, error: 'Subject is required' };
  }
  if (!html && !text) {
    return { success: false, error: 'Email content is required' };
  }

  return await callAppsScript('sendGroupMail', {
    filter,
    subject,
    html: html || '',
    text: text || ''
  });
}

/**
 * Examination result email dispatcher
 * Formats structured assessment performance and dispatches email.
 */
async function sendResultEmail(email, name, TestId, score, Rank, Percentile) {
  const candidateName = name || 'Candidate';
  const testIdentifier = TestId || 'Examination';
  const netScore = score !== undefined && score !== null ? score : 'N/A';
  const rankDisplay = Rank ? `#${Rank}` : 'Available on portal';
  const percentileDisplay = Percentile !== undefined && Percentile !== null ? `${Percentile}%` : 'N/A';

  const subject = `MeritOn Assessment Result — ${testIdentifier}`;
  const html = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #ffffff; padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">MeritOn</h1>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Official Assessment Performance Report</p>
      </div>
      <div style="padding: 32px 24px;">
        <p style="font-size: 17px; margin-top: 0;">Dear <strong>${candidateName}</strong>,</p>
        <p style="color: #475569; line-height: 1.6;">Your results for <strong>${testIdentifier}</strong> have been published. Here is a summary of your performance:</p>
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Total Score:</td>
              <td style="padding: 10px 0; text-align: right; font-size: 20px; font-weight: bold; color: #1e3a8a;">${netScore}</td>
            </tr>
            <tr style="border-top: 1px solid #edf2f7;">
              <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Overall Rank:</td>
              <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: 600; color: #0284c7;">${rankDisplay}</td>
            </tr>
            <tr style="border-top: 1px solid #edf2f7;">
              <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Score Percentile:</td>
              <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: 600; color: #10b981;">${percentileDisplay}</td>
            </tr>
          </table>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6;">You can log in to MeritOn to view detailed question-level responses, answer keys, and section analysis.</p>
        
        <div style="text-align: center; margin: 30px 0 10px;">
          <a href="https://meriton.onrender.com/result.html?testId=${encodeURIComponent(testIdentifier)}" style="background: #1e3a8a; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View Full Performance Analytics</a>
        </div>
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 13px; color: #94a3b8;">
        <p style="margin: 0;">MeritOn Automated Examination Platform</p>
      </div>
    </div>
  `;

  const text = `Dear ${candidateName},\n\nYour results for ${testIdentifier} have been published.\nTotal Score: ${netScore}\nRank: ${rankDisplay}\nPercentile: ${percentileDisplay}\n\nLog in to MeritOn to view your full analysis.\n\nRegards,\nMeritOn Team`;

  return await sendEmail({ to: email, subject, html, text });
}

/**
 * Examination notification email dispatcher
 */
async function sendExamNotificationEmail(user, test, details = '') {
  const recipientEmail = user.Email || user.email;
  const candidateName = user.FullName || user.name || 'Candidate';
  const testName = test.Name || test.name || 'Assessment';
  const testDate = test.Date || test.date || 'Scheduled';
  const duration = test.Duration || test.duration || '60';

  const subject = `MeritOn Examination Notice — ${testName}`;
  const html = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e3a8a, #0284c7); color: #ffffff; padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">MeritOn</h1>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Upcoming Examination Schedule</p>
      </div>
      <div style="padding: 32px 24px;">
        <p style="font-size: 17px; margin-top: 0;">Dear <strong>${candidateName}</strong>,</p>
        <p style="color: #475569; line-height: 1.6;">You have an upcoming examination scheduled on the MeritOn platform:</p>
        
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px; color: #0369a1; font-size: 18px;">${testName}</h3>
          <p style="margin: 4px 0; color: #334155; font-size: 14px;"><strong>Date:</strong> ${testDate}</p>
          <p style="margin: 4px 0; color: #334155; font-size: 14px;"><strong>Duration:</strong> ${duration} Minutes</p>
          ${details ? `<p style="margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed #7dd3fc; color: #0c4a6e; font-size: 13.5px;"><strong>Note from Administrator:</strong><br>${details}</p>` : ''}
        </div>

        <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 13.5px; color: #92400e;"><strong>Exam Instructions:</strong> Ensure a stable internet connection. Full-screen monitoring and tab-switch policies will be enforced during the assessment.</p>
        </div>

        <div style="text-align: center; margin: 30px 0 10px;">
          <a href="https://meriton.onrender.com/test-lobby.html?testId=${encodeURIComponent(test.TestID || test.testId || '')}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Go to Exam Lobby</a>
        </div>
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 13px; color: #94a3b8;">
        <p style="margin: 0;">MeritOn Automated Examination Platform</p>
      </div>
    </div>
  `;

  const text = `Dear ${candidateName},\n\nYou have an upcoming examination on MeritOn: ${testName}\nDate: ${testDate}\nDuration: ${duration} minutes\n${details ? `Note: ${details}\n` : ''}\nLog in to MeritOn to participate.\n\nRegards,\nMeritOn Team`;

  return await sendEmail({ to: recipientEmail, subject, html, text });
}

/**
 * Returns configuration status without leaking credentials
 */
function getEmailConfigStatus() {
  return {
    configured: Boolean(SCRIPT_SECRET),
    provider: 'google_apps_script',
    urlConfigured: Boolean(SCRIPT_URL)
  };
}

/**
 * Email error classifier for controller compatibility
 */
function classifyEmailError(error) {
  return {
    type: 'GOOGLE_APPS_SCRIPT_ERROR',
    code: 'EAPPSSCRIPT',
    command: 'APPS_SCRIPT_DISPATCH',
    userMessage: 'Unable to send email at this moment. Please try again shortly.',
    adminMessage: error ? (error.message || String(error)) : 'Apps Script delivery failed',
    rawMessage: error ? (error.message || String(error)) : 'Apps Script delivery failed'
  };
}

/**
 * Legacy compatibility stub
 */
const validateSmtpEnv = () => {
  return Boolean(SCRIPT_SECRET);
};

module.exports = {
  sendEmail,
  sendVerifiedEmail,
  syncVerifiedUser,
  sendGroupMail,
  sendResultEmail,
  sendExamNotificationEmail,
  validateSmtpEnv,
  classifyEmailError,
  getEmailConfigStatus
};
