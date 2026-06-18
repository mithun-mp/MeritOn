
const https = require('https');

const BASE_URL = 'meriton.onrender.com';

function makeGetRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makePostRequest(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: BASE_URL,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseBody) });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runVerification() {
  console.log('🔍 STARTING LIVE MONGO VERIFICATION\n');
  
  const testEmail = 'debug-test@example.com';
  
  try {
    // Test 1: Health endpoint
    console.log('1️⃣ Testing /health...');
    const health = await makeGetRequest('/health');
    console.log('   Status:', health.status);
    console.log('   Response:', health.data);
    console.log('   Result:', health.data.success ? '✅ PASS' : '❌ FAIL', '\n');
    
    // Test 2: DB status
    console.log('2️⃣ Testing /debug/db-status...');
    const dbStatus = await makeGetRequest('/debug/db-status');
    console.log('   Status:', dbStatus.status);
    console.log('   Response:', dbStatus.data);
    console.log('   Result:', dbStatus.data.success && dbStatus.data.connected ? '✅ PASS' : '❌ FAIL', '\n');
    
    // Test 3: Test write
    console.log('3️⃣ Testing /debug/test-write...');
    const testWrite = await makePostRequest('/debug/test-write', {
      type: 'user',
      email: testEmail
    });
    console.log('   Status:', testWrite.status);
    console.log('   Response:', testWrite.data);
    console.log('   Result:', testWrite.data.success ? '✅ PASS' : '❌ FAIL', '\n');
    
    // Test 4: Test read
    console.log('4️⃣ Testing /debug/test-read...');
    const testRead = await makeGetRequest(`/debug/test-read?email=${encodeURIComponent(testEmail)}`);
    console.log('   Status:', testRead.status);
    console.log('   Response:', testRead.data);
    console.log('   Result:', testRead.data.success && testRead.data.found ? '✅ PASS' : '❌ FAIL', '\n');
    
    console.log('📝 SUMMARY:');
    console.log('   All tests completed! Now check MongoDB Atlas UI:');
    console.log('   - Go to Database → meriton → users');
    console.log(`   - Search for email: ${testEmail}`);
    console.log('   - Verify DebugCreated and DebugCreatedAt fields are present');
    console.log('\n⚠️  IMPORTANT: After verification, set DEBUG_ENDPOINTS=false in Render!');
    
  } catch (err) {
    console.error('❌ Verification failed:', err);
  }
}

runVerification();
