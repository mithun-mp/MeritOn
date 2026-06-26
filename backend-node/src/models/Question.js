const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  TestID: {
    type: String,
    required: true
  },
  Section: {
    type: String,
    required: true
  },
  QID: {
    type: String,
    required: true
  },
  Difficulty: {
    type: String,
    required: true
  },
  Question: {
    type: String,
    required: true
  },
  A: {
    type: String,
    required: true
  },
  B: {
    type: String,
    required: true
  },
  C: {
    type: String,
    required: true
  },
  D: {
    type: String,
    required: true
  },
  Correct: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  Marks: {
    type: Number,
    default: 1
  },
  NegativeMarks: {
    type: Number,
    default: 0
  },
  IsDeleted: {
    type: Boolean,
    default: false
  },
  DeletedAt: {
    type: Date,
    default: null
  }
}, {
  collection: 'questions',
  autoCreate: false,
  autoIndex: false,
  timestamps: true
});

// Indexes for Question (disabled autoIndex)
// QuestionSchema.index({ TestID: 1, IsDeleted: 1 });
// QuestionSchema.index({ TestID: 1, QID: 1 }, { unique: true });

module.exports = mongoose.model('Question', QuestionSchema);
