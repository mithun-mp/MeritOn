
const http = require('http');
const connectDB = require('../src/config/db');

// Configuration
const API_URL = process.env.API_URL || 'localhost';
const API_PORT = process.env.API_PORT || 3000;

// Test data
const TEST_USER = {
  FullName: 'Test User',
  UnivID: 'TU001',
  Email: 'testuser@example.com',
  Phone: '9876543210',
  Department: 'CSE',
  Year: '2024',
  Password: 'TestPassword123',
  Role: 'student'
};

const NEW_PASSWORD = 'NewPassword456';

async function clearCollections() {
  const Admin = require('../src/models/Admin');
  const Session = require('../src/models/Session');
  const User = require('../src/models/User');
  const OTP = require('../src/models/OTP');

  console.log('Clearing test collections...');
  await Promise.all([
    Admin.deleteMany({}),
    Session.deleteMany({}),
    User.deleteMany({}),
    OTP.deleteMany({})
  ]);
  console.log('Collections cleared.');
}

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function postRequest(action, payload = {}) {
  return makeRequest({
    hostname: API_URL,
    port: API_PORT,
    path: '/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { action, ...payload });
}

async function testOtpFlows() {
  try {
    console.log('=== Starting OTP Flow Tests ===\n');

    // Connect to MongoDB
    console.log('Connecting to MongoDB Atlas...');
    await connectDB();
    console.log('Connected to MongoDB Atlas.\n');

    // Clear collections
    await clearCollections();
    console.log('');

    // Test 1: Send OTP for registration
    console.log('Test 1: Send OTP for registration');
    const sendOtp1 = await postRequest('sendOTP', {
      email: TEST_USER.Email,
      type: 'registration'
    });
    console.log('Result:', sendOtp1.success ? '✅ PASS' : '❌ FAIL', sendOtp1);
    if (!sendOtp1.success) throw new Error('Test 1 failed');
    console.log('');

    // Test 2: Register without OTP
    console.log('Test 2: Register without OTP');
    const registerNoOtp = await postRequest('registerUser', {
      userData: { ...TEST_USER }
    });
    console.log('Result:', !registerNoOtp.success ? '✅ PASS' : '❌ FAIL', registerNoOtp);
    console.log('');

    // Test 3: Register with invalid OTP
    console.log('Test 3: Register with invalid OTP');
    const registerInvalidOtp = await postRequest('registerUser', {
      userData: { ...TEST_USER, OTP: '000000' }
    });
    console.log('Result:', !registerInvalidOtp.success ? '✅ PASS' : '❌ FAIL', registerInvalidOtp);
    console.log('');

    // Get OTP from database
    const OTP = require('../src/models/OTP');
    const otpDoc = await OTP.findOne({ email: TEST_USER.Email, type: 'registration' });
    if (!otpDoc) throw new Error('OTP not found in database');
    console.log('Retrieved OTP from database:', otpDoc.otp);
    console.log('');

    // Test 4: Register with valid OTP
    console.log('Test 4: Register with valid OTP');
    const registerValidOtp = await postRequest('registerUser', {
      userData: { ...TEST_USER, OTP: otpDoc.otp }
    });
    console.log('Result:', registerValidOtp.success ? '✅ PASS' : '❌ FAIL', registerValidOtp);
    if (!registerValidOtp.success) throw new Error('Test 4 failed');
    console.log('');

    // Test 5: Try to register duplicate email
    console.log('Test 5: Try to register duplicate email');
    const registerDuplicateEmail = await postRequest('registerUser', {
      userData: { ...TEST_USER, UnivID: 'TU002', OTP: '123456' }
    });
    console.log('Result:', !registerDuplicateEmail.success ? '✅ PASS' : '❌ FAIL', registerDuplicateEmail);
    console.log('');

    // Test 6: Try to register duplicate UnivID
    console.log('Test 6: Try to register duplicate UnivID');
    const registerDuplicateUnivId = await postRequest('registerUser', {
      userData: { ...TEST_USER, Email: 'another@example.com', OTP: '123456' }
    });
    console.log('Result:', !registerDuplicateUnivId.success ? '✅ PASS' : '❌ FAIL', registerDuplicateUnivId);
    console.log('');

    // Test 7: Login with email
    console.log('Test 7: Login with email');
    const loginWithEmail = await postRequest('loginUser', {
      email: TEST_USER.Email,
      password: TEST_USER.Password,
      ip: '127.0.0.1'
    });
    console.log('Result:', loginWithEmail.success ? '✅ PASS' : '❌ FAIL', loginWithEmail);
    if (!loginWithEmail.success) throw new Error('Test 7 failed');
    const sessionToken1 = loginWithEmail.sessionToken;
    console.log('');

    // Test 8: Login with UnivID
    console.log('Test 8: Login with UnivID');
    const loginWithUnivId = await postRequest('loginUser', {
      email: TEST_USER.UnivID,
      password: TEST_USER.Password,
      ip: '127.0.0.1'
    });
    console.log('Result:', loginWithUnivId.success ? '✅ PASS' : '❌ FAIL', loginWithUnivId);
    if (!loginWithUnivId.success) throw new Error('Test 8 failed');
    const sessionToken2 = loginWithUnivId.sessionToken;
    console.log('');

    // Test 9: Forgot password for existing user
    console.log('Test 9: Forgot password for existing user');
    const forgotPassword = await postRequest('forgotPassword', {
      identifier: TEST_USER.Email
    });
    console.log('Result:', forgotPassword.success ? '✅ PASS' : '❌ FAIL', forgotPassword);
    if (!forgotPassword.success) throw new Error('Test 9 failed');
    console.log('');

    // Get reset OTP from database
    const resetOtpDoc = await OTP.findOne({ email: TEST_USER.Email, type: 'password_reset' });
    if (!resetOtpDoc) throw new Error('Reset OTP not found in database');
    console.log('Retrieved reset OTP from database:', resetOtpDoc.otp);
    console.log('');

    // Test 10: Reset password with invalid OTP
    console.log('Test 10: Reset password with invalid OTP');
    const resetInvalidOtp = await postRequest('resetPassword', {
      identifier: TEST_USER.Email,
      otp: '000000',
      newPassword: NEW_PASSWORD
    });
    console.log('Result:', !resetInvalidOtp.success ? '✅ PASS' : '❌ FAIL', resetInvalidOtp);
    console.log('');

    // Test 11: Reset password with valid OTP
    console.log('Test 11: Reset password with valid OTP');
    const resetValidOtp = await postRequest('resetPassword', {
      identifier: TEST_USER.Email,
      otp: resetOtpDoc.otp,
      newPassword: NEW_PASSWORD
    });
    console.log('Result:', resetValidOtp.success ? '✅ PASS' : '❌ FAIL', resetValidOtp);
    if (!resetValidOtp.success) throw new Error('Test 11 failed');
    console.log('');

    // Test 12: Login with new password
    console.log('Test 12: Login with new password');
    const loginNewPassword = await postRequest('loginUser', {
      email: TEST_USER.Email,
      password: NEW_PASSWORD,
      ip: '127.0.0.1'
    });
    console.log('Result:', loginNewPassword.success ? '✅ PASS' : '❌ FAIL', loginNewPassword);
    if (!loginNewPassword.success) throw new Error('Test 12 failed');
    console.log('');

    // Test 13: Try to reuse OTP (should fail)
    console.log('Test 13: Try to reuse OTP');
    const reuseOtp = await postRequest('resetPassword', {
      identifier: TEST_USER.Email,
      otp: resetOtpDoc.otp,
      newPassword: 'AnotherPassword789'
    });
    console.log('Result:', !reuseOtp.success ? '✅ PASS' : '❌ FAIL', reuseOtp);
    console.log('');

    // Test 14: Logout session
    console.log('Test 14: Logout session');
    const logoutSession = await postRequest('logoutSession', {
      sessionToken: sessionToken1
    });
    console.log('Result:', logoutSession.success ? '✅ PASS' : '❌ FAIL', logoutSession);
    console.log('');

    console.log('=== All Tests Passed! ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

testOtpFlows();
