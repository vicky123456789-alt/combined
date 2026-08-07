/* =============================================================
   index.js  —  CF Weakness Tracker Express Backend
   Port: 3001
   Routes:
     GET  /health              — liveness probe
     POST /api/compile         — server-side C++ compile + run (Wandbox)
     POST /api/analyze         — Gemini AI code analysis (with subscription check)
     GET  /api/fetch-problem   — Codeforces problem scraper
     POST /api/run-code        — compil execution engine (Wandbox/local)
     POST /api/ai-review       — compil streaming Gemini code review
     POST /api/generate-tests  — compil AI problem summary + test generation
     POST /api/webhook/razorpay — Razorpay subscription webhook
   ============================================================= */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const analyzeRoute       = require('./routes/analyze');
const compileRoute       = require('./routes/compile');
const problemRoute       = require('./routes/problem');
const webhookRoute       = require('./routes/webhook');
const subscriptionRoute  = require('./routes/subscription');
const runCodeRoute       = require('./routes/run-code');
const aiReviewRoute      = require('./routes/ai-review');
const generateTestsRoute = require('./routes/generate-tests');

const app  = express();
const PORT = process.env.BACKEND_PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────
// Allows local dev ports + any *.vercel.app production domain.
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5500',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:5173',
    ];
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: origin not allowed — ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Body parsers ──────────────────────────────────────────────
// Webhooks need raw body for HMAC verification — mount BEFORE json()
app.use('/api/webhook', express.raw({ type: '*/*' }), webhookRoute);

// All other routes get JSON parsing
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));

// ── Health ────────────────────────────────────────────────────
app.get('/health', function (req, res) {
  res.json({
    status:  'ok',
    service: 'cf-tracker-backend',
    ts:      new Date().toISOString()
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/analyze',        analyzeRoute);
app.use('/api/compile',        compileRoute);
app.use('/api/fetch-problem',  problemRoute);
app.use('/api/subscription',   subscriptionRoute);
// compil routes
app.use('/api/run-code',       runCodeRoute);
app.use('/api/ai-review',      aiReviewRoute);
app.use('/api/generate-tests', generateTestsRoute);

// ── 404 ───────────────────────────────────────────────────────
app.use(function (req, res) {
  res.status(404).json({ error: 'Not found: ' + req.path });
});

// ── Error handler ─────────────────────────────────────────────
app.use(function (err, req, res, next) {
  console.error('[backend error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start (local dev only) ────────────────────────────────────
// On Vercel this module is imported, not run directly.
if (require.main === module) {
  app.listen(PORT, function () {
    console.log('[CF Tracker Backend] Listening on http://localhost:' + PORT);
    console.log('  Gemini key loaded:', !!process.env.GEMINI_API_KEY);
    console.log('  Razorpay key loaded:', !!process.env.RAZORPAY_KEY_SECRET);
  });
}

module.exports = app;
