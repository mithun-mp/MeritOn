require('dotenv').config();
const mongoose = require('mongoose');
const OTP = require('../src/models/OTP');
const Session = require('../src/models/Session');
const ErrorLog = require('../src/models/ErrorLog');
const AuditLog = require('../src/models/AuditLog');
const SubmissionQueue = require('../src/models/SubmissionQueue');

const isDryRun = process.argv.includes('--dry-run');
const isExecute = process.argv.includes('--execute');

const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '30');
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '90');

async function getCollectionCounts() {
  return {
    otps: await OTP.countDocuments(),
    sessions: await Session.countDocuments(),
    errorLogs: await ErrorLog.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
    submissionQueues: await SubmissionQueue.countDocuments()
  };
}

async function cleanup() {
  console.log('========================================');
  console.log('MeritOn Database Cleanup');
  console.log('Mode:', isDryRun ? 'DRY RUN (no changes)' : (isExecute ? 'EXECUTE (will modify DB)' : 'Preview only - use --execute to run'));
  console.log('========================================\n');

  console.log('Retention settings:');
  console.log('  Error logs:', LOG_RETENTION_DAYS, 'days');
  console.log('  Audit logs:', AUDIT_RETENTION_DAYS, 'days');
  console.log('  Used OTPs: 1 day');
  console.log('  Completed/Duplicate queues: 1 day');
  console.log('  Failed queues: 7 days');
  console.log('');

  const beforeCounts = await getCollectionCounts();
  console.log('Before cleanup counts:');
  console.log('  OTPs:', beforeCounts.otps);
  console.log('  Sessions:', beforeCounts.sessions);
  console.log('  Error logs:', beforeCounts.errorLogs);
  console.log('  Audit logs:', beforeCounts.auditLogs);
  console.log('  Submission queues:', beforeCounts.submissionQueues);
  console.log('');

  if (!isExecute && !isDryRun) {
    console.log('Use --dry-run to preview or --execute to run cleanup.');
    process.exit(0);
  }

  const deletedCounts = {
    otps: 0,
    sessions: 0,
    errorLogs: 0,
    auditLogs: 0,
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

  // 2. Delete error logs older than retention days
  const logRetentionAgo = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const errorLogQuery = { Timestamp: { $lt: logRetentionAgo } };
  if (isExecute) {
    const errorResult = await ErrorLog.deleteMany(errorLogQuery);
    deletedCounts.errorLogs = errorResult.deletedCount;
  } else {
    deletedCounts.errorLogs = await ErrorLog.countDocuments(errorLogQuery);
  }

  // 3. Delete audit logs older than retention days
  const auditRetentionAgo = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const auditLogQuery = { Timestamp: { $lt: auditRetentionAgo } };
  if (isExecute) {
    const auditResult = await AuditLog.deleteMany(auditLogQuery);
    deletedCounts.auditLogs = auditResult.deletedCount;
  } else {
    deletedCounts.auditLogs = await AuditLog.countDocuments(auditLogQuery);
  }

  // 4. Note: Expired OTPs and Sessions are auto-deleted by MongoDB TTL indexes
  // 5. Delete old submission queues (expired)
  const queueQuery = { expiresAt: { $lt: now } };
  if (isExecute) {
    const queueResult = await SubmissionQueue.deleteMany(queueQuery);
    deletedCounts.submissionQueues = queueResult.deletedCount;
  } else {
    deletedCounts.submissionQueues = await SubmissionQueue.countDocuments(queueQuery);
  }

  console.log('\nItems to delete' + (isDryRun ? ' (preview)' : ':'));
  console.log('  Used OTPs (older than 1d):', deletedCounts.otps);
  console.log('  Old error logs:', deletedCounts.errorLogs);
  console.log('  Old audit logs:', deletedCounts.auditLogs);
  console.log('  Expired submission queues:', deletedCounts.submissionQueues);
  console.log('  (Expired OTPs and sessions auto-deleted by TTL)');

  const afterCounts = isExecute ? await getCollectionCounts() : {
    otps: beforeCounts.otps - deletedCounts.otps,
    sessions: beforeCounts.sessions,
    errorLogs: beforeCounts.errorLogs - deletedCounts.errorLogs,
    auditLogs: beforeCounts.auditLogs - deletedCounts.auditLogs,
    submissionQueues: beforeCounts.submissionQueues - deletedCounts.submissionQueues
  };
  console.log('\nAfter cleanup counts:');
  console.log('  OTPs:', afterCounts.otps);
  console.log('  Sessions:', afterCounts.sessions);
  console.log('  Error logs:', afterCounts.errorLogs);
  console.log('  Audit logs:', afterCounts.auditLogs);
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
