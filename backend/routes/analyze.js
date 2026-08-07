/* =============================================================
   routes/analyze.js  —  Gemini AI code analysis proxy
   POST /api/analyze
   Body: { code, compilerOutput, problemText? }
   Auth: Bearer <supabase_access_token>
   Requires: GEMINI_API_KEY in .env
   Subscription check: queries Supabase profiles table via
   service role key to verify user has active subscription.
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_KEY    = process.env.GEMINI_API_KEY;
const ADMIN_EMAIL   = 'vignesh7311379@gmail.com';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCL9UBLi5QpHRseUygqBKaEjYDU_PuyWw0';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'cf-tracker-combined';

// ── Auth + subscription middleware ────────────────────────────
async function requireSubscription(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  try {
    // 1. Validate token via Firebase Identity Toolkit
    const userResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });

    if (!userResp.ok) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const data = await userResp.json();
    if (!data.users || data.users.length === 0) return res.status(401).json({ error: 'Invalid token payload.' });

    const user = data.users[0];
    req.userId = user.localId;
    req.userEmail = user.email;

    // Admin bypasses subscription check
    if (user.email === ADMIN_EMAIL) {
      return next();
    }

    // 2. Check subscription in Firestore
    const profileResp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/profiles/${req.userId}`,
      {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      }
    );

    if (profileResp.status === 404) {
       return res.status(403).json({ error: 'Profile not found. Please log in again.' });
    }
    
    if (!profileResp.ok) {
      return res.status(500).json({ error: 'Could not verify subscription.' });
    }

    const profileDoc = await profileResp.json();
    const status = profileDoc.fields?.subscription_status?.stringValue;
    const expiry = profileDoc.fields?.subscription_expiry?.stringValue;

    if (status !== 'active') {
      return res.status(403).json({
        error: 'AI Code Analysis requires an active Pro subscription.',
        requires_upgrade: true
      });
    }

    if (expiry && new Date(expiry) < new Date()) {
      return res.status(403).json({
        error: 'Your Pro subscription has expired.',
        requires_upgrade: true
      });
    }

    next();
  } catch (err) {
    console.error('[analyze] auth error:', err);
    return res.status(500).json({ error: 'Internal server error during auth.' });
  }
}

// ── POST /api/analyze ─────────────────────────────────────────
router.post('/', requireSubscription, async function (req, res) {
  const { code, compilerOutput, problemText } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing required field: code' });
  }

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on the server.' });
  }

  // ── Build prompt ──────────────────────────────────────────
  const problemSection = problemText
    ? '\n\nPROBLEM STATEMENT (for context only — do NOT reveal the solution):\n' +
      problemText.slice(0, 2000)
    : '';

  const errorSection = compilerOutput
    ? '\n\nCOMPILER / RUNTIME OUTPUT:\n' + compilerOutput.slice(0, 2000)
    : '';

  const prompt =
    'You are a competitive programming mentor helping a student debug their C++ code.\n' +
    'Your rules:\n' +
    '1. NEVER reveal the correct algorithm or full solution.\n' +
    '2. Explain what the error means in plain English.\n' +
    '3. Give a targeted hint that helps the student find the bug themselves.\n' +
    '4. Keep your response under 300 words.\n' +
    '5. Structure your response with exactly these three sections:\n' +
    '   [Error Type]: one-line label\n' +
    '   [Explanation]: 2-4 sentences explaining the error\n' +
    '   [Hint]: one actionable hint\n\n' +
    'CODE:\n```cpp\n' + code.slice(0, 4000) + '\n```' +
    errorSection +
    problemSection;

  // ── Call Gemini ───────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const result = await model.generateContent(prompt);
    const text   = result.response.text();

    // Parse the structured response
    const errorTypeMatch  = text.match(/\[Error Type\][:\s]*(.+)/i);
    const explanationMatch = text.match(/\[Explanation\][:\s]*([\s\S]+?)(?=\[Hint\]|$)/i);
    const hintMatch        = text.match(/\[Hint\][:\s]*([\s\S]+)/i);

    res.json({
      error_type:  errorTypeMatch  ? errorTypeMatch[1].trim()  : 'See analysis below',
      explanation: explanationMatch ? explanationMatch[1].trim() : text,
      hint:        hintMatch        ? hintMatch[1].trim()        : ''
    });
  } catch (e) {
    console.error('[analyze] Gemini error:', e);
    res.status(500).json({ error: 'Gemini API error: ' + e.message });
  }
});

module.exports = router;
