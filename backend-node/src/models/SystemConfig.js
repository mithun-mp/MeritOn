const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  updatedBy: {
    type: String,
    default: 'admin'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Single-field unique index on config key
SystemConfigSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
