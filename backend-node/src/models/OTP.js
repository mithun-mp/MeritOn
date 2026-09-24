const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['registration', 'password_reset']
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes, TTL index below
  },
  used: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Add TTL index for expiresAt
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for createdAt for rate limiting
OTPSchema.index({ email: 1, createdAt: -1 });
// Index for OTP validation
OTPSchema.index({ email: 1, type: 1, used: 1 });

module.exports = mongoose.model('OTP', OTPSchema);
