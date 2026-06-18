require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const apiRoutes = require('./src/routes/api');
const debugLogger = require('./src/middleware/debugLogger');

// Import models
const User = require('./src/models/User');
const Admin = require('./src/models/Admin');
const Test = require('./src/models/Test');
const Question = require('./src/models/Question');
const Response = require('./src/models/Response');
const Performance = require('./src/models/Performance');
const Session = require('./src/models/Session');
const OTP = require('./src/models/OTP');

const app = express();

// Connect to MongoDB
connectDB();

// EXACT CORS setup as requested
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options(/.*/, cors());

console.log("CORS enabled for all origins");

// Parse requests
app.use(express.text({ type: 'text/plain' })); // For text/plain requests
app.use(express.json()); // For JSON requests
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path} - Origin: ${req.headers.origin} - Content-Type: ${req.headers['content-type']}`);
  
  // Also log action for /api requests
  if (req.path === '/api') {
    let action = 'unknown';
    if (req.method === 'GET') {
      action = req.query.action || 'unknown';
    } else if (req.method === 'POST') {
      if (typeof req.body === 'string') {
        try {
          const parsed = JSON.parse(req.body);
          action = parsed.action || 'unknown';
        } catch (e) {}
      } else if (req.body && req.body.action) {
        action = req.body.action;
      }
    }
    console.log(`[API ACTION] ${action}`);
  }
  
  next();
});

// Debug logging middleware (only in development)
app.use(debugLogger);

// Root health endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'MeritOn backend running' 
  });
});

// DEBUG ENDPOINTS (only enabled when DEBUG_ENDPOINTS=true)
const DEBUG_ENABLED = process.env.DEBUG_ENDPOINTS === 'true';

if (DEBUG_ENABLED) {
  console.log('⚠️  DEBUG ENDPOINTS ARE ENABLED');
  
  // GET /debug/db-status
  app.get('/debug/db-status', async (req, res) => {
    try {
      const db = mongoose.connection;
      const connected = db.readyState === 1;
      
      const collections = {
        users: await User.countDocuments(),
        admins: await Admin.countDocuments(),
        tests: await Test.countDocuments(),
        questions: await Question.countDocuments(),
        responses: await Response.countDocuments(),
        performances: await Performance.countDocuments(),
        sessions: await Session.countDocuments(),
        otps: await OTP.countDocuments()
      };
      
      res.json({
        success: true,
        connected,
        host: db.host,
        dbName: db.name,
        collections
      });
    } catch (err) {
      console.error('DB status error:', err);
      res.json({ success: false, error: err.message });
    }
  });
  
  // POST /debug/test-write
  app.post('/debug/test-write', async (req, res) => {
    try {
      const { type, email } = req.body;
      if (type !== 'user' || !email) {
        return res.json({ success: false, error: 'Invalid request' });
      }
      
      const dummyHash = '$2a$10$dummyhashdummyhashdummyhashdummyhash';
      
      const result = await User.findOneAndUpdate(
        { Email: email },
        {
          $set: {
            FullName: 'Debug Test User',
            UnivID: 'DEBUG-' + Date.now(),
            Phone: '0000000000',
            Department: 'DEBUG',
            Year: 'DEBUG',
            Password: dummyHash,
            DebugCreated: true,
            DebugCreatedAt: new Date()
          },
          $setOnInsert: {
            Role: 'student',
            Status: 'active'
          }
        },
        { new: true, upsert: true }
      );
      
      res.json({
        success: true,
        collection: 'users',
        id: result._id,
        email: result.Email
      });
    } catch (err) {
      console.error('Test write error:', err);
      res.json({ success: false, error: err.message });
    }
  });
  
  // GET /debug/test-read
  app.get('/debug/test-read', async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.json({ success: false, error: 'Email required' });
      }
      
      const user = await User.findOne({ Email: email }).select('UserID Email UnivID FullName DebugCreated DebugCreatedAt');
      
      if (!user) {
        return res.json({ success: true, found: false });
      }
      
      res.json({
        success: true,
        found: true,
        user: {
          id: user.UserID,
          email: user.Email,
          univId: user.UnivID,
          fullName: user.FullName,
          DebugCreated: user.DebugCreated,
          DebugCreatedAt: user.DebugCreatedAt
        }
      });
    } catch (err) {
      console.error('Test read error:', err);
      res.json({ success: false, error: err.message });
    }
  });
}

// API routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'MeritOn CBT Backend - Node.js + Express + MongoDB',
    status: 'ok',
    endpoints: {
      health: '/health',
      api: '/api',
      ...(DEBUG_ENABLED && {
        'debug/db-status': '/debug/db-status',
        'debug/test-write': '/debug/test-write',
        'debug/test-read': '/debug/test-read'
      })
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (DEBUG_ENABLED) {
    console.log('Debug endpoints are available');
  }
});
