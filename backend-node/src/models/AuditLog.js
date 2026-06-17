const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  Timestamp: {
    type: Date,
    default: Date.now
  },
  Action: {
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
  Details: {
    type: mongoose.Schema.Types.Mixed,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
