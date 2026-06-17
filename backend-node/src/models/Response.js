const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  QID: {
    type: String,
    required: true
  },
  SelectedAnswer: {
    type: String,
    default: '',
    required: false
  },
  IsCorrect: {
    type: Boolean,
    required: true
  },
  IsUnanswered: {
    type: Boolean,
    required: true
  },
  Marks: {
    type: Number,
    required: true
  },
  NegativeMarks: {
    type: Number,
    required: true
  }
});

const ResponseSchema = new mongoose.Schema({
  userID: {
    type: String,
    required: true
  },
  TestId: {
    type: String,
    required: true
  },
  answers: {
    type: [AnswerSchema],
    required: true
  },
  SubmittedAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

ResponseSchema.index({ userID: 1, TestId: 1 }, { unique: true });
module.exports = mongoose.model('Response', ResponseSchema);
