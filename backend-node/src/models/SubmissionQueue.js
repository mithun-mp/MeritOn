const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SubmissionQueueSchema = new mongoose.Schema({
  queueId: {
    type: String,
    required: true,
    unique: true,
    default: uuidv4
  },
  userID: {
    type: String,
    required: true
  },
  TestId: {
    type: String,
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'duplicate'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  lockedAt: {
    type: Date,
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// TTL index for automatic cleanup
SubmissionQueueSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Unique index on userID + TestId to prevent duplicates
SubmissionQueueSchema.index({ userID: 1, TestId: 1 }, { unique: true });
// Index for worker polling
SubmissionQueueSchema.index({ status: 1, createdAt: 1 });
// Index for locking
SubmissionQueueSchema.index({ lockedAt: 1 });

module.exports = mongoose.model('SubmissionQueue', SubmissionQueueSchema);
