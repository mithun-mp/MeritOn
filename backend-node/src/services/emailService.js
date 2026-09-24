/**
 * MeritOn Email Service
 * 
 * NOTE: Built-in SMTP transport is completely disabled.
 * The backend does not initialize Nodemailer, does not attempt SMTP network connections,
 * and does not require SMTP environment variables to run.
 * 
 * Application logic (OTP generation, storage, and validation) remains intact in controllers.
 * A future transport layer (e.g. Google Apps Script / Google Sheets / HTTP API) can be introduced here.
 */

// Informational log on server startup without exposing credentials or hosts
console.log('[SMTP] Built-in SMTP delivery disabled');

/**
 * Check if SMTP environment variables are present (always false while built-in SMTP is disabled)
 */
const validateSmtpEnv = () => {
  return false;
};

/**
 * Generic email dispatcher - safely returns controlled disabled response
 * without performing any network or SMTP socket connections.
 */
async function sendEmail({ to, subject, html, text } = {}) {
  return {
    success: false,
    disabled: true,
    message: 'Email delivery is currently disabled.'
  };
}

/**
 * Examination result email dispatcher - safely returns controlled disabled response
 */
async function sendResultEmail(...args) {
  return {
    success: false,
    disabled: true,
    message: 'Email delivery is currently disabled.'
  };
}

/**
 * Examination notification email dispatcher - safely returns controlled disabled response
 */
async function sendExamNotificationEmail(user, test, details = '') {
  return {
    success: false,
    disabled: true,
    message: 'Email delivery is currently disabled.'
  };
}

/**
 * Email error classifier for controller compatibility
 */
function classifyEmailError(error) {
  return {
    type: 'EMAIL_DELIVERY_DISABLED',
    code: 'EDISABLED',
    command: 'NONE',
    userMessage: 'Email delivery is currently disabled.',
    adminMessage: 'Built-in SMTP email delivery is disabled on this backend.',
    rawMessage: error ? (error.message || String(error)) : 'Email delivery is currently disabled.'
  };
}

/**
 * Returns configuration status without leaking credentials
 */
function getEmailConfigStatus() {
  return {
    configured: false,
    disabled: true,
    provider: 'disabled',
    message: 'Built-in SMTP delivery is disabled.'
  };
}

module.exports = {
  sendEmail,
  sendResultEmail,
  sendExamNotificationEmail,
  validateSmtpEnv,
  classifyEmailError,
  getEmailConfigStatus
};
