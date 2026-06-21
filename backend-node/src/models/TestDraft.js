const mongoose = require('mongoose');

const TestDraftSchema = new mongoose.Schema({
  DraftID: {
    type: String,
    required: true,
    unique: true
  },
  AdminUserID: {
    type: String,
    default: ''
  },
  DraftName: {
    type: String,
    required: true
  },
  TestDataJSON: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  QuestionsJSON: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  Status: {
    type: String,
    default: 'DRAFT'
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  },
  LastSavedAt: {
    type: Date,
    default: Date.now
  },
  CommittedTestID: {
    type: String,
    default: null
  },
  IsDeleted: {
    type: Boolean,
    default: false
  },
  DeletedAt: {
    type: Date,
    default: null
  },
  CompletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TestDraft', TestDraftSchema);
