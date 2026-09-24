
const https = require('https');

const BASE_URL = 'meriton.onrender.com';

function makePostRequest(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (err) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('MERITON ADMIN LOGIN TEST SUITE');
  console.log('========================================\n');

  let sessionToken = null;

  // Test 1: Admin / MithunAdmin123
  console.log('Test 1: Admin / MithunAdmin123');
  const test1 = await makePostRequest({
    action: 'adminLogin',
    username: 'Admin',
    password: 'MithunAdmin123'
  });
  console.log('Status:', test1.status);
  console.log('Response:', JSON.stringify(test1.data, null, 2));
  console.log('Result:', test1.data.success ? '✅ PASS' : '❌ FAIL');
  console.log('');
  if (test1.data.success) sessionToken = test1.data.sessionToken;

  // Test 2: admin / admin123
  console.log('Test 2: admin / admin123');
  const test2 = await makePostRequest({
    action: 'adminLogin',
    username: 'admin',
    password: 'admin123'
  });
  console.log('Status:', test2.status);
  console.log('Response:', JSON.stringify(test2.data, null, 2));
  console.log('Result:', test2.data.success ? '✅ PASS' : '❌ FAIL');
  console.log('');
  if (test2.data.success) sessionToken = test2.data.sessionToken;

  // Test 3: Wrong password
  console.log('Test 3: Wrong password');
  const test3 = await makePostRequest({
    action: 'adminLogin',
    username: 'Admin',
    password: 'wrongpassword'
  });
  console.log('Status:', test3.status);
  console.log('Response:', JSON.stringify(test3.data, null, 2));
  console.log('Result:', !test3.data.success ? '✅ PASS' : '❌ FAIL');
  console.log('');

  // Test 4: Verify Admin with session token
  if (sessionToken) {
    console.log('Test 4: Verify Admin');
    const test4 = await makePostRequest({
      action: 'verifyAdmin',
      sessionToken: sessionToken
    });
    console.log('Status:', test4.status);
    console.log('Response:', JSON.stringify(test4.data, null, 2));
    console.log('Result:', test4.data.success ? '✅ PASS' : '❌ FAIL');
    console.log('');
  }

  console.log('========================================');
  console.log('TEST SUITE COMPLETED');
  console.log('========================================');
}

runTests().catch(err => console.error('Test run failed:', err));
