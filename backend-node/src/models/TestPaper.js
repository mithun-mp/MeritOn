const mongoose = require('mongoose');

// Section Name & Difficulty Normalizers
const normalizeSectionName = (name) => {
  if (!name || typeof name !== 'string') return 'General';
  let clean = name.trim();
  clean = clean.replace(/([a-zA-Z0-9])\(/g, '$1 (');
  clean = clean.replace(/\s+/g, ' ');
  return clean || 'General';
};

const normalizeDifficultyValue = (val) => {
  if (!val || typeof val !== 'string') return 'Medium';
  const clean = val.trim().toLowerCase();
  if (['easy', 'ez', '1', 'low'].includes(clean)) return 'Easy';
  if (['medium', 'med', 'normal', '2', 'moderate'].includes(clean)) return 'Medium';
  if (['hard', 'difficult', 'diff', 'complex', '3', 'high'].includes(clean)) return 'Hard';
  return 'Medium';
};

const cleanMediaObject = (media) => {
  if (!media) return null;
  if (typeof media === 'object') {
    if (media.type === 'none' || (!media.url && !media.publicId)) {
      return null;
    }
  }
  return media;
};

const cleanOptionMediaObject = (optMedia) => {
  if (!optMedia) return null;
  const cleaned = {};
  let hasValid = false;
  ['A', 'B', 'C', 'D'].forEach(key => {
    if (optMedia[key] && optMedia[key].type !== 'none' && (optMedia[key].url || optMedia[key].publicId)) {
      cleaned[key] = optMedia[key];
      hasValid = true;
    }
  });
  return hasValid ? cleaned : null;
};

const QuestionSubSchema = new mongoose.Schema({
  qid: {
    type: String,
    required: true
  },
  section: {
    type: String,
    required: true,
    set: normalizeSectionName
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium',
    set: normalizeDifficultyValue
  },
  question: {
    type: String,
    default: '',
    required: [true, 'Question text is required']
  },
  questionMedia: {
    type: Object,
    default: null,
    set: cleanMediaObject
  },
  options: {
    A: { type: String, default: '' },
    B: { type: String, default: '' },
    C: { type: String, default: '' },
    D: { type: String, default: '' }
  },
  optionMedia: {
    type: Object,
    default: null,
    set: cleanOptionMediaObject
  },
  correct: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  marks: {
    type: Number,
    default: 1,
    min: [0, 'Marks cannot be negative']
  },
  negativeMarks: {
    type: Number,
    default: 0,
    min: [0, 'Negative marks cannot be negative']
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
  name: { type: String, required: true, set: normalizeSectionName },
  count: { type: Number, required: true, default: 0 },
  totalMarks: { type: Number, required: true, default: 0 }
}, { _id: false });

const TestPaperSchema = new mongoose.Schema({
  schemaVersion: {
    type: Number,
    default: 1,
    required: true
  },
  TestID: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  meta: {
    name: { type: String, required: [true, 'Test Name is required'], trim: true },
    date: { type: Date, required: [true, 'Test Date is required'] },
    startTime: { type: String, required: [true, 'Start Time is required'] },
    expiryTime: { type: String, required: [true, 'Expiry Time is required'] },
    duration: { type: Number, required: true, min: [1, 'Duration must be greater than 0'] },
    mode: { type: String, required: true, default: 'online' },
    examType: { type: String, default: 'standard' },
    status: {
      type: String,
      enum: ['Draft', 'Scheduled', 'Live', 'Completed', 'Expired', 'Archived'],
      default: 'Scheduled'
    },
    quickResult: { type: Boolean, default: false },
    liveLeaderboardEnabled: { type: Boolean, default: true },
    answerKeyPublished: { type: Boolean, default: false },
    answerKeyPublishedAt: { type: Date, default: null },
    allowQuestionPaperDownload: { type: Boolean, default: false },
    target: {
      department: { type: String, default: '' },
      year: { type: String, default: '' },
      batch: { type: String, default: '' }
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: String, default: 'admin' },
    updatedBy: { type: String, default: 'admin' },
    lastEditedBy: { type: String, default: 'admin' }
  },
  sections: [SectionSubSchema],
  questions: [QuestionSubSchema],
  stats: {
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    sectionCount: { type: Number, default: 0 },
    questionsPerSection: { type: mongoose.Schema.Types.Mixed, default: {} },
    difficultyCount: {
      Easy: { type: Number, default: 0 },
      Medium: { type: Number, default: 0 },
      Hard: { type: Number, default: 0 }
    },
    averageMarksPerQuestion: { type: Number, default: 0 },
    difficultyPercentage: {
      Easy: { type: Number, default: 0 },
      Medium: { type: Number, default: 0 },
      Hard: { type: Number, default: 0 }
    }
  }
}, {
  timestamps: true
});

// Indexes for High-Performance Queries
TestPaperSchema.index({ 'meta.isDeleted': 1 });
TestPaperSchema.index({ 'meta.date': 1 });
TestPaperSchema.index({ 'meta.status': 1 });
TestPaperSchema.index({ 'meta.mode': 1 });
TestPaperSchema.index({ 'questions.qid': 1 });
TestPaperSchema.index({ createdAt: 1 });
TestPaperSchema.index({ updatedAt: 1 });

// Helper to calculate status automatically
function computeTestStatus(meta) {
  if (meta.status && ['Draft', 'Archived'].includes(meta.status)) {
    return meta.status;
  }
  try {
    const now = new Date();
    const testDateStr = meta.date ? new Date(meta.date).toISOString().split('T')[0] : null;
    if (!testDateStr || !meta.startTime || !meta.expiryTime) {
      return 'Draft';
    }
    const startDateTime = new Date(`${testDateStr}T${meta.startTime}:00`);
    const expiryDateTime = new Date(`${testDateStr}T${meta.expiryTime}:00`);

    if (now < startDateTime) {
      return 'Scheduled';
    } else if (now >= startDateTime && now <= expiryDateTime) {
      return 'Live';
    } else {
      return 'Completed';
    }
  } catch (e) {
    return meta.status || 'Scheduled';
  }
}

// Pre-save Middleware: Normalization, Section Rebuilding, Stats Recalculation & Status Computation
TestPaperSchema.pre('save', function(next) {
  try {
    const testPaper = this;

    // 1. Ensure Schema Version
    testPaper.schemaVersion = 1;

    // 2. Validate Question QID Uniqueness
    const qidSet = new Set();
    if (Array.isArray(testPaper.questions)) {
      for (const q of testPaper.questions) {
        if (!q.isDeleted) {
          if (qidSet.has(q.qid)) {
            return next(new Error(`Duplicate QID '${q.qid}' found inside test questions`));
          }
          qidSet.add(q.qid);

          // Normalize section & difficulty
          q.section = normalizeSectionName(q.section);
          q.difficulty = normalizeDifficultyValue(q.difficulty);

          // Clean empty media objects to null
          q.questionMedia = cleanMediaObject(q.questionMedia);
          q.optionMedia = cleanOptionMediaObject(q.optionMedia);
        }
      }
    }

    // 3. Recalculate Sections and Stats automatically
    const activeQuestions = (testPaper.questions || []).filter(q => !q.isDeleted);
    let totalMarks = 0;
    const difficultyCount = { Easy: 0, Medium: 0, Hard: 0 };
    const questionsPerSection = {};
    const sectionsMap = {};

    activeQuestions.forEach(q => {
      const sec = normalizeSectionName(q.section);
      const diff = normalizeDifficultyValue(q.difficulty);
      const marks = Number(q.marks) || 0;

      difficultyCount[diff] = (difficultyCount[diff] || 0) + 1;
      totalMarks += marks;

      if (!sectionsMap[sec]) {
        sectionsMap[sec] = { name: sec, count: 0, totalMarks: 0 };
      }
      sectionsMap[sec].count++;
      sectionsMap[sec].totalMarks += marks;
      questionsPerSection[sec] = (questionsPerSection[sec] || 0) + 1;
    });

    const totalQuestions = activeQuestions.length;
    const sectionCount = Object.keys(sectionsMap).length;
    const averageMarksPerQuestion = totalQuestions > 0 ? Number((totalMarks / totalQuestions).toFixed(2)) : 0;
    const difficultyPercentage = {
      Easy: totalQuestions > 0 ? Number(((difficultyCount.Easy / totalQuestions) * 100).toFixed(1)) : 0,
      Medium: totalQuestions > 0 ? Number(((difficultyCount.Medium / totalQuestions) * 100).toFixed(1)) : 0,
      Hard: totalQuestions > 0 ? Number(((difficultyCount.Hard / totalQuestions) * 100).toFixed(1)) : 0
    };

    testPaper.sections = Object.values(sectionsMap);
    testPaper.stats = {
      totalQuestions,
      totalMarks,
      sectionCount,
      questionsPerSection,
      difficultyCount,
      averageMarksPerQuestion,
      difficultyPercentage
    };

    // 4. Compute Status
    if (testPaper.meta) {
      testPaper.meta.status = computeTestStatus(testPaper.meta);
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('TestPaper', TestPaperSchema);