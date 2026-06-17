const mongoose = require('mongoose');

const ErrorLogSchema = new mongoose.Schema({
  Timestamp: {
    type: Date,
    default: Date.now
  },
  Severity: {
    type: String,
    default: 'ERROR'
  },
  Function: {
    type: String,
    required: true
  },
  Error: {
    type: String,
    required: true
  },
  UserID: {
    type: String,
    default: ''
  },
  TestID: {
    type: String,
    default: ''
  },
  ExecutionTime: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ErrorLog', ErrorLogSchema);
