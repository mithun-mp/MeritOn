
const nodemailer = require('nodemailer');

const isDev = process.env.NODE_ENV !== 'production';

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
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,  // 10 seconds
    socketTimeout: 15000     // 15 seconds
  });

  // Verify SMTP connection on startup with timeout
  const verifyTimeout = setTimeout(() => {
    console.log('[SMTP] Connection verification timed out after 10 seconds. SMTP may be unavailable.');
  }, 10000);

  transporter.verify()
    .then(() => {
      clearTimeout(verifyTimeout);
      console.log('[SMTP] Connected successfully');
    })
    .catch(err => {
      clearTimeout(verifyTimeout);
      console.error('[SMTP] Connection failed:', err.message);
    });
}

async function sendEmail({ to, subject, html, text }) {
  if (!smtpConfigured) {
    if (isDev) {
      console.log(`[DEV MODE] Email would be sent to ${to}:`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${text || html}`);
      return { success: true, devMode: true };
    }
    return { success: false, error: 'Email service not configured' };
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
    console.error(`Failed to send email to ${to}:`, err);
    return { success: false, error: err.message };
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
  validateSmtpEnv
};
