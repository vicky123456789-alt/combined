/* =============================================================
   cf-api.js  —  Codeforces API wrapper
   All functions return plain JS objects / arrays (no framework).
   Exposes: window.CFApi
   ============================================================= */

(function (global) {
  'use strict';

  const CF_BASE = 'https://codeforces.com/api';

  /* ---------------------------------------------------------------
     Internal: fetch with exponential-backoff retry.
     CF API returns { status:"OK", result:... } or { status:"FAILED", comment:... }
  --------------------------------------------------------------- */
  async function _apiFetch(url, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.status === 'OK') return data.result;
        // CF returned FAILED — throw immediately (no retry for bad handles etc.)
        throw new Error(data.comment || 'Codeforces API error');
      } catch (err) {
        if (attempt === retries - 1) throw err;
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  /* ---------------------------------------------------------------
     fetchUserInfo(handle)
     Returns the CF user object: { rating, maxRating, rank, ... }
     Throws if handle is invalid.
  --------------------------------------------------------------- */
  async function fetchUserInfo(handle) {
    const result = await _apiFetch(`${CF_BASE}/user.info?handles=${encodeURIComponent(handle)}`);
    return result[0];
  }

  /* ---------------------------------------------------------------
     fetchSubmissions(handle)
     Returns ALL submissions (up to 10 000) for the user, enriched
     with a `source` field: 'contest' | 'practice'.

     participantType mapping:
       CONTESTANT         → rated contest   → source = 'contest'
       PRACTICE / VIRTUAL / OUT_OF_COMPETITION → source = 'practice'
  --------------------------------------------------------------- */
  async function fetchSubmissions(handle) {
    const raw = await _apiFetch(
      `${CF_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10000`
    );

    return raw.map(sub => ({
      ...sub,
      source: sub.author.participantType === 'CONTESTANT' ? 'contest' : 'practice',
      // Convenience shorthand used throughout weakness-engine
      problemKey: `${sub.problem.contestId}${sub.problem.index}`
    }));
  }

  /* ---------------------------------------------------------------
     fetchRatingHistory(handle)
     Returns array of rating changes: [{ contestId, contestName,
       rank, oldRating, newRating, ratingUpdateTimeSeconds }, ...]
     Oldest first.
  --------------------------------------------------------------- */
  async function fetchRatingHistory(handle) {
    return _apiFetch(`${CF_BASE}/user.rating?handle=${encodeURIComponent(handle)}`);
  }

  /* ---------------------------------------------------------------
     fetchProblemset(tags)
     tags: string[]  e.g. ['dp', 'graphs']
     Returns { problems: [...], problemStatistics: [...] }

     problemStatistics[i].solvedCount corresponds to problems[i].
  --------------------------------------------------------------- */
  async function fetchProblemset(tags = []) {
    let url = `${CF_BASE}/problemset.problems`;
    if (tags.length > 0) {
      // CF accepts semicolon-separated tags for AND filtering
      url += `?tags=${tags.map(encodeURIComponent).join(';')}`;
    }
    return _apiFetch(url); // returns { problems, problemStatistics }
  }

  /* ---------------------------------------------------------------
     validateHandle(handle, ratingHistory)
     Throws a user-friendly Error if the handle hasn't played enough
     rated contests (minimum = 10 per spec).
  --------------------------------------------------------------- */
  function validateHandle(handle, ratingHistory) {
    if (!ratingHistory || ratingHistory.length < 10) {
      const count = ratingHistory ? ratingHistory.length : 0;
      throw new Error(
        `"${handle}" has only ${count} rated contest(s). ` +
        `A minimum of 10 rated contests is required to generate a weakness report.`
      );
    }
  }

  /* ---------------------------------------------------------------
     buildSolvedSet(submissions)
     Returns a Set<problemKey> of problems the user has ever solved
     (any submission type, verdict === 'OK').
  --------------------------------------------------------------- */
  function buildSolvedSet(submissions) {
    const solved = new Set();
    for (const sub of submissions) {
      if (sub.verdict === 'OK') solved.add(sub.problemKey);
    }
    return solved;
  }

  /* ---------------------------------------------------------------
     normaliseProblemKey(contestId, index)
     Canonical string key used everywhere: e.g. "1234A"
  --------------------------------------------------------------- */
  function normaliseProblemKey(contestId, index) {
    return `${contestId}${index}`;
  }

  // ── Public API ────────────────────────────────────────────────
  global.CFApi = {
    fetchUserInfo,
    fetchSubmissions,
    fetchRatingHistory,
    fetchProblemset,
    validateHandle,
    buildSolvedSet,
    normaliseProblemKey
  };

})(window);
