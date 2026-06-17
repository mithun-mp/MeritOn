
const Session = require("../models/Session");

const requireAdmin = async (req, res, next) => {
  const sessionToken = req.query.sessionToken || req.body.sessionToken;
  if (!sessionToken) {
    return res.json({ success: false, error: "Session token required" });
  }

  const session = await Session.findOne({ sessionToken });
  if (!session || session.role !== "admin" || new Date() > session.expiresAt) {
    return res.json({ success: false, error: "Invalid or expired session" });
  }

  req.session = session;
  next();
};

module.exports = {
  requireAdmin
};

