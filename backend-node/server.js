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

// Restrict CORS to environment-driven allowlist and local dev origins (SEC-007)
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://meriton.onrender.com',
  'https://mithun-mp.github.io'
];

const getAllowedOrigins = () => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  }
  return defaultAllowedOrigins;
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no origin header: mobile apps, server-to-server, curl) or file:// origin
    if (!origin || origin === 'null') return callback(null, true);

    const allowed = getAllowedOrigins();
    const isExplicitlyAllowed = allowed.includes(origin);
    const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isGithubPages = /^https:\/\/[a-zA-Z0-9-]+\.github\.io$/.test(origin);
    const isRenderDomain = /^https:\/\/[a-zA-Z0-9-]+\.onrender\.com$/.test(origin);

    if (isExplicitlyAllowed || isLocalOrigin || isGithubPages || isRenderDomain) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: Origin '${origin}' is not authorized.`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Session-Token"],
  credentials: true
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

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

const path = require('path');
const maintenanceService = require('./src/services/maintenanceService');

// Debug logging middleware (development)
app.use(debugLogger);

// Root health endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'MeritOn backend is running'
  });
});

// Dedicated Administrator Control Access Route (Requirement 8)
app.get(['/admin-control', '/admin', '/admin-control/'], (req, res) => {
  res.redirect('/admin.html');
});

// Web page maintenance interception guard
app.use((req, res, next) => {
  const p = req.path.toLowerCase();

  // Explicit administrator portal and reporting routes (NEVER redirect to maintenance.html)
  const isExplicitAdminRoute = (
    p === '/admin-control' ||
    p === '/admin-control/' ||
    p === '/admin' ||
    p === '/admin.html' ||
    p === '/admin-dashboard.html' ||
    p === '/admin-malpractices.html' ||
    p === '/analytics.html' ||
    p.includes('admin') ||
    p.includes('analytics')
  );

  // Exclude API, health checks, static assets, and admin portal routes
  if (
    p.startsWith('/api') ||
    p === '/health' ||
    p.startsWith('/css') ||
    p.startsWith('/js') ||
    p.startsWith('/assets') ||
    p.startsWith('/snippets') ||
    p.endsWith('.ico') ||
    p.endsWith('.png') ||
    p.endsWith('.svg') ||
    p.endsWith('.jpg') ||
    p.endsWith('.json') ||
    isExplicitAdminRoute
  ) {
    return next();
  }

  const mState = maintenanceService.getMaintenanceState();
  if (mState.active) {
    if (p !== '/maintenance.html') {
      return res.redirect('/maintenance.html');
    }
  } else {
    if (p === '/maintenance.html') {
      return res.redirect('/index.html');
    }
  }

  next();
});

// API routes
app.use('/api', apiRoutes);

// Static frontend assets and HTML pages
app.use(express.static(path.join(__dirname, '..')));

// Default root route
app.get('/', (req, res) => {
  const mState = maintenanceService.getMaintenanceState();
  if (mState.active) {
    return res.redirect('/maintenance.html');
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

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

async function migrateLegacyUserYears() {
  try {
    const User = require('./src/models/User');
    const legacyMap = {
      '1': '2026-2028',
      '2': '2025-2027',
      '3': '2024-2026',
      '4': '2023-2025'
    };
    for (const [legacy, modern] of Object.entries(legacyMap)) {
      const res = await User.updateMany({ Year: legacy }, { $set: { Year: modern } });
      if (res && res.modifiedCount > 0) {
        console.log(`[MIGRATION] Migrated ${res.modifiedCount} users from legacy Year '${legacy}' to academic batch '${modern}'`);
      }
    }
  } catch (mErr) {
    console.warn('[MIGRATION] User year migration note:', mErr.message);
  }
}

// Connect to MongoDB
connectDB().then(async () => {
  await migrateLegacyUserYears();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});