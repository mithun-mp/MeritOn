
require('dotenv').config();
const { sendEmail, validateSmtpEnv } = require('../src/services/emailService');

const TEST_EMAIL = 'test@example.com'; // Replace with your test email

async function testAll() {
  console.log('========================================');
  console.log('MERITON EMAIL OTP TEST SUITE');
  console.log('========================================\n');

  // Test 1: SMTP Configuration
  console.log('Test 1: SMTP Configuration Check');
  if (!validateSmtpEnv()) {
    console.log('❌ FAIL: SMTP environment variables not configured correctly');
    console.log('Required variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM');
    return;
  }
  console.log('✅ PASS: SMTP configuration valid\n');

  // Test 2: Registration OTP Email
  console.log('Test 2: Registration OTP Email');
  const regResult = await sendEmail({
    to: TEST_EMAIL,
    subject: 'MeritOn Verification Code',
    text: 'Your MeritOn verification code is: 123456\nThis code will expire in 10 minutes.',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1a237e, #0d47a1); color: #ffffff; padding: 30px; text-align: center;">
          <h1 style="margin:0; font-size:28px;">MeritOn</h1>
          <p style="margin: 10px 0 0; opacity:0.9;">Secure Online Assessments</p>
        </div>
        <div style="padding: 30px; line-height:1.7;">
          <p style="font-size:18px;">Dear User,</p>
          <p>Your verification code for MeritOn registration is:</p>
          <div style="background:#f0f4ff; border:2px dashed #1a237e; border-radius:8px; padding:25px; margin:25px 0; text-align:center;">
            <span style="font-size:42px; font-weight:bold; color:#1a237e; letter-spacing:8px;">123456</span>
          </div>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p style="background:#fff3cd; border-left:4px solid #ffc107; padding:15px; margin:20px 0;">
            <strong>⚠️ Security Warning:</strong> Do not share this OTP with anyone.
          </p>
        </div>
        <div style="background:#f8f9fa; padding:20px; text-align:center; font-size:14px; color:#666;">
          <p>Regards,<br><strong>MeritOn Team</strong></p>
        </div>
      </div>
    `
  });
  console.log(regResult.success ? '✅ PASS: Registration OTP email sent' : `❌ FAIL: ${regResult.error}`);
  console.log('');

  // Test 3: Password Reset OTP Email
  console.log('Test 3: Password Reset OTP Email');
  const resetResult = await sendEmail({
    to: TEST_EMAIL,
    subject: 'MeritOn Password Reset Code',
    text: 'Your MeritOn password reset code is: 654321\nThis code will expire in 10 minutes.',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #d32f2f, #c62828); color: #ffffff; padding: 30px; text-align: center;">
          <h1 style="margin:0; font-size:28px;">MeritOn</h1>
          <p style="margin: 10px 0 0; opacity:0.9;">Password Reset</p>
        </div>
        <div style="padding: 30px; line-height:1.7;">
          <p style="font-size:18px;">Dear User,</p>
          <p>Your password reset code for MeritOn is:</p>
          <div style="background:#fff3f3; border:2px dashed #c62828; border-radius:8px; padding:25px; margin:25px 0; text-align:center;">
            <span style="font-size:42px; font-weight:bold; color:#c62828; letter-spacing:8px;">654321</span>
          </div>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p style="background:#fff3cd; border-left:4px solid #ffc107; padding:15px; margin:20px 0;">
            <strong>⚠️ Security Warning:</strong> Do not share this OTP with anyone.
          </p>
        </div>
        <div style="background:#f8f9fa; padding:20px; text-align:center; font-size:14px; color:#666;">
          <p>Regards,<br><strong>MeritOn Team</strong></p>
        </div>
      </div>
    `
  });
  console.log(resetResult.success ? '✅ PASS: Password reset OTP email sent' : `❌ FAIL: ${resetResult.error}`);
  console.log('');

  console.log('========================================');
  console.log('TEST SUITE COMPLETED');
  console.log('========================================');
}

testAll();
