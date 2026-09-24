require('dotenv').config();
const {
  sendEmail,
  sendVerifiedEmail,
  syncVerifiedUser,
  sendGroupMail,
  getEmailConfigStatus
} = require('../src/services/emailService');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_UNIV_ID = process.env.TEST_UNIV_ID || 'TEST001';

async function testAll() {
  console.log('========================================');
  console.log('MERITON GOOGLE APPS SCRIPT MAIL TEST SUITE');
  console.log('========================================\n');

  // Test 1: Configuration Check
  console.log('Test 1: Mail Service Configuration Check');
  const status = getEmailConfigStatus();
  console.log('Provider:', status.provider);
  console.log('URL Configured:', status.urlConfigured);
  console.log('Secret Configured:', status.configured);

  if (!status.configured) {
    console.log('⚠️ NOTE: GOOGLE_APPS_SCRIPT_SECRET is not configured in .env.');
    console.log('Set GOOGLE_APPS_SCRIPT_SECRET in your environment before running live tests.\n');
  } else {
    console.log('✅ PASS: Mail configuration detected\n');
  }

  // Test 2: Unverified OTP Email Dispatch (Registration)
  console.log('Test 2: Unverified Registration OTP Email');
  const regResult = await sendEmail({
    to: TEST_EMAIL,
    subject: 'MeritOn Verification Code (Test)',
    text: 'Your MeritOn verification code is: 123456\nThis code will expire in 10 minutes.',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background: #1a237e; color: #ffffff; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">MeritOn Assessments</h2>
        </div>
        <div style="padding: 20px;">
          <p>Your test verification code is: <strong>123456</strong></p>
        </div>
      </div>
    `
  });
  console.log('Result:', regResult);
  console.log(regResult.success ? '✅ PASS: Registration OTP email dispatched' : `❌ FAIL: ${regResult.error}\n`);

  // Test 3: Verified User Directory Synchronization
  console.log('Test 3: Sync Verified User to Google Sheet1');
  const syncResult = await syncVerifiedUser({
    email: TEST_EMAIL,
    name: 'Test Student',
    univId: TEST_UNIV_ID,
    department: 'CSE',
    batchYear: '2026-2028',
    college: 'Government Engineering College'
  });
  console.log('Result:', syncResult);
  console.log(syncResult.success ? `✅ PASS: Verified user synchronized (${syncResult.action})` : `❌ FAIL: ${syncResult.error}\n`);

  // Test 4: Group Mail Filter Dispatch
  console.log('Test 4: Group Mail Delivery Filter Test (CSE)');
  const groupResult = await sendGroupMail({
    filter: { department: 'CSE' },
    subject: 'MeritOn CSE Notification (Test)',
    text: 'This is a test notification for all CSE verified candidates.',
    html: '<p>This is a test notification for all <strong>CSE</strong> verified candidates.</p>'
  });
  console.log('Result:', groupResult);
  console.log(groupResult.success ? `✅ PASS: Group mail dispatched (Matched: ${groupResult.matched}, Sent: ${groupResult.sent})` : `❌ FAIL: ${groupResult.error}\n`);

  console.log('========================================');
  console.log('TEST SUITE COMPLETED');
  console.log('========================================');
}

testAll().catch(err => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
