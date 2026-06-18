require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const apiRoutes = require('./src/routes/api');
const debugLogger = require('./src/middleware/debugLogger');

const app = express();

// Connect to MongoDB
connectDB();

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost',
    'http://127.0.0.1',
    /^https?:\/\/.*\.github\.io$/
  ],
  credentials: true
};
app.use(cors(corsOptions));

// Parse JSON requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug logging middleware (only in development)
app.use(debugLogger);

// Root health endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'MeritOn backend running' 
  });
});

// API routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'MeritOn CBT Backend - Node.js + Express + MongoDB',
    status: 'ok',
    endpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
