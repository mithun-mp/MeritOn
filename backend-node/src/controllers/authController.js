
const Admin = require("../models/Admin");
const Session = require("../models/Session");
const ErrorLog = require("../models/ErrorLog");
const AuditLog = require("../models/AuditLog");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

async function adminLogin(username, password) {
  try {
    console.log(`[adminLogin] Attempting login for username: ${username.trim()}`);

    // Find admin by username (support both Username and username fields)
    const admin = await Admin.findOne({
      $or: [
        { Username: username.trim() },
        { username: username.trim() }
      ]
    });

    if (!admin) {
      console.log(`[adminLogin] Admin NOT FOUND for username: ${username.trim()}`);
      await AuditLog.create({
        Timestamp: new Date(),
        Action: "adminLogin",
        UserID: username,
        Details: "Invalid credentials"
      });
      return { success: false, error: "Invalid credentials" };
    }

    console.log(`[adminLogin] Admin FOUND: ${admin.Username || admin.username}`);

    // Get password (support both Password and password fields)
    const adminPassword = admin.Password || admin.password;
    console.log(`[adminLogin] Password field exists: ${!!adminPassword}`);

    // Check password: if it's a bcrypt hash, use bcrypt.compare; else plaintext (for migrated data)
    let passwordValid = false;
    if (adminPassword && (adminPassword.startsWith("$2a$") || adminPassword.startsWith("$2b$") || adminPassword.startsWith("$2y$"))) {
      console.log(`[adminLogin] Using bcrypt compare`);
      passwordValid = await bcrypt.compare(password, adminPassword);
      console.log(`[adminLogin] bcrypt compare result: ${passwordValid}`);
    } else if (adminPassword) {
      // For existing plaintext passwords from Google Sheets migration
      console.log(`[adminLogin] Using plaintext compare`);
      passwordValid = adminPassword === password.trim();
      console.log(`[adminLogin] Plaintext compare result: ${passwordValid}`);
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
      userId: admin.Username || admin.username,
      role: "admin",
      expiresAt
    });

    // Log successful login
    await AuditLog.create({
      Timestamp: new Date(),
      Action: "adminLogin",
      UserID: admin.Username || admin.username,
      Details: "Login successful"
    });

    console.log(`[adminLogin] Login SUCCESS for: ${admin.Username || admin.username}`);

    // Return response compatible with frontend expectations
    return {
      success: true,
      userId: admin.Username || admin.username,
      univId: "ADMIN",
      fullName: "Administrator",
      email: admin.Username || admin.username,
      role: "admin",
      status: "active",
      sessionToken
    };
  } catch (err) {
    console.error(`[adminLogin] Error: ${err.message}`);
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
