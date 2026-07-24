require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer'); // Added multer import
const connectDB = require('./src/config/db');
const apiRoutes = require('./src/routes/api');
const debugLogger = require('./src/middleware/debugLogger');
const { startWorker } = require('./src/services/submissionWorker');
const SubmissionQueue = require('./src/models/SubmissionQueue');

// Import models
const User = require('./src/models/User');
const Admin = require('./src/models/Admin');
const Session = require('./src/models/Session');
const OTP = require('./src/models/OTP');
const TestPaper = require('./src/models/TestPaper');
const SubmissionResult = require('./src/models/SubmissionResult');

const app = express();

// Configure multer for memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1048576 // 1MB max
  }
});

// EXACT CORS setup as requested
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options(/.*/, cors());

console.log("CORS enabled for all origins");

// Multer middleware for multipart/form-data (must be before body parsers)
// Only apply to /api route with uploadQuestionImage action
app.use('/api', (req, res, next) => {
  const action = req.query.action || (req.body && req.body.action);
  if (action === 'uploadQuestionImage' && req.method === 'POST') {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
});

// Parse requests with increased body limits for large exam payloads (up to 10MB)
app.use(express.text({ type: 'text/plain', limit: '10mb' })); // For text/plain requests
app.use(express.json({ limit: '10mb' })); // For JSON requests
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    message: 'MeritOn backend is running'
  });
});

// API routes
app.use('/api', apiRoutes);

// Start background worker for queued submissions
if (process.env.SUBMISSION_MODE === 'queue') {
  startWorker();
}

// Connect to MongoDB
connectDB().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});