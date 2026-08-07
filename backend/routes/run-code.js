/* =============================================================
   routes/run-code.js  —  Code execution via Wandbox/local
   POST /api/run-code
   Body: { compiler: string, code: string, input?: string }

   Ported from compil's /app/api/run-code/route.ts
   Supports: cpp-g++-15, python-3.14, deno/javascript
   ============================================================= */

'use strict';

const express  = require('express');
const router   = express.Router();
const fetch    = require('node-fetch');
const { spawnSync } = require('child_process');

router.post('/', async function (req, res) {
  const { compiler, code, input } = req.body || {};

  if (!compiler || !code) {
    return res.status(400).json({ error: 'Missing compiler or code' });
  }

  try {
    let output   = '';
    let error    = '';
    let exitCode = 0;

    if (compiler.startsWith('cpp')) {
      // Use Wandbox for C++ (mirrors compil's approach)
      const wandboxRes = await fetch('https://wandbox.org/api/compile.json', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compiler: 'gcc-head',
          code:     code,
          stdin:    input || '',
          'compiler-option-raw': '-O2\n-std=c++23'
        }),
        timeout: 15000
      });

      if (!wandboxRes.ok) {
        return res.status(wandboxRes.status).json({
          error: 'Wandbox API error: HTTP ' + wandboxRes.status
        });
      }

      const data = await wandboxRes.json();
      // Wandbox status '0' means success
      output   = data.program_output || data.compiler_output || '';
      error    = data.program_error  || data.compiler_error  || '';
      exitCode = (data.status === '0' || data.status === 0) ? 0 : 1;

    } else if (compiler.startsWith('python')) {
      const result = spawnSync('python', ['-c', code], {
        input:    input || '',
        encoding: 'utf-8',
        timeout:  5000
      });
      output   = result.stdout || '';
      error    = result.stderr || (result.error ? result.error.message : '');
      exitCode = result.status != null ? result.status : 1;

    } else if (compiler.startsWith('deno') || compiler.startsWith('javascript')) {
      const result = spawnSync('node', ['-e', code], {
        input:    input || '',
        encoding: 'utf-8',
        timeout:  5000
      });
      output   = result.stdout || '';
      error    = result.stderr || (result.error ? result.error.message : '');
      exitCode = result.status != null ? result.status : 1;
    }

    // Combine stdout + stderr for the unified output field (mirrors compil)
    const combined = output + (output && error ? '\n' : '') + error;

    return res.json({
      output:    combined,
      error:     error || undefined,
      exit_code: exitCode,
      time:      0
    });

  } catch (err) {
    console.error('[run-code]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
