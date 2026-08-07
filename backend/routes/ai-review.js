/* =============================================================
   routes/ai-review.js  —  Streaming Gemini code review
   POST /api/ai-review
   Body: { code: string, language: string, problemSummary?: string }

   Ported from compil's /app/api/ai-review/route.ts
   Streams back a markdown analysis (complexity, issues, suggestions).
   Uses gemini-3.1-flash-lite via @google/generative-ai SDK.
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.post('/', async function (req, res) {
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
