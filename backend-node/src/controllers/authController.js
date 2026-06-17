
const Admin = require("../models/Admin");
const Session = require("../models/Session");
const ErrorLog = require("../models/ErrorLog");
const AuditLog = require("../models/AuditLog");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

async function adminLogin(username, password) {
  try {
    // Find admin by username
    const admin = await Admin.findOne({ Username: username.trim() });
    if (!admin) {
      await AuditLog.create({
        Timestamp: new Date(),
        Action: "adminLogin",
        UserID: username,
        Details: "Invalid credentials"
      });
      return { success: false, error: "Invalid credentials" };
    }

    // Check password: if it's a bcrypt hash, use bcrypt.compare; else plaintext (for migrated data)
    let passwordValid = false;
    if (admin.Password.startsWith("$2a$") || admin.Password.startsWith("$2b$") || admin.Password.startsWith("$2y$")) {
      passwordValid = await bcrypt.compare(password, admin.Password);
    } else {
      // For existing plaintext passwords from Google Sheets migration
      passwordValid = admin.Password === password.trim();
    }

    if (!passwordValid) {
      await AuditLog.create({
        Timestamp: new Date(),
        Action: "adminLogin",
        UserID: username,
        Details: "Invalid credentials"
      });
      return { success: false, error: "Invalid credentials" };
    }

    // Create new session
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await Session.create({
      sessionToken,
      userId: admin.Username,
      role: "admin",
      expiresAt
    });

    // Log successful login
    await AuditLog.create({
      Timestamp: new Date(),
      Action: "adminLogin",
      UserID: admin.Username,
      Details: "Login successful"
    });

    // Return response compatible with frontend expectations
    return {
      success: true,
      userId: admin.Username,
      univId: "ADMIN",
      fullName: "Administrator",
      email: admin.Username,
      role: "admin",
      status: "active",
      sessionToken
    };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: "adminLogin",
      Error: err.message
    });
    return { success: false, error: "Authentication service unavailable" };
  }
}

async function verifyAdmin(sessionToken) {
  try {
    if (!sessionToken) {
      return { success: false, error: "Session token required" };
    }

    const session = await Session.findOne({ sessionToken });
    if (!session || session.role !== "admin" || new Date() > session.expiresAt) {
      return { success: false, error: "Invalid or expired session" };
    }

    return { success: true, role: "admin", userId: session.userId };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: "verifyAdmin",
      Error: err.message
    });
    return { success: false, error: "Verification service unavailable" };
  }
}

async function logoutSession(sessionToken) {
  try {
    if (sessionToken) {
      await Session.deleteOne({ sessionToken });
    }
    return { success: true };
  } catch (err) {
    await ErrorLog.create({
      Timestamp: new Date(),
      Function: "logoutSession",
      Error: err.message
    });
    return { success: true }; // Always return success to frontend
  }
}

module.exports = {
  adminLogin,
  verifyAdmin,
  logoutSession
};

