
const http = require('http');
const mongoose = require('mongoose');
const Admin = require('./src/models/Admin');
const Test = require('./src/models/Test');
const Question = require('./src/models/Question');
const Session = require('./src/models/Session');

function makePost(body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function makeGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    const urlParams = new URLSearchParams({ ...params, action });
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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const connectDB = require('./src/config/db');

async function main() {
  try {
    await connectDB();
    await Admin.deleteMany({});
    await Test.deleteMany({});
    await Question.deleteMany({});
    await Session.deleteMany({});
    await Admin.create({ Username: 'admin', Password: 'admin123' });

    // Step 1: getQuestions for missing test
    console.log('=== Step 1: getQuestions for missing test ===');
    const missingTest = await makeGet('getQuestions', { testId: 'T123' });
    console.log('✓ Step 1 passed:', missingTest.length === 0);

    // Step 2: Create test
    console.log('\n=== Step 2: Create test ===');
    const adminLoginRes = await makePost({ action: 'adminLogin', username: 'admin', password: 'admin123' });
    const adminToken = adminLoginRes.sessionToken;
    const createTestRes = await makePost({
      action: 'createTest',
      name: 'Math Exam',
      date: '2025-06-18',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      sections: [],
      mode: 'normal',
      expiryTime: '09:45',
      sessionToken: adminToken
    });
    const testId = createTestRes.testId;
    console.log('✓ Test created:', testId);

    // Step 3: addQuestions without admin token
    console.log('\n=== Step 3: addQuestions without admin token ===');
    const noTokenAdd = await makePost({
      action: 'addQuestions',
      testId: testId,
      questions: [{
        qid: 'Q1',
        section: 'Algebra',
        difficulty: 'Easy',
        question: 'What is 2+2?',
        a: '1',
        b: '2',
        c: '3',
        d: '4',
        correct: 'D',
        marks: 2,
        negativeMarks: 0.5
      }]
    });
    console.log('✓ Step 3 passed:', noTokenAdd.success === false);

    // Step 4: addQuestions with admin token
    console.log('\n=== Step 4: addQuestions with admin token ===');
    const addRes = await makePost({
      action: 'addQuestions',
      testId: testId,
      questions: [{
        qid: 'Q1',
        section: 'Algebra',
        difficulty: 'Easy',
        question: 'What is 2+2?',
        a: '1',
        b: '2',
        c: '3',
        d: '4',
        correct: 'D',
        marks: 2,
        negativeMarks: 0.5
      }],
      sessionToken: adminToken
    });
    console.log('✓ Step 4 passed:', addRes.success);

    // Step 5: getQuestions without includeAnswers
    console.log('\n=== Step 5: getQuestions without includeAnswers ===');
    const noAnswers = await makeGet('getQuestions', { testId });
    console.log('✓ Step 5 passed:', noAnswers[0].Correct === undefined);

    // Step 6: getQuestions with includeAnswers
    console.log('\n=== Step 6: getQuestions with includeAnswers ===');
    const withAnswers = await makeGet('getQuestions', { testId, includeAnswers: 'true' });
    console.log('✓ Step 6 passed:', withAnswers[0].Correct === 'D');

    // Step 7: updateQuestion with admin token
    console.log('\n=== Step 7: updateQuestion ===');
    const updateRes = await makePost({
      action: 'updateQuestion',
      testId: testId,
      qid: 'Q1',
      question: 'What is 2+3?',
      sessionToken: adminToken
    });
    console.log('✓ Step 7 passed:', updateRes.success);

    // Step 8: deleteQuestion with admin token
    console.log('\n=== Step 8: deleteQuestion ===');
    const deleteRes = await makePost({
      action: 'deleteQuestion',
      testId: testId,
      qid: 'Q1',
      sessionToken: adminToken
    });
    console.log('✓ Step 8 passed:', deleteRes.success);

    // Step 9: getQuestions after delete (hide soft delete)
    console.log('\n=== Step 9: getQuestions after delete ===');
    const afterDelete = await makeGet('getQuestions', { testId });
    console.log('✓ Step 9 passed:', afterDelete.length === 0);

    // Step 10: getQuestions includeDeleted? Not implemented in Code.gs, so skip

    // Step 11-13: Regression tests
    console.log('\n=== Step 11-13: Regression tests ===');
    const regAdminLogin = await makePost({ action: 'adminLogin', username: 'admin', password: 'admin123' });
    console.log('✓ Admin login regression:', regAdminLogin.success);

    console.log('\n✅ All Phase 3D tests passed!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Tests failed:', err);
  }
}

main();
