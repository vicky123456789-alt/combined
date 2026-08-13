/* =============================================================
   routes/ai-review.js  —  Streaming Gemini code review
   POST /api/ai-review
   Body: { code: string, language: string, problemSummary?: string }
   Auth: Bearer <firebase_id_token>
   Requires: active Pro subscription (same check as analyze.js)

   Streams back a markdown analysis (complexity, issues, suggestions).
   Uses gemini-3.1-flash-lite via @google/generative-ai SDK.
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ADMIN_EMAIL         = 'vignesh7311379@gmail.com';
const FIREBASE_API_KEY    = process.env.FIREBASE_API_KEY    || 'AIzaSyCL9UBLi5QpHRseUygqBKaEjYDU_PuyWw0';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'cf-tracker-combined';

// ── Auth + subscription middleware (mirrors analyze.js) ───────
async function requireSubscription(req, res, next) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.', requires_upgrade: true });
  }

  try {
    // 1. Validate Firebase ID token
    const userResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken: token })
      }
    );

    if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired token.' });

    const data = await userResp.json();
    if (!data.users || data.users.length === 0) return res.status(401).json({ error: 'Invalid token payload.' });

    const user = data.users[0];
    req.userId    = user.localId;
    req.userEmail = user.email;

    // Admin always bypasses paywall
    if (user.email === ADMIN_EMAIL) return next();

    // 2. Check Firestore profile for active subscription
    const profileResp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/profiles/${req.userId}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );

    if (profileResp.status === 404) {
      return res.status(403).json({ error: 'Profile not found. Please log in again.', requires_upgrade: true });
    }
    if (!profileResp.ok) {
      return res.status(500).json({ error: 'Could not verify subscription.' });
    }

    const profileDoc = await profileResp.json();
    const status = profileDoc.fields?.subscription_status?.stringValue;
    const expiry = profileDoc.fields?.subscription_expiry?.stringValue;

    if (status !== 'active') {
      return res.status(403).json({
        error: 'AI Code Review requires an active Pro subscription.',
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
    console.error('[ai-review] auth error:', err);
    return res.status(500).json({ error: 'Internal server error during auth.' });
  }
}

router.post('/', requireSubscription, async function (req, res) {
  const { code, language, problemSummary } = req.body || {};

  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'No code provided' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  const prompt = `You are an expert competitive programmer and algorithm specialist. Analyse the following ${language || 'C++'} code and provide a concise review in Markdown format.

${problemSummary ? `The problem being solved is: ${problemSummary}\n\n` : ''}

CRITICAL INSTRUCTION: The user's code may already be 100% correct (Accepted on the judge). Specifically in game theory or math problems, a seemingly "too simple" O(1) formula is often the optimal exact solution. Do NOT claim the logic is incorrect just because it is simple or doesn't simulate the game. Only claim logic is incorrect if you can definitively provide a failing edge case.

Your review MUST include:
## ⏱ Time Complexity
State the Big-O time complexity and briefly explain why.

## 💾 Space Complexity  
State the Big-O space complexity and briefly explain why.

## ⚠️ Potential Issues
List any edge cases, integer overflow risks, TLE risks, or common bugs. If the logic appears correct and optimal, explicitly state that it looks correct.

## 🚀 Optimisation Suggestions
Concrete suggestions to improve performance or correctness. If the code is already optimal, say so.

Keep your response under 400 words. Be direct and technical.

\`\`\`${(language || 'cpp').toLowerCase()}
${code}
\`\`\``;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    // Stream the response back as plain text chunks
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) res.write(text);
    }

    res.end();

  } catch (err) {
    console.error('[ai-review]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

module.exports = router;
