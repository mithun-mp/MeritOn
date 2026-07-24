
const User = require('../models/User');
const OTP = require('../models/OTP');
const Session = require('../models/Session');
const ErrorLog = require('../models/ErrorLog');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/emailService');

const isDev = process.env.NODE_ENV !== 'production';
const MAX_OTP_PER_HOUR = 5;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.charAt(0)}***@${domain}`;
}

function registrationOtpTemplate(otp) {
  return {
    subject: 'MeritOn Verification Code',
    text: `Your MeritOn verification code is: ${otp}\nThis code will expire in 10 minutes.\nDo not share this code with anyone.\n\nRegards,\nMeritOn Team`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1a237e, #0d47a1); color: #ffffff; padding: 30px; text-align: center;">
          <h1 style="margin:0; font-size:28px;">MeritOn</h1>
          <p style="margin: 10px 0 0; opacity:0.9;">Secure Online Assessments</p>
        </div>
        <div style="padding: 30px; line-height:1.7;">
          <p style="font-size:18px;">Dear User,</p>
          <p>Your verification code for MeritOn registration is:</p>
          <div style="background:#f0f4ff; border:2px dashed #1a237e; border-radius:8px; padding:25px; margin:25px 0; text-align:center;">
            <span style="font-size:42px; font-weight:bold; color:#1a237e; letter-spacing:8px;">${otp}</span>
          </div>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p style="background:#fff3cd; border-left:4px solid #ffc107; padding:15px; margin:20px 0;">
            <strong>⚠️ Security Warning:</strong> Do not share this OTP with anyone. MeritOn staff will never ask for your OTP.
          </p>
        </div>
        <div style="background:#f8f9fa; padding:20px; text-align:center; font-size:14px; color:#666;">
          <p>Regards,<br><strong>MeritOn Team</strong></p>
        </div>
      </div>
    `
  };
}

function passwordResetOtpTemplate(otp) {
  return {
    subject: 'MeritOn Password Reset Code',
    text: `Your MeritOn password reset code is: ${otp}\nThis code will expire in 10 minutes.\nDo not share this code with anyone.\n\nRegards,\nMeritOn Team`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #d32f2f, #c62828); color: #ffffff; padding: 30px; text-align: center;">
          <h1 style="margin:0; font-size:28px;">MeritOn</h1>
          <p style="margin: 10px 0 0; opacity:0.9;">Password Reset</p>
        </div>
        <div style="padding: 30px; line-height:1.7;">
          <p style="font-size:18px;">Dear User,</p>
          <p>Your password reset code for MeritOn is:</p>
          <div style="background:#fff3f3; border:2px dashed #c62828; border-radius:8px; padding:25px; margin:25px 0; text-align:center;">
            <span style="font-size:42px; font-weight:bold; color:#c62828; letter-spacing:8px;">${otp}</span>
          </div>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p style="background:#fff3cd; border-left:4px solid #ffc107; padding:15px; margin:20px 0;">
            <strong>⚠️ Security Warning:</strong> Do not share this OTP with anyone. MeritOn staff will never ask for your OTP.
          </p>
        </div>
        <div style="background:#f8f9fa; padding:20px; text-align:center; font-size:14px; color:#666;">
          <p>Regards,<br><strong>MeritOn Team</strong></p>
        </div>
      </div>
    `
  };
}

async function checkRateLimit(email) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await OTP.countDocuments({
    email,
    createdAt: { $gte: oneHourAgo }
  });
  return count < MAX_OTP_PER_HOUR;
}

async function sendOTP(email, type) {
  try {
    console.log(`[OTP] Request for ${type} OTP to ${maskEmail(email)}`);

    // Rate limiting check
    const canSend = await checkRateLimit(email);
    if (!canSend) {
      console.log(`[OTP] Rate limit exceeded for ${maskEmail(email)}`);
      return { success: false, error: 'Too many OTP requests. Please try again later.' };
    }

    // Delete any existing OTP for this email and type
    await OTP.deleteMany({ email, type });
    const otp = generateOTP();
    // Save OTP
    await OTP.create({
      email,
      otp,
      type
    });

    // Send email (may be skipped due to maintenance mode)
    const template = type === 'registration' ? registrationOtpTemplate(otp) : passwordResetOtpTemplate(otp);
    const emailResult = await sendEmail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html
    });

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'sendOTP',
      UserID: email,
      Details: type
    });

    console.log(`[OTP] Sent ${type} OTP to ${maskEmail(email)}`);

    // Always return success with OTP and beta info (mail sending may be skipped)
    return {
      success: true,
      message: "OTP generated successfully. Email delivery is part of an upcoming update.",
      otp: otp,
      betaOtp: otp,
      betaMessage: "Private beta: Email delivery is part of an upcoming update. This beta version allows you to get OTP directly here.",
      mailStatus: emailResult.mailStatus || "upcoming_update"
    };
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
    const otpDoc = await OTP.findOne({ email: Email, type: 'registration', otp: userOtp, used: false });
    if (!otpDoc || new Date() > otpDoc.expiresAt) {
      console.log(`[REGISTER] Invalid/expired OTP for ${maskEmail(Email)}`);
      return { success: false, error: 'Invalid or expired OTP' };
    }

    // Mark OTP as used
    otpDoc.used = true;
    await otpDoc.save();

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
      phone: user.Phone || '',
      college: user.College || '',
      department: user.Department || '',
      year: user.Year || '',
      avatar: user.avatar !== undefined ? user.avatar : 1,
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
    const otpDoc = await OTP.findOne({ email: user.Email, type: 'password_reset', otp, used: false });
    if (!otpDoc || new Date() > otpDoc.expiresAt) {
      console.log(`[RESET PASSWORD] Invalid/expired OTP for ${maskEmail(user.Email)}`);
      return { success: false, error: 'Invalid or expired OTP' };
    }

    // Mark OTP as used
    otpDoc.used = true;
    await otpDoc.save();

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.Password = hashedPassword;
    await user.save();

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

async function getCandidates(queryData = {}, sessionToken) {
  try {
    const session = await Session.findOne({ sessionToken });
    if (!session || session.role !== 'admin' || new Date() > session.expiresAt) {
      return { success: false, error: 'Unauthorized' };
    }

    const search = (queryData.search || '').trim();
    const query = {};

    if (search) {
      query.$or = [
        { FullName: { $regex: search, $options: 'i' } },
        { UnivID: { $regex: search, $options: 'i' } },
        { Email: { $regex: search, $options: 'i' } },
        { Department: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query).select('-Password').lean();
    const Performance = require('../models/Performance');

    const candidates = await Promise.all(users.map(async u => {
      const userId = u.UnivID || u.userID || String(u._id);
      const attemptCount = await Performance.countDocuments({
        $or: [{ userID: userId }, { UserID: userId }, { UnivID: userId }]
      });

      return {
        _id: u._id,
        userID: u.userID || u.UnivID || String(u._id),
        FullName: u.FullName || 'N/A',
        UnivID: u.UnivID || 'N/A',
        Email: u.Email || 'N/A',
        Phone: u.Phone || 'N/A',
        Department: u.Department || u.department || 'N/A',
        Year: u.Year || u.year || 'N/A',
        Batch: u.Batch || u.batch || 'N/A',
        avatar: u.avatar !== undefined ? u.avatar : 1,
        Role: u.role || 'candidate',
        Status: u.status || (u.isVerified ? 'Verified' : 'Registered'),
        JoinedDate: u.createdAt || u.CreatedDate || new Date(),
        AttemptCount: attemptCount
      };
    }));

    return {
      success: true,
      candidates,
      total: candidates.length
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'getCandidates',
      Error: err.message
    });
    return { success: false, error: err.message };
  }
}

async function updateUser(reqBody, sessionToken) {
  try {
    const data = reqBody.userData || reqBody;
    const userId = reqBody.userId || reqBody.userID || data.userId || data.userID || data.UnivID;

    let sessionUser = null;
    if (sessionToken) {
      sessionUser = await Session.findOne({ sessionToken });
    }

    const queryId = userId || (sessionUser ? sessionUser.userId : null);
    if (!queryId) {
      return { success: false, statusCode: 400, error: 'User identification is required' };
    }

    const user = await User.findOne({
      $or: [
        { UserID: queryId },
        { UnivID: queryId },
        { Email: queryId },
        ...(require('mongoose').Types.ObjectId.isValid(queryId) ? [{ _id: new (require('mongoose').Types.ObjectId)(queryId) }] : [])
      ]
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Avatar validation - MUST enforce 1..11 integer range
    if (data.avatar !== undefined && data.avatar !== null && data.avatar !== '') {
      const avatarVal = data.avatar;
      // Reject non-number, non-integer, 0, negative numbers, > 11, strings (if strict typeof number is enforced)
      if (typeof avatarVal !== 'number' || !Number.isInteger(avatarVal) || avatarVal < 1 || avatarVal > 11) {
        return {
          success: false,
          statusCode: 400,
          error: 'Invalid avatar value. Only integers from 1 to 11 are permitted for standard candidates.'
        };
      }
      user.avatar = avatarVal;
    }

    const { FullName, Phone, College, Department, Year, Password, oldPassword, newPassword } = data;

    if (FullName) user.FullName = FullName;
    if (Phone) user.Phone = Phone;
    if (College !== undefined) user.College = College;
    if (Department) user.Department = Department;
    if (Year) user.Year = Year;

    // Handle password change if provided
    const pwdToSet = newPassword || Password;
    if (pwdToSet && String(pwdToSet).trim().length > 0) {
      if (oldPassword) {
        const isMatch = await bcrypt.compare(oldPassword, user.Password);
        if (!isMatch && user.Password !== oldPassword) {
          return { success: false, statusCode: 400, error: 'Current password does not match' };
        }
      }
      user.Password = await bcrypt.hash(pwdToSet, 10);
    }

    await user.save();

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'updateUser',
      UserID: user._id.toString(),
      Details: 'Profile updated'
    });

    return {
      success: true,
      user: {
        userId: user._id.toString(),
        UserID: user.UserID,
        univId: user.UnivID,
        fullName: user.FullName,
        email: user.Email,
        phone: user.Phone || '',
        college: user.College || '',
        department: user.Department || '',
        year: user.Year || '',
        avatar: user.avatar !== undefined ? user.avatar : 1,
        role: user.Role
      }
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: 'updateUser',
      Error: err.message
    });
    return { success: false, error: err.message || 'Failed to update user profile' };
  }
}

module.exports = {
  sendOTP,
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getAllUsers,
  getCandidates,
  updateUser
};
