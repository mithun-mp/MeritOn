
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const UserSchema = new mongoose.Schema({
  UserID: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return 'U' + uuidv4().substr(0, 8).toUpperCase();
    }
  },
  FullName: {
    type: String,
    required: true
  },
  UnivID: {
    type: String,
    required: true,
    unique: true
  },
  Email: {
    type: String,
    required: true,
    unique: true
  },
  Phone: {
    type: String,
    required: true
  },
  College: {
    type: String,
    default: ''
  },
  Department: {
    type: String,
    required: true
  },
  Year: {
    type: String,
    required: true
  },
  Password: {
    type: String,
    required: true
  },
  Role: {
    type: String,
    default: 'student'
  },
  Status: {
    type: String,
    default: 'active'
  },
  EmailVerified: {
    type: Boolean,
    default: false
  },
  ExamNotifications: {
    type: Boolean,
    default: true
  },
  ResultNotifications: {
    type: Boolean,
    default: true
  },
  LastExamNotification: {
    type: Date,
    default: null
  },
  LastResultNotification: {
    type: Date,
    default: null
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  LastLogin: {
    type: Date,
    default: null
  },
  LastLoginIP: {
    type: String,
    default: ''
  },
  ProfilePhoto: {
    type: String,
    default: ''
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
  timestamps: true
});

// High-Performance Query Indexes
UserSchema.index({ IsDeleted: 1 });
UserSchema.index({ Status: 1 });
UserSchema.index({ Department: 1, Year: 1 });

module.exports = mongoose.model('User', UserSchema);

module.exports = mongoose.model('User', UserSchema);

