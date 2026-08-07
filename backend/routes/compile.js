/* =============================================================
   routes/compile.js  —  Server-side C++ compile + run
   POST /api/compile
   Body: { code: string, stdin?: string }
   Auth: Bearer token (any valid Supabase user — free feature)

   Uses the Wandbox API to compile and run C++ code without 
   requiring a local g++ installation on the host machine.
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');

// ── Simple auth check (any logged-in user) ────────────────────
async function requireAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.token = token;
  next();
}

// ── POST /api/compile ─────────────────────────────────────────
router.post('/', requireAuth, async function (req, res) {
  const { code, stdin } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing required field: code' });
  }

  try {
    const wandboxBody = {
      compiler: 'gcc-head',
      code: code,
      stdin: stdin || '',
      'compiler-option-raw': '-O2\n-std=c++23'
    };

    // 9-second timeout — stays within Vercel's 10s serverless limit
    const controller = new AbortController();
    const timeoutId  = setTimeout(function () { controller.abort(); }, 9000);

    let wandboxRes;
    try {
      wandboxRes = await fetch('https://wandbox.org/api/compile.json', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(wandboxBody),
        signal:  controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!wandboxRes.ok) {
      throw new Error('Wandbox API returned HTTP ' + wandboxRes.status);
    }

    const data = await wandboxRes.json();
    
    // Wandbox returns status "0" on success, something else on error
    const exitCode = data.status === '0' ? 0 : 1;
    
    // Combine compile errors and runtime errors
    const stderr = [data.compiler_error, data.program_error]
      .filter(Boolean)
      .join('\n');

    return res.json({
      stdout:   data.program_output || '',
      stderr:   stderr || data.compiler_message || '',
      exitCode: exitCode
    });

  } catch (e) {
    console.error('[compile] Wandbox error:', e);
    const isTimeout = e.name === 'AbortError' || (e.message && e.message.includes('abort'));
    const msg = isTimeout
      ? 'Compilation timed out (Wandbox took >9s). Try again — Wandbox is a free service and is occasionally slow.'
      : 'Compile service unavailable: ' + e.message;
    return res.status(500).json({ error: msg });
  }
});

module.exports = router;
