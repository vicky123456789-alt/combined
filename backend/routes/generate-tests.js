/* =============================================================
   routes/generate-tests.js  —  AI problem summary + test gen
   POST /api/generate-tests
   Body: { problemText: string }

   Ported from compil's /app/api/generate-tests/route.ts
   Returns: { summary: string (markdown), testCases: [{input, expected}] }
   Uses gemini-3.1-flash-lite via @google/generative-ai SDK.
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

router.post('/', async function (req, res) {
  const { problemText } = req.body || {};

  if (!problemText || !problemText.trim()) {
    return res.status(400).json({ error: 'No problem text provided' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  const prompt = `You are an expert competitive programmer. I will provide you with the text of a competitive programming problem.
    
Problem Text:
${problemText.substring(0, 15000)}

Your task is to do TWO things:
1. Write a concise markdown summary of the problem statement (Description, Input Format, Output Format, Constraints).
   You may use standard LaTeX math blocks (e.g. $k$, $$x$$) for equations, as they will be rendered by KaTeX.
   CRITICAL: NEVER put a newline or line break inside an inline math block ($...$). All inline math MUST be on a single line.
2. Extract or generate 3 to 5 test cases from the problem.
   CRITICAL INSTRUCTION FOR TEST CASES: In competitive programming, problems often require reading an integer \`t\` first (the number of test cases). However, this app runs each test case INDIVIDUALLY against the user's code. 
   Therefore, IF the problem statement mentions multiple test cases (e.g. "The first line contains t"), you MUST prefix the input of EACH generated test case with \`1\\n\` (so the user's code reads t=1 and loops exactly once). 
   If the problem does NOT have multiple test cases, do not add the \`1\\n\` prefix.

You MUST output ONLY a valid JSON object with exactly two keys:
"summary" - A string containing your markdown summary.
"testCases" - A JSON array of objects, where each object has "input" and "expected" keys (both strings).

Make sure your entire output is just valid JSON, possibly inside a markdown code block.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      generationConfig: {
        temperature:     0.2,
        maxOutputTokens: 2500,
      }
    });

    const result = await model.generateContent(prompt);
    const text   = result.response.text();

    let parsed = { summary: '', testCases: [] };
    try {
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      let jsonString = jsonBlockMatch ? jsonBlockMatch[1].trim() : text.trim();

      try {
        parsed = JSON.parse(jsonString);
      } catch (_) {
        const firstBrace = jsonString.indexOf('{');
        const lastBrace  = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(jsonString.substring(firstBrace, lastBrace + 1));
        } else {
          throw new Error('Could not find JSON in AI response');
        }
      }
    } catch (parseError) {
      console.error('[generate-tests] JSON parse error:', parseError.message, '\nRaw:', text.slice(0, 300));
      return res.status(500).json({
        error: 'Failed to parse AI response. Please ensure the problem text is clear.'
      });
    }

    return res.json({
      summary:   parsed.summary   || '',
      testCases: parsed.testCases || []
    });

  } catch (err) {
    console.error('[generate-tests]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
