const mongoose = require('mongoose');

const PerformanceSchema = new mongoose.Schema({
  userID: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  Email: {
    type: String,
    required: true
  },
  TestId: {
    type: String,
    required: true
  },
  TotalScore: {
    type: Number,
    required: true
  },
  TotalQuestions: {
    type: Number,
    required: true
  },
  SectionAnalyticsJSON: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  CorrectCount: {
    type: Number,
    required: true
  },
  WrongCount: {
    type: Number,
    required: true
  },
  UnansweredCount: {
    type: Number,
    required: true
  },
  SubmittedAt: {
    type: Date,
    required: true
  },
  ResultPublished: {
    type: Boolean,
    default: false
  },
  PublishedAt: {
    type: Date,
    default: null
  },
  StartedAt: {
    type: Date,
    default: null
  },
  TotalTimeTaken: {
    type: Number,
    required: true
  },
  AutoSubmitted: {
    type: Boolean,
    default: false
  },
  FullScreenViolations: {
    type: Number,
    default: 0
  },
  TabSwitchCount: {
    type: Number,
    default: 0
  },
  State: {
    type: String,
    required: true
  },
  NetScore: {
    type: Number,
    required: true
  },
  Rank: {
    type: Number,
    default: null
  },
  Percentile: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

PerformanceSchema.index({ userID: 1, TestId: 1 }, { unique: true });

module.exports = mongoose.model('Performance', PerformanceSchema);
