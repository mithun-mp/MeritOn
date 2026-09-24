require('dotenv').config();
const https = require('https');
const http = require('http');

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const userCountArg = args.find(a => a.startsWith('--users='));
const USER_COUNT = userCountArg ? parseInt(userCountArg.split('=')[1]) : 100;
const BASE_URL = isLocal ? 'http://localhost:3000' : 'https://meriton.onrender.com';
const HTTP_MODULE = isLocal ? http : https;

function makeApiRequest(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const url = new URL(BASE_URL + '/api');
    const options = {
      hostname: url.hostname,
      port: url.port || (isLocal ? 3000 : 443),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = HTTP_MODULE.request(options, (res) => {
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
    req.write(postData);
    req.end();
  });
}

async function runStressTest() {
  console.log('========================================');
  console.log('MERITON SUBMISSION QUEUE STRESS TEST');
  console.log('Mode:', isLocal ? 'local' : 'production');
  console.log('User count:', USER_COUNT);
  console.log('========================================\n');

  const startTime = Date.now();
  const promises = [];
  const results = {
    total: USER_COUNT,
    queued: 0,
    duplicate: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < USER_COUNT; i++) {
    const userData = {
      action: 'submitTest',
      userID: `STRESS-USER-${i}-${Date.now()}`,
      name: `Stress User ${i}`,
      Email: `stress-${i}@example.com`,
      TestId: 'STRESS-TEST-001',
      answers: {},
      startedAt: new Date().toISOString(),
      FullScreenViolations: 0,
      TabSwitchCount: 0,
      autoSubmitted: false
    };

    const promise = makeApiRequest(userData)
      .then(res => {
        if (res.data.success) {
          if (res.data.queued) results.queued++;
        } else if (res.data.error && res.data.error.includes('already')) {
          results.duplicate++;
        } else {
          results.failed++;
          results.errors.push({ user: i, error: res.data.error });
        }
      })
      .catch(err => {
        results.failed++;
        results.errors.push({ user: i, error: err.message });
      });

    promises.push(promise);
  }

  console.log('Sending all requests...');
  await Promise.all(promises);

  const endTime = Date.now();
  const totalTime = endTime - startTime;

  console.log('\n========================================');
  console.log('STRESS TEST RESULTS');
  console.log('========================================');
  console.log('Total requests:', results.total);
  console.log('Queued:', results.queued);
  console.log('Duplicate:', results.duplicate);
  console.log('Failed:', results.failed);
  console.log('Total time:', totalTime, 'ms');
  console.log('Avg per request:', (totalTime / USER_COUNT).toFixed(2), 'ms');

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    console.log(results.errors.slice(0, 10));
  }
  console.log('========================================\n');
}

runStressTest().catch(err => {
  console.error('Stress test failed:', err);
  process.exit(1);
});
