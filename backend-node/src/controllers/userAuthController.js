
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

    // Secure response: never disclose OTP, betaOtp, or internal secrets
    return {
      success: true,
      message: "Verification code sent to your registered email."
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

    // Check password: all user passwords must use bcrypt hashing
    let passwordValid = false;
    if (user.Password && (user.Password.startsWith('$2a$') || user.Password.startsWith('$2b$') || user.Password.startsWith('$2y$'))) {
      passwordValid = await bcrypt.compare(password, user.Password);
    } else {
      console.warn(`[LOGIN] Rejected non-bcrypt password for user: ${maskEmail(email)}`);
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

    // BLOCKER-006: Invalidate all existing sessions for this user upon password reset
    const userSessionIds = [String(user._id), user.UserID, user.UnivID, user.Email].filter(Boolean);
    const deletedSessions = await Session.deleteMany({ userId: { $in: userSessionIds } });
    console.log(`[RESET PASSWORD] Invalidation complete: Revoked ${deletedSessions.deletedCount} sessions for user ${user._id}`);

    // Log audit
    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'resetPassword',
      UserID: user._id.toString(),
      Details: 'Password reset and sessions revoked'
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

    const users = await User.find(query)
      .select('_id UserID UnivID FullName Email Phone Department Year Batch avatar Role role Status status isVerified CreatedAt createdAt CreatedDate')
      .lean();

    if (!users || users.length === 0) {
      return { success: true, candidates: [], total: 0 };
    }

    const Performance = require('../models/Performance');
    const SubmissionResult = require('../models/SubmissionResult');

    // Collect all candidate IDs and Emails for bulk querying
    const allIds = [];
    const allEmails = [];
    users.forEach(u => {
      if (u._id) allIds.push(String(u._id));
      if (u.UserID) allIds.push(u.UserID);
      if (u.UnivID) allIds.push(u.UnivID);
      if (u.Email) { allIds.push(u.Email); allEmails.push(u.Email.toLowerCase()); }
      if (u.email) { allIds.push(u.email); allEmails.push(u.email.toLowerCase()); }
    });

    const uniqueIds = Array.from(new Set(allIds));
    const uniqueEmails = Array.from(new Set(allEmails));

    // Aggregate attempt counts in database rather than transferring thousands of full documents to Node.js
    const [subCounts, perfCounts] = await Promise.all([
      SubmissionResult.aggregate([
        {
          $match: {
            $or: [
              { userID: { $in: uniqueIds } },
              { 'candidate.email': { $in: uniqueEmails } }
            ]
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$userID', '$candidate.email'] },
            count: { $sum: 1 }
          }
        }
      ]),
      Performance.aggregate([
        {
          $match: {
            $or: [
              { userID: { $in: uniqueIds } },
              { UserID: { $in: uniqueIds } },
              { UnivID: { $in: uniqueIds } }
            ]
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$userID', { $ifNull: ['$UserID', '$UnivID'] }] },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const subMap = new Map();
    for (const item of subCounts) {
      if (item._id) subMap.set(String(item._id).toLowerCase(), item.count);
    }
    const perfMap = new Map();
    for (const item of perfCounts) {
      if (item._id) perfMap.set(String(item._id).toLowerCase(), item.count);
    }

    const candidates = users.map(u => {
      const candidateKeys = [
        u._id ? String(u._id).toLowerCase() : null,
        u.UserID ? String(u.UserID).toLowerCase() : null,
        u.UnivID ? String(u.UnivID).toLowerCase() : null,
        u.Email ? String(u.Email).toLowerCase() : null,
        u.email ? String(u.email).toLowerCase() : null
      ].filter(Boolean);

      const uniqueCandidateKeys = Array.from(new Set(candidateKeys));

      let subCount = 0;
      let perfCount = 0;
      for (const key of uniqueCandidateKeys) {
        if (subMap.has(key)) {
          subCount += subMap.get(key);
        }
        if (perfMap.has(key)) {
          perfCount += perfMap.get(key);
        }
      }

      const attemptCount = Math.max(subCount, perfCount);

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
    });

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
    if (!sessionToken) {
      return { success: false, statusCode: 401, error: 'Authentication session required' };
    }

    const sessionUser = await Session.findOne({ sessionToken });
    if (!sessionUser || new Date() > sessionUser.expiresAt) {
      return { success: false, statusCode: 401, error: 'Invalid or expired session' };
    }

    const data = reqBody.userData || reqBody;
    const userId = reqBody.userId || reqBody.userID || data.userId || data.userID || data.UnivID;
    const isAdmin = sessionUser.role === 'admin';
    const mongoose = require('mongoose');

    let user = null;
    if (isAdmin) {
      const queryId = userId || sessionUser.userId;
      user = await User.findOne({
        $or: [
          { UserID: queryId },
          { UnivID: queryId },
          { Email: queryId },
          ...(mongoose.Types.ObjectId.isValid(queryId) ? [{ _id: new mongoose.Types.ObjectId(queryId) }] : [])
        ]
      });
    } else {
      // Candidate: authoritatively identify candidate from session
      user = await User.findOne({
        $or: [
          { UserID: sessionUser.userId },
          { UnivID: sessionUser.userId },
          { Email: sessionUser.userId },
          ...(mongoose.Types.ObjectId.isValid(sessionUser.userId) ? [{ _id: new mongoose.Types.ObjectId(sessionUser.userId) }] : [])
        ]
      });

      // Prevent BOLA: if a target userId was provided, ensure it belongs to the authenticated candidate
      if (userId && user) {
        const allowedIds = [String(user._id), user.UserID, user.UnivID, user.Email].filter(Boolean);
        if (!allowedIds.includes(String(userId))) {
          return { success: false, statusCode: 403, error: 'Unauthorized: cannot modify another candidate profile' };
        }
      }
    }

    if (!user) {
      return { success: false, statusCode: 404, error: 'User not found' };
    }

    // Avatar validation - MUST enforce 0..11 integer range (0 is reserved Founder avatar)
    if (data.avatar !== undefined && data.avatar !== null && data.avatar !== '') {
      const avatarVal = Number(data.avatar);
      if (typeof avatarVal !== 'number' || !Number.isInteger(avatarVal) || avatarVal < 0 || avatarVal > 11) {
        return {
          success: false,
          statusCode: 400,
          error: 'Invalid avatar value. Only integers from 0 to 11 are permitted.'
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
    let passwordChanged = false;
    if (pwdToSet && String(pwdToSet).trim().length > 0) {
      if (!isAdmin) {
        if (!oldPassword) {
          return { success: false, statusCode: 400, error: 'Current password is required to change password' };
        }
        const isMatch = await bcrypt.compare(oldPassword, user.Password);
        if (!isMatch) {
          return { success: false, statusCode: 400, error: 'Current password does not match' };
        }
      }
      user.Password = await bcrypt.hash(String(pwdToSet).trim(), 10);
      passwordChanged = true;
    }

    await user.save();

    // BLOCKER-006: Invalidate previous sessions when password is changed
    if (passwordChanged) {
      const userSessionIds = [String(user._id), user.UserID, user.UnivID, user.Email].filter(Boolean);
      const revoked = await Session.deleteMany({
        userId: { $in: userSessionIds },
        sessionToken: { $ne: sessionToken }
      });
      console.log(`[UPDATE USER PASSWORD] Invalidation complete: Revoked ${revoked.deletedCount} other sessions for user ${user._id}`);
    }

    await AuditLog.create({
      Timestamp: new Date(),
      Action: 'updateUser',
      UserID: user._id.toString(),
      Details: passwordChanged ? 'Profile and password updated (other sessions revoked)' : 'Profile updated'
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

async function getProfile(sessionToken) {
  try {
    if (!sessionToken) {
      return { success: false, statusCode: 401, error: 'Session token is required' };
    }
    const session = await Session.findOne({ sessionToken });
    if (!session || new Date() > session.expiresAt) {
      return { success: false, statusCode: 401, error: 'Invalid or expired session' };
    }
    const user = await User.findById(session.userId);
    if (!user) {
      return { success: false, statusCode: 404, error: 'User not found' };
    }
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
      Function: 'getProfile',
      Error: err.message
    });
    return { success: false, error: err.message };
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
  updateUser,
  getProfile
};
