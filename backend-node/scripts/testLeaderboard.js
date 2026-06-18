const mongoose = require('mongoose');
require('dotenv').config();
const SubmissionResult = require('../src/models/SubmissionResult');

async function testLeaderboard() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/meriton');
    console.log('✅ Connected to MongoDB');

    // Clean up test data
    await SubmissionResult.deleteMany({ userID: { $in: ['test-leader-1', 'test-leader-2', 'test-leader-3'] } });

    // Create test SubmissionResults
    const testSubmissions = [
      {
        userID: 'test-leader-1',
        TestId: 'TEST-LEADER',
        candidate: {
          name: 'Alice Johnson',
          email: 'alice@example.com'
        },
        test: { maxPossibleScore: 100 },
        timing: { totalTimeTakenSeconds: 1200, allowedDurationSeconds: 1800, submittedAt: new Date() },
        summary: {
          scorePercentile: 95,
          accuracyPercent: 90,
          attemptPercent: 100,
          netScore: 95,
          correctCount: 38,
          wrongCount: 2,
          unansweredCount: 0,
          totalQuestions: 40
        },
        sections: {
          Math: { scorePercentile: 100 },
          English: { scorePercentile: 90 },
          Science: { scorePercentile: 95 }
        },
        difficulty: {
          Easy: { scorePercentile: 100 },
          Medium: { scorePercentile: 90 },
          Hard: { scorePercentile: 90 }
        },
        result: { published: true, publishedAt: new Date() }
      },
      {
        userID: 'test-leader-2',
        TestId: 'TEST-LEADER',
        candidate: {
          name: 'Bob Smith',
          email: 'bob@example.com'
        },
        test: { maxPossibleScore: 100 },
        timing: { totalTimeTakenSeconds: 1500, allowedDurationSeconds: 1800, submittedAt: new Date() },
        summary: {
          scorePercentile: 90,
          accuracyPercent: 85,
          attemptPercent: 100,
          netScore: 90,
          correctCount: 36,
          wrongCount: 4,
          unansweredCount: 0,
          totalQuestions: 40
        },
        sections: {
          Math: { scorePercentile: 90 },
          English: { scorePercentile: 95 },
          Science: { scorePercentile: 85 }
        },
        difficulty: {
          Easy: { scorePercentile: 100 },
          Medium: { scorePercentile: 85 },
          Hard: { scorePercentile: 85 }
        },
        result: { published: true, publishedAt: new Date() }
      },
      {
        userID: 'test-leader-3',
        TestId: 'TEST-LEADER',
        candidate: {
          name: 'Charlie Brown',
          email: 'charlie@example.com'
        },
        test: { maxPossibleScore: 100 },
        timing: { totalTimeTakenSeconds: 1000, allowedDurationSeconds: 1800, submittedAt: new Date() },
        summary: {
          scorePercentile: 80,
          accuracyPercent: 75,
          attemptPercent: 100,
          netScore: 80,
          correctCount: 32,
          wrongCount: 8,
          unansweredCount: 0,
          totalQuestions: 40
        },
        sections: {
          Math: { scorePercentile: 70 },
          English: { scorePercentile: 90 },
          Science: { scorePercentile: 80 }
        },
        difficulty: {
          Easy: { scorePercentile: 90 },
          Medium: { scorePercentile: 75 },
          Hard: { scorePercentile: 70 }
        },
        result: { published: true, publishedAt: new Date() }
      }
    ];

    await SubmissionResult.insertMany(testSubmissions);
    console.log('✅ Created 3 test submissions');

    console.log('🚀 Leaderboard test completed! Now check the analytics UI for TestId: TEST-LEADER');
  } catch (error) {
    console.error('❌ Error during leaderboard test:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testLeaderboard();
