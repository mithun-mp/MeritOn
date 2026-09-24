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

// Indexes for audit log queries and sorting
AuditLogSchema.index({ Timestamp: -1 });
AuditLogSchema.index({ UserID: 1, Timestamp: -1 });
AuditLogSchema.index({ TestID: 1, Timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
