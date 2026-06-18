
const User = require('../models/User');
const OTP = require('../models/OTP');
const Session = require('../models/Session');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/emailService');

const isDev = process.env.NODE_ENV !== 'production';

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.charAt(0)}***@${domain}`;
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

    // Send email
    const subject = type === 'registration' 
      ? 'Your Registration OTP' 
      : 'Your Password Reset OTP';
    const text = `Your OTP is: ${otp}`;
    const html = `<p>Your OTP is: <strong>${otp}</strong></p>`;
    await sendEmail({ to: email, subject, text, html });

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'sendOTP',
      UserID: email,
      Details: type
    });

    // Debug log
    console.log(`[OTP] Sent ${type} OTP to ${maskEmail(email)}`);
    if (isDev) {
      console.log(`[OTP] DEV MODE: OTP is ${otp}`);
    }

    const response = { success: true };
    if (isDev) {
      response.otp = otp; // Return OTP in dev mode for testing
    }
    return response;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'sendOTP',
      Error: err.message
    });
    console.error(`[OTP] Failed to send OTP to ${maskEmail(email)}:`, err.message);
    return { success: false, error: 'Failed to send OTP' };
  }
}

async function registerUser(reqBody) {
  try {
    // Handle both nested userData and flat structure
    const data = reqBody.userData || reqBody;
    const { FullName, UnivID, Email, Phone, Department, Year, Password, OTP: userOtp, Role } = data;

    console.log(`[REGISTER] Attempting registration for ${maskEmail(Email)} (UnivID: ${UnivID})`);

    // Validate OTP
    const otpDoc = await OTP.findOne({ email: Email, type: 'registration', otp: userOtp });
    if (!otpDoc || new Date() > otpDoc.expiresAt) {
      console.log(`[REGISTER] Invalid/expired OTP for ${maskEmail(Email)}`);
      return { success: false, error: 'Invalid or expired OTP' };
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ Email }, { UnivID }]
    });
    if (existingUser) {
      console.log(`[REGISTER] User already exists for ${maskEmail(Email)}`);
      return { success: false, error: 'User already exists' };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(Password, 10);

    // Create user
    const user = await User.create({
      FullName,
      UnivID,
      Email,
      Phone,
      Department,
      Year,
      Password: hashedPassword,
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

    console.log(`[REGISTER] Successfully registered user: ${maskEmail(Email)}`);

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'registerUser',
      Error: err.message
    });
    console.error('[REGISTER] Registration failed:', err.message);
    return { success: false, error: 'Registration failed' };
  }
}

async function loginUser(email, password, ip) {
  try {
    console.log(`[LOGIN] Attempting login for ${maskEmail(email)}`);

    // Find user by email or UnivID
    const user = await User.findOne({
      $or: [{ Email: email }, { UnivID: email }]
    });
    if (!user) {
      console.log(`[LOGIN] User not found for ${maskEmail(email)}`);
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
      console.log(`[LOGIN] Invalid password for ${maskEmail(email)}`);
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

    console.log(`[LOGIN] Successfully logged in user: ${maskEmail(email)}`);

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
    console.error('[LOGIN] Login failed:', err.message);
    return { success: false, error: 'Login failed' };
  }
}

async function forgotPassword(identifier) {
  try {
    console.log(`[FORGOT PASSWORD] Attempting for identifier: ${identifier}`);

    // Find user by email or UnivID
    const user = await User.findOne({
      $or: [{ Email: identifier }, { UnivID: identifier }]
    });
    if (!user) {
      console.log(`[FORGOT PASSWORD] User not found for identifier: ${identifier}`);
      return { success: false, error: 'User not found' };
    }

    // Generate OTP for password reset
    console.log(`[FORGOT PASSWORD] Sending reset OTP to ${maskEmail(user.Email)}`);
    const result = await sendOTP(user.Email, 'password_reset');
    return result;
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'forgotPassword',
      Error: err.message
    });
    console.error('[FORGOT PASSWORD] Failed:', err.message);
    return { success: false, error: 'Failed to send reset OTP' };
  }
}

async function resetPassword(identifier, otp, newPassword) {
  try {
    console.log(`[RESET PASSWORD] Attempting for identifier: ${identifier}`);

    // Find user
    const user = await User.findOne({
      $or: [{ Email: identifier }, { UnivID: identifier }]
    });
    if (!user) {
      console.log(`[RESET PASSWORD] User not found for identifier: ${identifier}`);
      return { success: false, error: 'User not found' };
    }

    // Validate OTP
    const otpDoc = await OTP.findOne({ email: user.Email, type: 'password_reset', otp });
    if (!otpDoc || new Date() > otpDoc.expiresAt) {
      console.log(`[RESET PASSWORD] Invalid/expired OTP for ${maskEmail(user.Email)}`);
      return { success: false, error: 'Invalid or expired OTP' };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.Password = hashedPassword;
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

    console.log(`[RESET PASSWORD] Successfully reset password for ${maskEmail(user.Email)}`);

    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'resetPassword',
      Error: err.message
    });
    console.error('[RESET PASSWORD] Failed:', err.message);
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

