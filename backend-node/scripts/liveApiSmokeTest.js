const https = require('https');

const API_URL = 'https://meriton.onrender.com/api';

function request(options, data = null, start) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), time: Date.now() - start });
        } catch (e) {
          resolve({ status: res.statusCode, body, time: Date.now() - start });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function get(action, params = {}) {
  const query = Object.entries({ action, ...params })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const options = {
    hostname: 'meriton.onrender.com',
    path: `/api?${query}`,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  const start = Date.now();
  return await request(options, null, start);
}

async function post(data) {
  const options = {
    hostname: 'meriton.onrender.com',
    path: '/api',
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      'Content-Length': Buffer.byteLength(JSON.stringify(data))
    }
  };
  const start = Date.now();
  return await request(options, JSON.stringify(data), start);
}

async function testHealth() {
  const start = Date.now();
  const res = await request({
    hostname: 'meriton.onrender.com',
    path: '/health',
    method: 'GET'
  }, null, start);
  return {
    test: 'health',
    pass: res.status === 200,
    status: res.status,
    time: res.time,
    body: res.body
  };
}

async function testAdminLogin() {
  const res = await post({ action: 'adminLogin', username: 'test', password: 'test' });
  return {
    test: 'adminLogin',
    pass: res.status === 200,
    status: res.status,
    time: res.time,
    body: res.body
  };
}

async function testGetAllTests() {
  const res = await get('getAllTests');
  return {
    test: 'getAllTests',
    pass: res.status === 200 && (Array.isArray(res.body) || res.body.success !== false),
    status: res.status,
    time: res.time,
    body: res.body
  };
}

async function main() {
  console.log('🧪 MERITON LIVE API SMOKE TEST\n');
  const results = [];

  results.push(await testHealth());
  results.push(await testAdminLogin());
  results.push(await testGetAllTests());

  console.group('Test Results');
  results.forEach(r => {
    const emoji = r.pass ? '✅' : '❌';
    console.log(`${emoji} ${r.test} | Status: ${r.status} | Time: ${r.time}ms`);
    if (!r.pass) console.log('  Response:', r.body);
  });
  console.groupEnd();

  const allPassed = results.every(r => r.pass);
  console.log(`\nFinal Verdict: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
}

main().catch(console.error);
