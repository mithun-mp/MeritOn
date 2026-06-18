const mongoose = require('mongoose');

const TestSchema = new mongoose.Schema({
  TestID: {
    type: String,
    required: true,
    unique: true
  },
  Name: {
    type: String,
    required: true
  },
  Date: {
    type: Date,
    required: true
  },
  StartTime: {
    type: String,
    required: true
  },
  EndTime: {
    type: String,
    required: true
  },
  Duration: {
    type: Number,
    required: true
  },
  Sections: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  Mode: {
    type: String,
    required: true
  },
  ExpiryTime: {
    type: String,
    required: true
  },
  ExamType: {
    type: String,
    default: 'standard'
  },
  QuickResult: {
    type: Boolean,
    default: false
  },
  IsDeleted: {
    type: Boolean,
    default: false
  },
  DeletedAt: {
    type: Date,
    default: null
  },
  AnswerKeyPublished: {
    type: Boolean,
    default: false
  },
  AnswerKeyPublishedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for Test
TestSchema.index({ TestID: 1 }, { unique: true });
TestSchema.index({ IsDeleted: 1 });

module.exports = mongoose.model('Test', TestSchema);
