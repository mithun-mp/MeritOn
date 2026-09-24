require('dotenv').config();
const mongoose = require('mongoose');
const OTP = require('../src/models/OTP');
const Session = require('../src/models/Session');
const SubmissionQueue = require('../src/models/SubmissionQueue');

const isDryRun = process.argv.includes('--dry-run');
const isExecute = process.argv.includes('--execute');

async function getCollectionCounts() {
  return {
    otps: await OTP.countDocuments(),
    sessions: await Session.countDocuments(),
    submissionQueues: await SubmissionQueue.countDocuments()
  };
}

async function cleanup() {
  console.log('========================================');
  console.log('MeritOn Database Cleanup');
  console.log('Mode:', isDryRun ? 'DRY RUN (no changes)' : (isExecute ? 'EXECUTE (will modify DB)' : 'Preview only - use --execute to run'));
  console.log('========================================\n');

  console.log('Retention settings:');
  console.log('  Used OTPs: 1 day');
  console.log('  Completed/Duplicate queues: 1 day');
  console.log('  Failed queues: 7 days');
  console.log('');

  const beforeCounts = await getCollectionCounts();
  console.log('Before cleanup counts:');
  console.log('  OTPs:', beforeCounts.otps);
  console.log('  Sessions:', beforeCounts.sessions);
  console.log('  Submission queues:', beforeCounts.submissionQueues);
  console.log('');

  if (!isExecute && !isDryRun) {
    console.log('Use --dry-run to preview or --execute to run cleanup.');
    process.exit(0);
  }

  const deletedCounts = {
    otps: 0,
    sessions: 0,
    submissionQueues: 0
  };

  const now = new Date();

  // 1. Delete used OTPs older than 1 day
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const otpQuery = { used: true, createdAt: { $lt: oneDayAgo } };
  if (isExecute) {
    const otpResult = await OTP.deleteMany(otpQuery);
    deletedCounts.otps = otpResult.deletedCount;
  } else {
    deletedCounts.otps = await OTP.countDocuments(otpQuery);
  }

  // 2. Note: Expired OTPs and Sessions are auto-deleted by MongoDB TTL indexes
  // 3. Delete old submission queues (expired)
  const queueQuery = { expiresAt: { $lt: now } };
  if (isExecute) {
    const queueResult = await SubmissionQueue.deleteMany(queueQuery);
    deletedCounts.submissionQueues = queueResult.deletedCount;
  } else {
    deletedCounts.submissionQueues = await SubmissionQueue.countDocuments(queueQuery);
  }

  console.log('\nItems to delete' + (isDryRun ? ' (preview)' : ':'));
  console.log('  Used OTPs (older than 1d):', deletedCounts.otps);
  console.log('  Expired submission queues:', deletedCounts.submissionQueues);
  console.log('  (Expired OTPs and sessions auto-deleted by TTL)');

  const afterCounts = isExecute ? await getCollectionCounts() : {
    otps: beforeCounts.otps - deletedCounts.otps,
    sessions: beforeCounts.sessions,
    submissionQueues: beforeCounts.submissionQueues - deletedCounts.submissionQueues
  };
  console.log('\nAfter cleanup counts:');
  console.log('  OTPs:', afterCounts.otps);
  console.log('  Sessions:', afterCounts.sessions);
  console.log('  Submission queues:', afterCounts.submissionQueues);
  console.log('');
  console.log('========================================');
  console.log('Cleanup complete!');
  console.log('========================================');
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    await cleanup();
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
