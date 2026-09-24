
const mongoose = require("mongoose");
const Session = require("../models/Session");
const User = require("../models/User");
const Admin = require("../models/Admin");

/**
 * Extract session token from headers, query, or body
 */
function extractToken(req) {
  if (!req) return null;
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  if (req.headers && req.headers["x-session-token"]) {
    return req.headers["x-session-token"];
  }
  if (req.query && req.query.sessionToken) {
    return req.query.sessionToken;
  }
  if (req.body && req.body.sessionToken) {
    return req.body.sessionToken;
  }
  if (req.parsedBody && req.parsedBody.sessionToken) {
    return req.parsedBody.sessionToken;
  }
  return null;
}

/**
 * Validate session token against database
 */
async function resolveSession(sessionToken) {
  if (!sessionToken || typeof sessionToken !== "string") return null;
  const session = await Session.findOne({ sessionToken }).lean();
  if (!session) return null;
  if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
    return null;
  }
  return session;
}

/**
 * Authoritatively resolve candidate/admin account from validated session
 */
async function resolveAccountFromSession(session) {
  if (!session) return null;
  if (session.role === "admin") {
    const admin = await Admin.findOne({
      $or: [
        { Username: session.userId },
        { username: session.userId }
      ]
    }).lean();
    return {
      type: "admin",
      role: "admin",
      userId: session.userId,
      admin
    };
  }

  // Candidate
  const sessionUserId = session.userId;
  const user = await User.findOne({
    $or: [
      { UserID: sessionUserId },
      { UnivID: sessionUserId },
      { Email: sessionUserId },
      ...(mongoose.Types.ObjectId.isValid(sessionUserId) ? [{ _id: new mongoose.Types.ObjectId(sessionUserId) }] : [])
    ]
  }).lean();

  if (!user) return null;

  const allowedIds = [
    String(user._id),
    user.UserID,
    user.UnivID,
    user.Email
  ].filter(Boolean);

  return {
    type: "candidate",
    role: user.Role || "candidate",
    user,
    userId: user.UserID || String(user._id),
    allowedIds
  };
}

/**
 * Check whether an authenticated account can access/modify a target resource
 */
function isOwnerOrAdmin(account, targetId) {
  if (!account) return false;
  if (account.role === "admin") return true;
  if (!targetId) return true;
  if (account.allowedIds && account.allowedIds.includes(String(targetId))) {
    return true;
  }
  return false;
}

/**
 * Express middleware to authenticate session and attach req.session & req.account
 */
const authMiddleware = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      const session = await resolveSession(token);
      if (session) {
        req.session = session;
        req.account = await resolveAccountFromSession(session);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Express middleware requiring any valid authenticated session
 */
const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, statusCode: 401, error: "Authentication required: Session token missing" });
  }
  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ success: false, statusCode: 401, error: "Authentication required: Invalid or expired session" });
  }
  req.session = session;
  req.account = await resolveAccountFromSession(session);
  next();
};

/**
 * Express middleware requiring an administrator session
 */
const requireAdmin = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, statusCode: 401, error: "Authentication required: Session token missing" });
  }
  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ success: false, statusCode: 401, error: "Invalid or expired session" });
  }
  if (session.role !== "admin") {
    return res.status(403).json({ success: false, statusCode: 403, error: "Unauthorized: Admin privileges required" });
  }
  req.session = session;
  req.account = await resolveAccountFromSession(session);
  next();
};

module.exports = {
  extractToken,
  resolveSession,
  resolveAccountFromSession,
  isOwnerOrAdmin,
  authMiddleware,
  requireAuth,
  requireAdmin
};

