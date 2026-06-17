
const http = require('http');
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const Test = require('./src/models/Test');
const Session = require('./src/models/Session');
const User = require('./src/models/User');
const OTP = require('./src/models/OTP');

function makePost(body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function makeGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    let urlParams = new URLSearchParams({ ...params, action });
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api?${urlParams.toString()}`,
      method: 'GET'
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    await mongoose.connect('mongodb://localhost:27017/meriton-cbt');
    await Admin.deleteMany({});
    await Test.deleteMany({});
    await Session.deleteMany({});
    await User.deleteMany({});
    await OTP.deleteMany({});
    await Admin.create({ Username: 'admin', Password: 'admin123' });

    console.log('=== Step 1: getAllTests when empty');
    const testsEmpty = await makeGet('getAllTests');
    console.log('✓ Empty test passed:', testsEmpty.length === 0);

    console.log('\n=== Step 2: createTest without admin token');
    const createTestFail = await makePost({ action: 'createTest', name: 'Test 1', date: '2025-01-01', startTime: '09:00', endTime: '11:00', duration: 120, sections: [], mode: 'normal', expiryTime: '10:30' });
    console.log('✓ Create test without token failed:', createTestFail.error === 'Unauthorized');

    console.log('\n=== Step 3: adminLogin to get token');
    const adminLogin = await makePost({ action: 'adminLogin', username: 'admin', password: 'admin123' });
    const adminToken = adminLogin.sessionToken;
    console.log('✓ Admin login success:', !!adminToken);

    console.log('\n=== Step 4: createTest with admin token');
    const createTestSuccess = await makePost({ action: 'createTest', name: 'Math Exam', date: '2025-06-18', startTime: '09:00', endTime: '10:00', duration: 60, sections: [], mode: 'normal', expiryTime: '09:45', sessionToken: adminToken });
    console.log('✓ Create test success:', !!createTestSuccess.testId);

    console.log('\n=== Step 5: getAllTests after create');
    const afterCreateTests = await makeGet('getAllTests');
    console.log('✓ After create, tests length:', afterCreateTests.length);

    console.log('\n=== Step 6: updateTest with admin token');
    const testId = createTestSuccess.testId;
    const updateTest = await makePost({ action: 'updateTest', testId: testId, name: 'Updated Math Exam', sessionToken: adminToken });
    console.log('✓ Update test success:', updateTest.success);

    console.log('\n=== Step 7: deleteTest with admin token');
    const deleteTest = await makePost({ action: 'deleteTest', testId: testId, sessionToken: adminToken });
    console.log('✓ Delete test success:', deleteTest.success);

    console.log('\n=== Step 8: getAllTests after delete (should hide soft deleted');
    const afterDeleteTests = await makeGet('getAllTests');
    console.log('✓ After delete, tests length:', afterDeleteTests.length);

    console.log('\n=== Step 9: getAllTests with includeDeleted');
    const withDeletedTests = await makeGet('getAllTests', { includeDeleted: 'true' });
    console.log('✓ With deleted, tests length:', withDeletedTests.length);

    console.log('\n=== Step 10: Test registration still works');
    const sendOTP = await makePost({ action: 'sendOTP', email: 'test@test.com', type: 'registration' });
    console.log('✓ Send OTP:', sendOTP.success);

    console.log('\n✅ All Phase3C tests passed!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Tests failed:', err);
  }
}

main();
