const mongoose = require('mongoose');

const QuestionSubSchema = new mongoose.Schema({
  qid: {
    type: String,
    required: true
  },
  section: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    required: true
  },
  question: {
    type: String,
    required: true
  },
  questionMedia: {
    type: Object,
    default: () => ({
      type: 'none',
      url: '',
      publicId: '',
      alt: '',
      width: 0,
      height: 0,
      bytes: 0,
      format: '',
      provider: ''
    })
  },
  options: {
    A: { type: String, required: true },
    B: { type: String, required: true },
    C: { type: String, required: true },
    D: { type: String, required: true }
  },
  optionMedia: {
    type: Object,
    default: () => ({
      A: {
        type: 'none',
        url: '',
        publicId: '',
        alt: '',
        width: 0,
        height: 0,
        bytes: 0,
        format: '',
        provider: ''
      },
      B: {
        type: 'none',
        url: '',
        publicId: '',
        alt: '',
        width: 0,
        height: 0,
        bytes: 0,
        format: '',
        provider: ''
      },
      C: {
        type: 'none',
        url: '',
        publicId: '',
        alt: '',
        width: 0,
        height: 0,
        bytes: 0,
        format: '',
        provider: ''
      },
      D: {
        type: 'none',
        url: '',
        publicId: '',
        alt: '',
        width: 0,
        height: 0,
        bytes: 0,
        format: '',
        provider: ''
      }
    })
  },
  correct: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  marks: {
    type: Number,
    default: 1
  },
  negativeMarks: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { _id: false });

const SectionSubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  totalMarks: { type: Number, required: true, default: 0 }
}, { _id: false });

const TestPaperSchema = new mongoose.Schema({
  TestID: {
    type: String,
    required: true,
    unique: true
  },
  meta: {
    name: { type: String, required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    expiryTime: { type: String, required: true },
    duration: { type: Number, required: true },
    mode: { type: String, required: true },
    examType: { type: String, default: 'standard' },
    quickResult: { type: Boolean, default: false },
    liveLeaderboardEnabled: { type: Boolean, default: true },
    answerKeyPublished: { type: Boolean, default: false },
    answerKeyPublishedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  sections: [SectionSubSchema],
  questions: [QuestionSubSchema],
  stats: {
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    difficultyCount: {
      Easy: { type: Number, default: 0 },
      Medium: { type: Number, default: 0 },
      Hard: { type: Number, default: 0 },
      Unknown: { type: Number, default: 0 }
    },
    sectionCount: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }
}, {
  timestamps: true
});

// Indexes
TestPaperSchema.index({ TestID: 1 }, { unique: true });
TestPaperSchema.index({ 'meta.isDeleted': 1 });
TestPaperSchema.index({ 'meta.date': 1 });
TestPaperSchema.index({ 'meta.quickResult': 1 });
TestPaperSchema.index({ 'meta.liveLeaderboardEnabled': 1 });
TestPaperSchema.index({ 'questions.qid': 1 });

module.exports = mongoose.model('TestPaper', TestPaperSchema);