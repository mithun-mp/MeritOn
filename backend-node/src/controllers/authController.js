
const Admin = require("../models/Admin");
const Session = require("../models/Session");
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
      console.warn(`[AUDIT] adminLogin failed: Username not found (${username.trim()})`);
      return { success: false, error: "Invalid credentials" };
    }

    console.log(`[adminLogin] Admin FOUND: ${admin.Username || admin.username}`);

    // Get password (support both Password and password fields)
    const adminPassword = admin.Password || admin.password;
    console.log(`[adminLogin] Password field exists: ${!!adminPassword}`);

    // Check password: all admin passwords must use bcrypt hashing
    let passwordValid = false;
    if (adminPassword && (adminPassword.startsWith("$2a$") || adminPassword.startsWith("$2b$") || adminPassword.startsWith("$2y$"))) {
      passwordValid = await bcrypt.compare(password, adminPassword);
    } else {
      console.warn(`[adminLogin] Rejected non-bcrypt password for admin: ${admin.Username || admin.username}`);
    }

    if (!passwordValid) {
      console.warn(`[AUDIT] adminLogin failed: Invalid credentials for ${username.trim()}`);
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

    console.log(`[AUDIT] adminLogin SUCCESS for: ${admin.Username || admin.username}`);

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
    console.error(`[verifyAdmin] Error: ${err.message}`);
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
    console.error(`[logoutSession] Error: ${err.message}`);
    return { success: true }; // Always return success to frontend
  }
}

module.exports = {
  adminLogin,
  verifyAdmin,
  logoutSession
};
