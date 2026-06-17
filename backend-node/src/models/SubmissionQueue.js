const mongoose = require('mongoose');

const SubmissionQueueSchema = new mongoose.Schema({
  Timestamp: {
    type: Date,
    default: Date.now
  },
  UserID: {
    type: String,
    required: true
  },
  TestId: {
    type: String,
    required: true
  },
  Payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  Status: {
    type: String,
    default: 'PENDING'
  },
  Result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SubmissionQueue', SubmissionQueueSchema);
