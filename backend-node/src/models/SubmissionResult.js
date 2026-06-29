const mongoose = require('mongoose');

const SectionStatsSchema = new mongoose.Schema({
  totalQuestions: Number,
  attemptedCount: Number,
  correctCount: Number,
  wrongCount: Number,
  unansweredCount: Number,
  rawScore: Number,
  negativeScore: Number,
  netScore: Number,
  maxPossibleScore: Number,
  scorePercentile: Number,
  accuracyPercent: Number,
  attemptPercent: Number
});

const DifficultyStatsSchema = new mongoose.Schema({
  totalQuestions: Number,
  attemptedCount: Number,
  correctCount: Number,
  wrongCount: Number,
  unansweredCount: Number,
  rawScore: Number,
  negativeScore: Number,
  netScore: Number,
  maxPossibleScore: Number,
  scorePercentile: Number,
  accuracyPercent: Number,
  attemptPercent: Number
});

const AnswerSchema = new mongoose.Schema({
  qid: String,
  section: String,
  difficulty: String,
  selected: mongoose.Schema.Types.Mixed,
  correctAnswer: mongoose.Schema.Types.Mixed,
  isCorrect: Boolean,
  isUnanswered: Boolean,
  marks: Number,
  negativeMarks: Number,
  scoreAwarded: Number
});

const SubmissionResultSchema = new mongoose.Schema({
  userID: { type: String, required: true },
  TestId: { type: String, required: true },
  candidate: {
    name: String,
    email: String,
    univId: String
  },
  test: {
    name: String,
    date: String,
    durationMinutes: Number,
    maxPossibleScore: Number,
    totalQuestions: Number
  },
  timing: {
    startedAt: Date,
    submittedAt: Date,
    serverReceivedAt: Date,
    totalTimeTakenSeconds: Number,
    totalTimeTakenMinutes: Number,
    allowedDurationSeconds: Number,
    overtimeSeconds: Number,
    submittedBeforeTime: Boolean,
    autoSubmitted: Boolean
  },
  summary: {
    totalQuestions: Number,
    attemptedCount: Number,
    correctCount: Number,
    wrongCount: Number,
    unansweredCount: Number,
    rawScore: Number,
    negativeScore: Number,
    netScore: Number,
    maxPossibleScore: Number,
    scorePercentile: Number,
    accuracyPercent: Number,
    attemptPercent: Number,
    state: String
  },
  sections: mongoose.Schema.Types.Mixed,
  difficulty: {
    Easy: DifficultyStatsSchema,
    Medium: DifficultyStatsSchema,
    Hard: DifficultyStatsSchema,
    Unknown: DifficultyStatsSchema
  },
  answers: [AnswerSchema],
  violations: {
    fullScreenViolations: Number,
    tabSwitchCount: Number,
    suspiciousScore: Number,
    autoSubmitted: Boolean,
    fullScreenDeduction: { type: Number, default: 0 },
    tabSwitchDeduction: { type: Number, default: 0 },
    deductionReason: { type: String, default: "" },
    deductionUpdatedAt: Date,
    deductionUpdatedBy: { type: String, default: "" }
  },
  result: {
    published: Boolean,
    publishedAt: Date,
    emailSent: Boolean,
    emailSentAt: Date
  },
  ranking: {
    rank: Number,
    totalCandidates: Number,
    rankPercentile: Number,
    calculatedAt: Date
  }
}, {
  timestamps: true
});

// Indexes
SubmissionResultSchema.index({ userID: 1, TestId: 1 }, { unique: true });
SubmissionResultSchema.index({ TestId: 1, 'summary.netScore': -1 });
SubmissionResultSchema.index({ TestId: 1, 'summary.scorePercentile': -1 });
SubmissionResultSchema.index({ TestId: 1, 'result.published': 1 });
SubmissionResultSchema.index({ userID: 1, 'timing.submittedAt': -1 });
SubmissionResultSchema.index({ TestId: 1, 'ranking.rank': 1 });

module.exports = mongoose.model('SubmissionResult', SubmissionResultSchema);
