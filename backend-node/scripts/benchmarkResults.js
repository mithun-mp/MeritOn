require('dotenv').config();
const mongoose = require('mongoose');
const Performance = require('../src/models/Performance');
const Response = require('../src/models/Response');
const Question = require('../src/models/Question');

async function benchmark() {
  console.log('=== MERITON RESULT BENCHMARK ===');
  await mongoose.connect(process.env.MONGODB_URI);

  const testId = process.argv[2] || 'TEST-001';
  const userId = process.argv[3] || 'USER-001';

  console.log('\n--- Benchmark 1: getPerformance ---');
  const perfStart = Date.now();
  const perfBefore = process.memoryUsage();
  const perf = await Performance.findOne({ userID: userId, TestId: testId }).lean();
  const perfAfter = process.memoryUsage();
  console.log('Found performance:', perf ? 'yes' : 'no');
  console.log('Time:', (Date.now() - perfStart), 'ms');
  console.log('Memory delta:', (perfAfter.heapUsed - perfBefore.heapUsed) / 1024 / 1024, 'MB');

  console.log('\n--- Benchmark 2: getResults ---');
  const resultsStart = Date.now();
  const resultsBefore = process.memoryUsage();
  const results = await Performance.find({ TestId: testId }).sort({ NetScore: -1 }).lean();
  const resultsAfter = process.memoryUsage();
  console.log('Found results:', results.length);
  console.log('Time:', (Date.now() - resultsStart), 'ms');
  console.log('Memory delta:', (resultsAfter.heapUsed - resultsBefore.heapUsed) / 1024 / 1024, 'MB');

  console.log('\n--- Benchmark 3: getResponses ---');
  const respStart = Date.now();
  const respBefore = process.memoryUsage();
  const response = await Response.findOne({ userID: userId, TestId: testId }).lean();
  const questions = await Question.find({ TestID: testId, IsDeleted: { $ne: true } }).lean();
  const respAfter = process.memoryUsage();
  console.log('Found response:', response ? 'yes' : 'no');
  console.log('Found questions:', questions.length);
  console.log('Time:', (Date.now() - respStart), 'ms');
  console.log('Memory delta:', (respAfter.heapUsed - respBefore.heapUsed) / 1024 / 1024, 'MB');

  console.log('\n--- Benchmark 4: getCandidateAnalytics ---');
  const analyticsStart = Date.now();
  const analyticsBefore = process.memoryUsage();
  const candidatePerfs = await Performance.find({ userID: userId }).sort({ SubmittedAt: -1 }).lean();
  const analyticsAfter = process.memoryUsage();
  console.log('Found performances:', candidatePerfs.length);
  console.log('Time:', (Date.now() - analyticsStart), 'ms');
  console.log('Memory delta:', (analyticsAfter.heapUsed - analyticsBefore.heapUsed) / 1024 / 1024, 'MB');

  console.log('\n=== BENCHMARK COMPLETE ===');
  await mongoose.disconnect();
}

benchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
