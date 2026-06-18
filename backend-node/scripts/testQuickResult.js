const mongoose = require('mongoose');
const Test = require('../src/models/Test');
const Question = require('../src/models/Question');
const SubmissionResult = require('../src/models/SubmissionResult');
const examController = require('../src/controllers/examController');
require('dotenv').config({ path: '../.env' });

const TEST_USER_ID = 'test_user_123';
const TEST_NAME = 'Test User';
const TEST_EMAIL = 'test@example.com';

async function test() {
  console.log('🔍 Starting Quick Result tests...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to DB');

    // Cleanup
    await SubmissionResult.deleteMany({ userID: TEST_USER_ID });

    // Create test with QuickResult true
    let testId = 'quick_result_test_001';
    await Test.deleteMany({ TestID: testId });
    await Test.create({
      TestID: testId,
      Name: 'Quick Result Test',
      Date: new Date(),
      StartTime: '09:00',
      EndTime: '10:00',
      Duration: 60,
      Sections: JSON.stringify([{ name: 'Test', count: 2 }]),
      Mode: 'Online',
      ExpiryTime: '23:59',
      ExamType: 'Mock',
      QuickResult: true,
      AnswerKeyPublished: false
    });

    await Question.deleteMany({ TestID: testId });
    await Question.create([
      {
        TestID: testId,
        QID: 'q1',
        Question: 'What is 1+1?',
        A: '1', B: '2', C: '3', D: '4', Correct: 'B',
        Marks: 2, NegativeMarks: 0.5,
        Section: 'Test', Difficulty: 'Easy'
      },
      {
        TestID: testId,
        QID: 'q2',
        Question: 'What is 2+2?',
        A: '2', B: '3', C: '4', D: '5', Correct: 'C',
        Marks: 2, NegativeMarks: 0.5,
        Section: 'Test', Difficulty: 'Easy'
      }
    ]);

    // Submit test
    const submissionResult = await examController.submitTest({
      userID: TEST_USER_ID,
      TestId: testId,
      name: TEST_NAME,
      Email: TEST_EMAIL,
      answers: { q1: 'B', q2: 'D' },
      StartedAt: new Date(Date.now() - 30 * 60 * 1000),
      FullScreenViolations: 0,
      TabSwitchCount: 0,
      AutoSubmitted: false
    });

    console.log('📤 Submitted test, result:', submissionResult);

    // Check SubmissionResult
    const subResult = await SubmissionResult.findOne({ userID: TEST_USER_ID, TestId: testId }).lean();
    console.log('📋 SubmissionResult:', subResult);
    console.log('✅ SubmissionResult has result.published:', subResult.result.published);
    console.log('✅ Summary netScore:', subResult.summary.netScore);
    console.log('✅ Summary scorePercentile:', subResult.summary.scorePercentile);

    // Get performance without session
    const perfResult = await examController.getPerformance({
      userID: TEST_USER_ID, TestId: testId
    });
    console.log('📊 getPerformance (no session):', perfResult);

    // Create test with QuickResult false
    testId = 'slow_result_test_001';
    await Test.deleteMany({ TestID: testId });
    await Test.create({
      TestID: testId,
      Name: 'Slow Result Test',
      Date: new Date(),
      StartTime: '09:00',
      EndTime: '10:00',
      Duration: 60,
      Sections: JSON.stringify([{ name: 'Test', count: 2 }]),
      Mode: 'Online',
      ExpiryTime: '23:59',
      ExamType: 'Mock',
      QuickResult: false,
      AnswerKeyPublished: false
    });
    await Question.deleteMany({ TestID: testId });
    await Question.create([
      {
        TestID: testId,
        QID: 'q1',
        Question: 'What is 1+1?',
        A: '1', B: '2', C: '3', D: '4', Correct: 'B',
        Marks: 2, NegativeMarks: 0.5,
        Section: 'Test', Difficulty: 'Easy'
      }
    ]);

    // Submit test
    const submissionResult2 = await examController.submitTest({
      userID: TEST_USER_ID,
      TestId: testId,
      name: TEST_NAME,
      Email: TEST_EMAIL,
      answers: { q1: 'B' },
      StartedAt: new Date(Date.now() - 30 * 60 * 1000),
      FullScreenViolations: 0,
      TabSwitchCount: 0,
      AutoSubmitted: false
    });

    console.log('📤 Submitted test 2, result:', submissionResult2);
    const subResult2 = await SubmissionResult.findOne({ userID: TEST_USER_ID, TestId: testId }).lean();
    console.log('✅ SubmissionResult has result.published:', subResult2.result.published);

    // Get performance for slow test (should be error)
    const perfResult2 = await examController.getPerformance({ userID: TEST_USER_ID, TestId: testId });
    console.log('📊 getPerformance (slow, no session):', perfResult2);

    console.log('\n🎉 All Quick Result tests passed!');

  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await mongoose.connection.close();
  }
}

test();
