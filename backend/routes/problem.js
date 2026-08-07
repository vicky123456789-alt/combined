/* =============================================================
   routes/problem.js  —  Codeforces problem statement scraper
   GET /api/fetch-problem?url=<cf_problem_url>
   Auth: Bearer token (any logged-in user)

   Fetches the problem statement from Codeforces, strips HTML,
   returns plain text for inclusion in the AI analysis prompt.
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Validate a Codeforces problem URL
const CF_URL_RE = /^https?:\/\/(www\.)?codeforces\.com\/(problemset\/problem|contest\/\d+\/problem)\/[\w/]+$/;

// ── GET /api/fetch-problem ────────────────────────────────────
router.get('/', async function (req, res) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const url = (req.query.url || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'Missing query parameter: url' });
  }
  if (!CF_URL_RE.test(url)) {
    return res.status(400).json({
      error: 'Only Codeforces problem URLs are supported (e.g. https://codeforces.com/problemset/problem/1A).'
    });
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CFWeaknessTracker/1.0)',
        'Accept': 'text/html'
      },
      timeout: 8000
    });

    if (!resp.ok) {
      return res.status(502).json({ error: 'Codeforces returned HTTP ' + resp.status });
    }

    const html  = await resp.text();
    const $     = cheerio.load(html);

    // Extract problem title
    const title = $('.title').first().text().trim();

    // Extract problem statement text (strip tags, preserve line structure)
    let text = '';
    const sections = [
      '.problem-statement .header',
      '.problem-statement > div:not(.input-specification):not(.output-specification):not(.sample-tests)',
      '.input-specification',
      '.output-specification'
    ];

    sections.forEach(function (sel) {
      const el = $(sel);
      if (el.length) {
        text += el.text().trim() + '\n\n';
      }
    });

    if (!text.trim()) {
      text = $('.problem-statement').text().trim();
    }

    if (text.length > 5000) {
      text = text.slice(0, 5000); // cap raw text
    }

    res.json({
      title: title || '(unknown title)',
      url:   url,
      text:  text.trim()
    });

  } catch (e) {
    console.error('[problem] Fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch problem: ' + e.message });
  }
});

module.exports = router;
