
const http = require('http');
const mongoose = require('mongoose');

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

async function main() {
  try {
    // First, create admin and login
    const adminLogin = await makeRequest({ 
      hostname: 'localhost', 
      port: 3000, 
      path: '/api', 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' } 
    }, {
      action: 'adminLogin',
      username: 'admin',
      password: 'admin123'
    });
    console.log('Admin login response:', adminLogin);
    if (!adminLogin.success) return;
    const adminToken = adminLogin.sessionToken;
    
    // Create a test
    const createTest = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'createTest',
      name: 'Debug Test',
      date: '2025-01-01',
      startTime: '09:00',
      endTime: '11:00',
      duration: 120,
      sections: [],
      mode: 'normal',
      expiryTime: '10:30',
      sessionToken: adminToken
    });
    console.log('Create test response:', createTest);
    if (!createTest.success) return;
    const testId = createTest.testId;
    
    // Test getAllUsers
    const getAllUsers = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getAllUsers&sessionToken=${adminToken}`, method: 'GET' });
    console.log('getAllUsers response:', getAllUsers);
    
    // Test publishAnswerKey
    const publishAnswerKey = await makeRequest({ hostname: 'localhost', port: 3000, path: '/api', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      action: 'publishAnswerKey',
      testId: testId,
      sessionToken: adminToken
    });
    console.log('publishAnswerKey response:', publishAnswerKey);
    
    // Test getMalpracticeLogs
    const getMalpracticeLogs = await makeRequest({ hostname: 'localhost', port: 3000, path: `/api?action=getMalpracticeLogs&testId=${testId}&sessionToken=${adminToken}`, method: 'GET' });
    console.log('getMalpracticeLogs response:', getMalpracticeLogs);
    
  } catch (err) {
    console.error('Debug failed:', err);
  }
}

main();
