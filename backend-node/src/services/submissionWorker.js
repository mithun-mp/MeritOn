const SubmissionQueue = require('../models/SubmissionQueue');
const examController = require('../controllers/examController');
const ErrorLog = require('../models/ErrorLog');

const isDev = process.env.NODE_ENV !== 'production';
const POLL_INTERVAL = isDev ? 2000 : 5000; // 2s dev, 5s prod
const LOCK_TIMEOUT = 30000; // 30s

let isRunning = false;
let pollTimer = null;

async function processSingleSubmission() {
  const now = new Date();
  const lockCutoff = new Date(now.getTime() - LOCK_TIMEOUT);

  // Atomically lock a pending submission
  const submission = await SubmissionQueue.findOneAndUpdate(
    {
      status: 'pending',
      $or: [
        { lockedAt: null },
        { lockedAt: { $lt: lockCutoff } }
      ]
    },
    {
      $set: {
        status: 'processing',
        lockedAt: now,
        attempts: { $inc: 1 }
      }
    },
    { new: true, sort: { createdAt: 1 } }
  );

  if (!submission) {
    return;
  }

  console.log('[SubmissionWorker] Processing queueId:', submission.queueId, 'user:', submission.userID, 'test:', submission.TestId);

  try {
    // Process the submission using existing submitTest logic
    const result = await examController.submitTest(submission.payload);

    if (result.success) {
      submission.status = 'completed';
      submission.processedAt = now;
      submission.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Delete after 1 day
      submission.error = null;
      console.log('[SubmissionWorker] Processed queueId:', submission.queueId);
    } else {
      submission.status = 'failed';
      submission.error = result.error;
      console.error('[SubmissionWorker] Failed queueId:', submission.queueId, 'error:', result.error);
    }

    await submission.save();
  } catch (err) {
    submission.attempts += 1;
    if (submission.attempts >= submission.maxAttempts) {
      submission.status = 'failed';
      submission.error = err.message;
      submission.processedAt = now;
      submission.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Delete after 7 days
      console.error('[SubmissionWorker] Max attempts reached queueId:', submission.queueId, 'error:', err.message);
    } else {
      // Reset to pending to retry
      submission.status = 'pending';
      submission.lockedAt = null;
      console.warn('[SubmissionWorker] Retrying queueId:', submission.queueId, 'attempt:', submission.attempts, 'error:', err.message);
    }

    await ErrorLog.create({
      Timestamp: now,
      Function: 'submissionWorker',
      Error: err.message,
      UserID: submission.userID,
      TestID: submission.TestId
    });

    await submission.save();
  }
}

async function pollLoop() {
  if (!isRunning) return;
  try {
    await processSingleSubmission();
  } catch (err) {
    console.error('[SubmissionWorker] Poll error:', err);
  } finally {
    if (isRunning) {
      pollTimer = setTimeout(pollLoop, POLL_INTERVAL);
    }
  }
}

function startWorker() {
  if (isRunning) {
    console.log('[SubmissionWorker] Already running');
    return;
  }
  console.log('[SubmissionWorker] Starting worker');
  isRunning = true;
  pollLoop();
}

function stopWorker() {
  console.log('[SubmissionWorker] Stopping worker');
  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

module.exports = {
  startWorker,
  stopWorker
};
