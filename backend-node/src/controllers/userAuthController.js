
const User = require('../models/User');
const OTP = require('../models/OTP');
const Session = require('../models/Session');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTP(email, type) {
  try {
    // Delete any existing OTP for this email and type
    await OTP.deleteMany({ email, type });
    const otp = generateOTP();
    // Save OTP
    const otpDoc = await OTP.create({
      email,
      otp,
      type
    });

    // Log OTP to console for development
    console.log(`[DEV MODE] OTP sent to ${email}: ${otp}`);

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'sendOTP',
      UserID: email,
      Details: type
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'sendOTP',
      Error: err.message
    });
    return { success: false, error: 'Failed to send OTP' };
  }
}

async function registerUser(userData) {
  try {
    const { FullName, UnivID, Email, Phone, Department, Year, Password, OTP: userOtp, Role } = userData;

    // Validate OTP
    const otpDoc = await OTP.findOne({ email: Email, type: 'registration', otp: userOtp });
    if (!otpDoc || new Date() > otpDoc.expiresAt) {
      return { success: false, error: 'Invalid or expired OTP' };
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ Email }, { UnivID }]
    });
    if (existingUser) {
      return { success: false, error: 'User already exists' };
    }

    // Create user
    const user = await User.create({
      FullName,
      UnivID,
      Email,
      Phone,
      Department,
      Year,
      Password,
      Role
    });

    // Delete used OTP
    await OTP.deleteOne({ _id: otpDoc._id });

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'registerUser',
      UserID: user._id.toString(),
      Details: 'User registered'
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'registerUser',
      Error: err.message
    });
    return { success: false, error: 'Registration failed' };
  }
}

async function loginUser(email, password, ip) {
  try {
    // Find user by email or UnivID
    const user = await User.findOne({
      $or: [{ Email: email }, { UnivID: email }]
    });
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Check password
    let passwordValid = false;
    if (user.Password.startsWith('$2a$') || user.Password.startsWith('$2b$') || user.Password.startsWith('$2y$')) {
      passwordValid = await bcrypt.compare(password, user.Password);
    } else {
      // Plaintext compatibility
      passwordValid = user.Password === password;
    }
    if (!passwordValid) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Create session
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await Session.create({
      sessionToken,
      userId: user._id.toString(),
      role: user.Role,
      expiresAt
    });

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'loginUser',
      UserID: user._id.toString(),
      Details: ip || 'Unknown'
    });

    return {
      success: true,
      userId: user._id.toString(),
      univId: user.UnivID,
      fullName: user.FullName,
      email: user.Email,
      role: user.Role,
      status: 'active',
      lastLoginIP: ip,
      sessionToken
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'loginUser',
      Error: err.message
    });
    return { success: false, error: 'Login failed' };
  }
}

async function forgotPassword(identifier) {
  try {
    // Find user by email or UnivID
    const user = await User.findOne({
      $or: [{ Email: identifier }, { UnivID: identifier }]
    });
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Generate OTP for password reset
    const result = await sendOTP(user.Email, 'password_reset');
    return result;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'forgotPassword',
      Error: err.message
    });
    return { success: false, error: 'Failed to send reset OTP' };
  }
}

async function resetPassword(identifier, otp, newPassword) {
  try {
    // Find user
    const user = await User.findOne({
      $or: [{ Email: identifier }, { UnivID: identifier }]
    });
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Validate OTP
    const otpDoc = await OTP.findOne({ email: user.Email, type: 'password_reset', otp });
    if (!otpDoc || new Date() > otpDoc.expiresAt) {
      return { success: false, error: 'Invalid or expired OTP' };
    }

    // Update password
    user.Password = newPassword;
    await user.save();

    // Delete used OTP
    await OTP.deleteOne({ _id: otpDoc._id });

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'resetPassword',
      UserID: user._id.toString(),
      Details: 'Password reset'
    });

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'resetPassword',
      Error: err.message
    });
    return { success: false, error: 'Password reset failed' };
  }
}

async function getAllUsers(sessionToken) {
  try {
    const session = await Session.findOne({ sessionToken });
    if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
      return { success: false, error: 'Unauthorized' };
    }

    const users = await User.find({}, { Password: 0 }); // Exclude password
    return users;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getAllUsers',
      Error: err.message
    });
    return { success: false, error: 'Failed to get users' };
  }
}

module.exports = {
  sendOTP,
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getAllUsers
};

