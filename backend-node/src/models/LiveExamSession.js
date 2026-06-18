const mongoose = require('mongoose');

const LiveExamSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  userID: { type: String, required: true },
  TestId: { type: String, required: true },
  
  candidate: {
    name: String,
    email: String,
    univId: String,
    department: String,
    college: String,
    year: String
  },
  
  test: {
    name: String,
    date: Date,
    startTime: String,
    expiryTime: String,
    durationMinutes: Number
  },
  
  startedAt: { type: Date, required: true },
  lastHeartbeat: { type: Date, required: true },
  submittedAt: Date,
  
  progress: {
    currentQuestionIndex: { type: Number, default: 0 },
    answeredCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    remainingCount: { type: Number, default: 0 },
    progressPercent: { type: Number, default: 0 }
  },
  
  security: {
    fullScreenViolations: { type: Number, default: 0 },
    tabSwitchCount: { type: Number, default: 0 }
  },
  
  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'abandoned', 'expired'],
    default: 'in_progress'
  },
  
  resultSnapshot: {
    scorePercentile: Number,
    netScore: Number,
    correctCount: Number,
    wrongCount: Number,
    unansweredCount: Number,
    totalTimeTakenSeconds: Number,
    totalTimeTakenMinutes: Number
  },
  
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Unique index on userID + TestId
LiveExamSessionSchema.index({ userID: 1, TestId: 1 }, { unique: true });
// Indexes for efficient queries
LiveExamSessionSchema.index({ TestId: 1, status: 1 });
LiveExamSessionSchema.index({ TestId: 1, lastHeartbeat: -1 });
LiveExamSessionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('LiveExamSession', LiveExamSessionSchema);
