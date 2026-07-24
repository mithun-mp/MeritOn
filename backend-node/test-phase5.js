
const http = require('http');
const mongoose = require('mongoose');

async function clearCollections() {
  const Admin = require('./src/models/Admin');
  const Test = require('./src/models/Test');
  const Question = require('./src/models/Question');
  const Performance = require('./src/models/Performance');
  const Response = require('./src/models/Response');
  const Session = require('./src/models/Session');
  const ErrorLog = require('./src/models/ErrorLog');
  const AuditLog = require('./src/models/AuditLog');
  const User = require('./src/models/User');
  const OTP = require('./src/models/OTP');
  
  await Promise.all([
    Admin.deleteMany({}),
    Test.deleteMany({}),
    Question.deleteMany({}),
    Performance.deleteMany({}),
    Response.deleteMany({}),
    Session.deleteMany({}),
    ErrorLog.deleteMany({}),
    AuditLog.deleteMany({}),
    User.deleteMany({}),
    OTP.deleteMany({})
  ]);
}

async function makeRequest(options, body) {
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

const connectDB = require('./src/config/db');

async function main() {
  try {
    await connectDB();
    await clearCollections();

    console.log('=== Test 1: Create admin & login ===');
    const Admin = require('./src/models/Admin');
    await Admin.create({ Username: 'admin', Password: 'admin123' });
    const adminLogin = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'adminLogin',
      username: 'admin',
      password: 'admin123'
    });
    console.log('Admin login:', adminLogin.success ? 'OK' : 'FAIL');
    const adminToken = adminLogin.sessionToken;

    console.log('\n=== Test 2: Create test ===');
    const createTest = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'createTest',
      name: 'Phase5 Test',
      date: '2025-01-01',
      startTime: '09:00',
      endTime: '11:00',
      duration: 120,
      sections: [],
      mode: 'normal',
      expiryTime: '10:30',
      sessionToken: adminToken
    });
    console.log('Create test:', createTest.success ? 'OK' : 'FAIL');
    const testId = createTest.testId;

    console.log('\n=== Test 3: Add questions ===');
    const addQuestions = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'addQuestions',
      testId,
      questions: [
        { qid: 'Q1', section: 'Algebra', difficulty: 'Easy', question: 'What is 2+2?', a: '1', b: '2', c: '3', d: '4', correct: 'D', marks: 2, negativeMarks: 0.5 },
        { qid: 'Q2', section: 'Algebra', difficulty: 'Medium', question: 'What is 3*3?', a: '6', b: '9', c: '12', d: '15', correct: 'B', marks: 3, negativeMarks: 1 },
        { qid: 'Q3', section: 'Geometry', difficulty: 'Hard', question: 'What is 5+5?', a: '10', b: '11', c: '12', d: '13', correct: 'A', marks: 4, negativeMarks: 1.5 }
      ],
      sessionToken: adminToken
    });
    console.log('Add questions:', addQuestions.success ? 'OK' : 'FAIL');

    console.log('\n=== Test 4: Register a user ===');
    const sendOTP = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'sendOTP',
      email: 'testuser@example.com',
      type: 'registration'
    });
    console.log('Send OTP:', sendOTP.success ? 'OK' : 'FAIL');
    // Get OTP from DB for testing
    const OTP = require('./src/models/OTP');
    const otpDoc = await OTP.findOne({ email: 'testuser@example.com', type: 'registration' });
    const registerUser = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'registerUser',
      FullName: 'Test User',
      UnivID: 'TU123',
      Email: 'testuser@example.com',
      Phone: '1234567890',
      Department: 'CSE',
      Year: '2024',
      Password: 'password123',
      OTP: otpDoc.otp
    });
    console.log('Register user:', registerUser.success ? 'OK' : 'FAIL');

    console.log('\n=== Test 5: Get all users (admin only) ===');
    const getAllUsers = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getAllUsers&sessionToken=${adminToken}`, method: 'GET' });
    console.log('Get all users:', getAllUsers.length > 0 ? 'OK' : 'FAIL');

    console.log('\n=== Test 6: Submit user test ===');
    const submit1 = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'submitTest',
      userID: 'user1',
      name: 'User One',
      Email: 'user1@example.com',
      TestId: testId,
      answers: { Q1: 'D', Q2: 'B', Q3: 'A' },
      startedAt: new Date(),
      FullScreenViolations: 0,
      TabSwitchCount: 0,
      autoSubmitted: false
    });
    console.log('Submit test1:', submit1.success ? 'OK' : 'FAIL');

    console.log('\n=== Test 7: Get responses ===');
    const responses = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getResponses&testId=${testId}`, method: 'GET' });
    console.log('Get responses count:', responses.length === 3 ? 'OK' : 'FAIL');

    console.log('\n=== Test 8: Get performance (admin) ===');
    const perfAdmin = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getPerformance&testId=${testId}&sessionToken=${adminToken}`, method: 'GET' });
    console.log('Get performance count (admin):', perfAdmin.length === 1 ? 'OK' : 'FAIL');
    console.log('Correct count:', perfAdmin[0].CorrectCount === 3 ? 'OK' : 'FAIL');

    console.log('\n=== Test 9: Get candidate analytics ===');
    const candidateAnalytics = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getCandidateAnalytics&userID=user1`, method: 'GET' });
    console.log('Candidate analytics:', candidateAnalytics.totalExams === 1 ? 'OK' : 'FAIL');

    console.log('\n=== Test 10: Publish single result ===');
    const publish1 = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'publishResult',
      testId,
      userId: 'user1',
      sessionToken: adminToken
    });
    console.log('Publish single:', publish1.success ? 'OK' : 'FAIL');

    console.log('\n=== Test 11: Submit user 2 test ===');
    const submit2 = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'submitTest',
      userID: 'user2',
      name: 'User Two',
      Email: 'user2@example.com',
      TestId: testId,
      answers: { Q1: 'C', Q2: 'B', Q3: 'B' },
      startedAt: new Date(),
      FullScreenViolations: 1,
      TabSwitchCount: 2,
      autoSubmitted: true
    });
    console.log('Submit test2:', submit2.success ? 'OK' : 'FAIL');

    console.log('\n=== Test 12: Publish all results ===');
    const publishAll = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'publishAllResults',
      testId,
      sessionToken: adminToken
    });
    console.log('Publish all:', publishAll.success ? `OK (${publishAll.publishedCount} published)` : 'FAIL');

    console.log('\n=== Test 13: Publish answer key ===');
    const publishAnswerKey = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'publishAnswerKey',
      testId,
      sessionToken: adminToken
    });
    console.log('Publish answer key:', publishAnswerKey.success ? 'OK' : 'FAIL');

    console.log('\n=== Test 14: Get malpractice logs ===');
    const malpracticeLogs = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getMalpracticeLogs&testId=${testId}&sessionToken=${adminToken}`, method: 'GET' });
    console.log('Malpractice logs count:', malpracticeLogs.length === 1 ? 'OK' : 'FAIL');

    console.log('\n=== All Phase5 tests complete! ===');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Test failed:', err);
  }
}

main();
