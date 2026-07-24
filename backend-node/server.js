require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const connectDB = require('./src/config/db');
const apiRoutes = require('./src/routes/api');
const debugLogger = require('./src/middleware/debugLogger');
const { startWorker } = require('./src/services/submissionWorker');

// Process Error Guards to prevent server crashes in production
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

const app = express();

// Configure multer for memory storage (1MB max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1048576
  }
});

// Production Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Exact CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options(/.*/, cors());

// Multer middleware for multipart file uploads
app.use('/api', (req, res, next) => {
  const action = req.query.action || (req.body && req.body.action);
  if (action === 'uploadQuestionImage' && req.method === 'POST') {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
});

// Body Parsers with 10MB limits for large exam payloads
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
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

// Debug logging middleware (development)
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

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('[GLOBAL EXPRESS ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message,
    error: err.message,
    errors: [err.message]
  });
});

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