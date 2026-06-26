
const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4-first DNS resolution to prevent ENETUNREACH on IPv6
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Custom IPv4 lookup function for Nodemailer
function ipv4Lookup(hostname, options, callback) {
  return dns.lookup(hostname, { family: 4 }, callback);
}

const isDev = process.env.NODE_ENV !== 'production';

// Maintenance mode helper - temporarily disable mail sending
function isMailMaintenanceMode() {
  return true;
}

// Validate SMTP environment variables
const validateSmtpEnv = () => {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('[SMTP] Missing environment variables:', missing.join(', '));
    return false;
  }
  return true;
};

let transporter;
let smtpConfigured = validateSmtpEnv();

if (smtpConfigured) {
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  
  // Log startup config proof
  console.log('[SMTP] Config', {
    configured: validateSmtpEnv(),
    hostPresent: !!process.env.SMTP_HOST,
    port: smtpPort,
    userPresent: !!process.env.SMTP_USER,
    passPresent: !!process.env.SMTP_PASS,
    fromPresent: !!process.env.SMTP_FROM,
    secure: smtpPort === 465,
    requireTLS: smtpPort === 587,
    ipv4Forced: true,
    customLookup: true,
    verifyTimeoutMs: 25000
  });
  
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    family: 4,
    lookup: ipv4Lookup,
    requireTLS: smtpPort === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      servername: process.env.SMTP_HOST || 'smtp.gmail.com'
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000
  });

  // Verify SMTP connection on startup with timeout
  const verifyTimeout = setTimeout(() => {
    console.log('[SMTP] Connection verification timed out after 25 seconds. SMTP may be unavailable.');
  }, 25000);

  transporter.verify()
    .then(() => {
      clearTimeout(verifyTimeout);
      console.log('[SMTP] Connected successfully (IPv4 forced, custom lookup)');
    })
    .catch(err => {
      clearTimeout(verifyTimeout);
      const classified = classifyEmailError(err);
      console.error('[SMTP] Verification failed', {
        smtpHost: process.env.SMTP_HOST,
        smtpPort,
        ipv4Forced: true,
        customLookup: true,
        debugType: classified.type,
        code: classified.code,
        command: classified.command,
        adminMessage: classified.adminMessage
      });
    });
}

function classifyEmailError(error) {
  const raw = String(error && (error.message || error.toString()) || '');
  const code = error && error.code ? String(error.code) : '';
  const command = error && error.command ? String(error.command) : '';

  let type = 'EMAIL_UNKNOWN_ERROR';
  let adminMessage = 'Email failed due to an unknown SMTP error.';
  let userMessage = 'Could not send email right now. Please try again or contact the exam administrator.';

  if (code === 'ENETUNREACH' || raw.includes('ENETUNREACH')) {
    type = 'SMTP_NETWORK_IPV6_UNREACHABLE';
    adminMessage = 'SMTP connection failed: IPv6 network unreachable. Force IPv4 for SMTP or check server network access.';
  } else if (code === 'ECONNREFUSED' || raw.includes('ECONNREFUSED')) {
    type = 'SMTP_CONNECTION_REFUSED';
    adminMessage = 'SMTP connection refused. Check SMTP host, port, firewall, or provider restrictions.';
  } else if (code === 'ETIMEDOUT' || raw.includes('ETIMEDOUT')) {
    type = 'SMTP_CONNECTION_TIMEOUT';
    adminMessage = 'SMTP connection timed out. Check network access to SMTP host and port.';
  } else if (code === 'ECONNRESET' || raw.includes('ECONNRESET')) {
    type = 'SMTP_CONNECTION_RESET';
    adminMessage = 'SMTP connection reset. Check TLS settings and SMTP provider restrictions.';
  } else if (code === 'EAUTH' || raw.includes('535') || raw.toLowerCase().includes('authentication failed') || raw.toLowerCase().includes('invalid login') || raw.toLowerCase().includes('username and password not accepted')) {
    type = 'SMTP_AUTH_FAILED';
    adminMessage = 'SMTP authentication failed. Check SMTP_USER and SMTP_PASS. For Gmail, use an app password, not the normal Gmail password.';
  } else if (raw.toLowerCase().includes('self signed') || raw.toLowerCase().includes('certificate')) {
    type = 'SMTP_TLS_CERTIFICATE_ERROR';
    adminMessage = 'SMTP TLS/certificate error. Check SMTP provider TLS configuration.';
  } else if (raw.toLowerCase().includes('not configured') || raw.toLowerCase().includes('missing')) {
    type = 'SMTP_NOT_CONFIGURED';
    adminMessage = 'Email service is not configured. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.';
  }

  return {
    type,
    code,
    command,
    userMessage,
    adminMessage,
    rawMessage: raw
  };
}

function getEmailConfigStatus() {
  const port = Number(process.env.SMTP_PORT || 587);

  return {
    configured: validateSmtpEnv(),
    hostPresent: !!process.env.SMTP_HOST,
    portPresent: !!process.env.SMTP_PORT,
    userPresent: !!process.env.SMTP_USER,
    passPresent: !!process.env.SMTP_PASS,
    fromPresent: !!process.env.SMTP_FROM,
    host: process.env.SMTP_HOST || null,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    ipv4Forced: true,
    nodeEnv: process.env.NODE_ENV || 'development'
  };
}

// Maintenance mode helper - temporarily disable mail sending
function isMailMaintenanceMode() {
  return true;
}

async function sendEmail({ to, subject, html, text }) {
  if (isMailMaintenanceMode()) {
    return {
      success: true,
      skipped: true,
      mailStatus: "upcoming_update",
      message: "Email delivery is part of an upcoming update."
    };
  }
  if (!smtpConfigured) {
    if (isDev) {
      console.log(`[DEV MODE] Email would be sent to ${to}:`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${text || html}`);
      return { success: true, devMode: true };
    }
    return {
      success: false,
      error: 'Could not send email right now. Please contact the exam administrator.',
      debugType: 'SMTP_NOT_CONFIGURED',
      adminError: 'Email service is not configured. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.'
    };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
      text
    });
    return { success: true };
  } catch (err) {
    const classified = classifyEmailError(err);
    console.error(`[SMTP ERROR] debugType: ${classified.type}, code: ${classified.code}, command: ${classified.command}`);
    console.error(`[SMTP ERROR] smtpHost: ${process.env.SMTP_HOST}, smtpPort: ${process.env.SMTP_PORT}, ipv4Forced: true`);
    console.error(`[SMTP ERROR] adminMessage: ${classified.adminMessage}`);
    return {
      success: false,
      error: classified.userMessage,
      debugType: classified.type,
      adminError: classified.adminMessage,
      code: classified.code,
      command: classified.command
    };
  }
}

function sendResultEmail(res, rank, testName) {
  const isPass = (res.NetScore / res.TotalQuestions) >= 0.4;
  const sections = res.SectionAnalyticsJSON || {};
  
  let sectionHtml = '<table style="width:100%; border-collapse: collapse; margin-top: 15px;">' +
    '<tr style="background-color: #f2f2f2;">' +
    '<th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Section</th>' +
    '<th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Score</th>' +
    '<th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Accuracy</th>' +
    '</tr>';
  
  for (const s in sections) {
    const acc = sections[s].correct + sections[s].wrong > 0 
      ? ((sections[s].correct / (sections[s].correct + sections[s].wrong)) * 100).toFixed(1) 
      : '0.0';
    sectionHtml += `<tr>
      <td style="border: 1px solid #ddd; padding: 10px;">${s}</td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${sections[s].score}</td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${acc}%</td>
    </tr>`;
  }
  sectionHtml += '</table>';

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1a237e; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Assessment Report</h1>
        <p style="margin: 10px 0 0; opacity: 0.8;">${testName}</p>
      </div>
      
      <div style="padding: 30px; line-height: 1.6;">
        <p>Dear <strong>${res.name}</strong>,</p>
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

  return sendEmail({
    to: res.Email,
    subject: `CBT Result: ${testName}`,
    html: htmlBody,
    text: `Dear ${res.name},\nYour performance report is ready. You scored a net of ${res.NetScore} marks.\nRank: #${rank} | Percentile: ${res.Percentile}%`
  });
}

function sendExamNotificationEmail(user, test, details) {
  const testName = test.Name || test.meta?.name || 'Exam';
  const dateValue = test.Date || test.meta?.date;
  const dateStr = dateValue
    ? new Date(dateValue).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const startTime = test.StartTime || test.meta?.startTime || '';
  const expiryTime = test.ExpiryTime || test.EndTime || test.meta?.expiryTime || '';
  const duration = test.Duration || test.meta?.duration;
  const college = test.College || test.college || '';
  const department = test.Department || test.department || '';
  const year = test.Year || test.year || '';
  const candidateName = user.FullName || 'Candidate';
  const extraDetails = details ? `<p style="margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 6px;">${details}</p>` : '';

  const infoRows = [
    dateStr ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">Date</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${dateStr}</td></tr>` : '',
    startTime ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">Start Time</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${startTime}</td></tr>` : '',
    expiryTime ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">End Time</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${expiryTime}</td></tr>` : '',
    duration ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">Duration</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${duration} minutes</td></tr>` : '',
    college ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">College</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${college}</td></tr>` : '',
    department ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">Department</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${department}</td></tr>` : '',
    year ? `<tr><td style="padding:8px 12px; border:1px solid #e5e7eb; font-weight:600;">Year</td><td style="padding:8px 12px; border:1px solid #e5e7eb;">${year}</td></tr>` : ''
  ].filter(Boolean).join('');

  const subject = `MeritOn Exam Notification: ${testName}`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1a237e; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Exam Notification</h1>
        <p style="margin: 10px 0 0; opacity: 0.8;">${testName}</p>
      </div>
      <div style="padding: 30px; line-height: 1.6;">
        <p>Dear <strong>${candidateName}</strong>,</p>
        <p>You have a scheduled examination on MeritOn. Please review the details below and log in to the <strong>MeritOn Test Lobby</strong> at the scheduled time.</p>
        ${extraDetails}
        ${infoRows ? `<table style="width:100%; border-collapse: collapse; margin: 20px 0;">${infoRows}</table>` : ''}
        <p style="margin-top: 24px;">Please sign in to MeritOn and open the Test Lobby to begin your exam when it becomes available.</p>
      </div>
      <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
        <p style="margin: 0;">MeritOn Aptitude Platform &mdash; Secure Online Examinations</p>
        <p style="margin: 8px 0 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  const textLines = [
    `Dear ${candidateName},`,
    '',
    `You have a scheduled examination: ${testName}`,
    dateStr ? `Date: ${dateStr}` : '',
    startTime ? `Start Time: ${startTime}` : '',
    expiryTime ? `End Time: ${expiryTime}` : '',
    duration ? `Duration: ${duration} minutes` : '',
    college ? `College: ${college}` : '',
    department ? `Department: ${department}` : '',
    year ? `Year: ${year}` : '',
    details ? `\nAdditional details: ${details}` : '',
    '',
    'Please log in to MeritOn and open the Test Lobby to begin your exam.',
    '',
    'MeritOn Aptitude Platform'
  ].filter(Boolean).join('\n');

  return sendEmail({
    to: user.Email,
    subject,
    html,
    text: textLines
  });
}

module.exports = {
  sendEmail,
  sendResultEmail,
  sendExamNotificationEmail,
  validateSmtpEnv,
  classifyEmailError,
  getEmailConfigStatus
};
