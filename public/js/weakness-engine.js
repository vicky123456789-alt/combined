/* =============================================================
   weakness-engine.js  —  Core weakness/bias computation engine
   Pure functions only. No network calls. No side effects.
   Depends on: cf-api.js (for CFApi.buildSolvedSet)
   Exposes: window.WeaknessEngine
   ============================================================= */

(function (global) {
  'use strict';

  const MS_PER_DAY = 86_400_000;
  const RECENCY_HALF_LIFE_DAYS = 90;   // e^(-days/90) decay constant
  const MIN_ATTEMPTS_PER_TAG = 3;      // minimum tag attempts to compute a score
  const RATING_CEILING_OFFSET = 300;   // only consider problems ≤ user_rating + 300
  const DIFFICULTY_FLOOR = 0.1;        // clamp difficulty_weight to avoid zeroing scores

  /* ===============================================================
     computeWeaknessScores(submissions, userRating)

     submissions: enriched array from CFApi.fetchSubmissions()
                  (each sub has .source, .problemKey, .verdict,
                   .problem.rating, .problem.tags, .creationTimeSeconds)
     userRating:  integer (current CF rating of the user)

     Returns: Array of tag score objects, sorted by weaknessScore DESC:
     [{
       tag, weaknessScore, rawScore,
       failureRate, difficultyWeight, recencyWeight,
       attemptedCount, failedCount
     }]
     weaknessScore is normalised 0–100.
  =============================================================== */
  function computeWeaknessScores(submissions, userRating) {
    const now = Date.now();

    // --- 1. Identify every problem the user has EVER solved (any source) ---
    const everSolved = new Set();
    for (const sub of submissions) {
      if (sub.verdict === 'OK') everSolved.add(sub.problemKey);
    }

    // --- 2. Keep only rated-contest submissions within rating ceiling ---
    const contestSubs = submissions.filter(sub =>
      sub.source === 'contest' &&
      sub.problem.rating != null &&
      sub.problem.rating <= userRating + RATING_CEILING_OFFSET
    );

    // --- 3. Build per-problem metadata (one entry per unique problem) ---
    // key → { problem, isSolved, latestAttemptMs }
    const problemMap = new Map();
    for (const sub of contestSubs) {
      const key = sub.problemKey;
      if (!problemMap.has(key)) {
        problemMap.set(key, {
          problem: sub.problem,
          isSolved: everSolved.has(key),
          latestAttemptMs: sub.creationTimeSeconds * 1000
        });
      } else {
        // Track most recent attempt timestamp
        const entry = problemMap.get(key);
        const ts = sub.creationTimeSeconds * 1000;
        if (ts > entry.latestAttemptMs) entry.latestAttemptMs = ts;
      }
    }

    // --- 4. Group problems by tag ---
    // tagData: tag → { attempted: [problemEntry], failed: [problemEntry] }
    const tagData = new Map();
    for (const entry of problemMap.values()) {
      for (const tag of (entry.problem.tags || [])) {
        if (!tagData.has(tag)) tagData.set(tag, { attempted: [], failed: [] });
        const td = tagData.get(tag);
        td.attempted.push(entry);
        if (!entry.isSolved) td.failed.push(entry);
      }
    }

    // --- 5. Compute raw weakness scores per tag ---
    const rawScores = [];
    for (const [tag, td] of tagData.entries()) {
      if (td.attempted.length < MIN_ATTEMPTS_PER_TAG) continue;

      const failureRate = td.failed.length / td.attempted.length;

      // Difficulty_Weight = avg[(problem_rating - user_rating) / 100] over FAILED problems
      let difficultyWeight = DIFFICULTY_FLOOR;
      if (td.failed.length > 0) {
        const totalGap = td.failed.reduce((acc, p) =>
          acc + ((p.problem.rating - userRating) / 100), 0);
        difficultyWeight = Math.max(totalGap / td.failed.length, DIFFICULTY_FLOOR);
      }

      // Recency_Weight = Σ e^(-days_since_latest_attempt / 90) over FAILED problems
      let recencyWeight = 0;
      for (const p of td.failed) {
        const daysSince = (now - p.latestAttemptMs) / MS_PER_DAY;
        recencyWeight += Math.exp(-daysSince / RECENCY_HALF_LIFE_DAYS);
      }

      const rawScore = failureRate * difficultyWeight * recencyWeight;

      rawScores.push({
        tag,
        rawScore,
        failureRate,
        difficultyWeight,
        recencyWeight,
        attemptedCount: td.attempted.length,
        failedCount: td.failed.length
      });
    }

    if (rawScores.length === 0) return [];

    // --- 6. Normalise raw scores to 0–100 ---
    const maxRaw = Math.max(...rawScores.map(s => s.rawScore));
    const minRaw = Math.min(...rawScores.map(s => s.rawScore));
    const range = maxRaw - minRaw || 1;

    return rawScores
      .map(s => ({
        ...s,
        weaknessScore: Math.round(((s.rawScore - minRaw) / range) * 100 * 100) / 100
      }))
      .sort((a, b) => b.weaknessScore - a.weaknessScore);
  }

  /* ===============================================================
     computeBiasScores(submissions)

     Bias_Score(tag) = (practice_attempts(tag) / total_practice_attempts) × 100
     Informational only — shows what the user drills in practice.

     Returns: Map<tag, biasScore (0–100)>
  =============================================================== */
  function computeBiasScores(submissions) {
    const practiceSubs = submissions.filter(s => s.source === 'practice');
    const total = practiceSubs.length;
    if (total === 0) return new Map();

    const tagCounts = new Map();
    for (const sub of practiceSubs) {
      for (const tag of (sub.problem.tags || [])) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const biasScores = new Map();
    for (const [tag, count] of tagCounts.entries()) {
      biasScores.set(tag, Math.round((count / total) * 100 * 100) / 100);
    }
    return biasScores;
  }

  /* ===============================================================
     getTop5WeakestTags(tagScores)
     tagScores: output of computeWeaknessScores()
     Returns: string[] of top 5 tag names.
  =============================================================== */
  function getTop5WeakestTags(tagScores) {
    return tagScores.slice(0, 5).map(s => s.tag);
  }

  /* ===============================================================
     generateRecommendations(weakTags, userRating, solvedSet, problemsetResult)

     weakTags:         string[] — top 5 weakest tags
     userRating:       integer
     solvedSet:        Set<problemKey> — problems user has ever solved
     problemsetResult: { problems, problemStatistics } from CFApi.fetchProblemset()
                       (caller fetches once; we filter here)

     Returns: { [tag]: [ { name, contestId, index, rating, solveCount, url, tags }, ...] }
              Up to 5 recommendations per tag.

     Ranking: primary = tag-overlap similarity to user's failed problems,
              secondary = solve count (quality proxy).
              Tie-break: higher solveCount wins.
  =============================================================== */
  function generateRecommendations(weakTags, userRating, solvedSet, problemsetResult, tagScores) {
    const TARGET_RATING = userRating + 300;
    const RATING_TOLERANCE = 50;
    const MIN_SOLVES = 1000;

    const { problems, problemStatistics } = problemsetResult;

    // Build solve-count lookup
    const solveCountMap = new Map();
    for (let i = 0; i < problemStatistics.length; i++) {
      const s = problemStatistics[i];
      const p = problems[i];
      if (p) {
        solveCountMap.set(`${p.contestId}${p.index}`, s.solvedCount);
      }
    }

    // Build failed tag sets per tag (for overlap scoring)
    // tagFailedTagSets: tag → Set of OTHER tags that frequently co-occur on failed problems
    const tagFailedTagSets = new Map();
    for (const ts of tagScores) {
      tagFailedTagSets.set(ts.tag, ts.tag);
    }

    const recommendations = {};

    for (const targetTag of weakTags) {
      // Filter candidate problems
      const candidates = problems
        .map((p, i) => ({ ...p, solveCount: problemStatistics[i]?.solvedCount || 0 }))
        .filter(p => {
          const key = `${p.contestId}${p.index}`;
          return (
            p.rating != null &&
            p.rating >= TARGET_RATING - RATING_TOLERANCE &&
            p.rating <= TARGET_RATING + RATING_TOLERANCE &&
            p.solveCount >= MIN_SOLVES &&
            !solvedSet.has(key) &&
            (p.tags || []).includes(targetTag)
          );
        });

      // Score by tag-overlap with weakest tags (user's problem area)
      const scored = candidates.map(p => {
        const tagOverlap = (p.tags || []).filter(t => weakTags.includes(t)).length;
        return { ...p, tagOverlap };
      });

      // Sort: primary = tagOverlap DESC, secondary = solveCount DESC
      scored.sort((a, b) =>
        b.tagOverlap !== a.tagOverlap
          ? b.tagOverlap - a.tagOverlap
          : b.solveCount - a.solveCount
      );

      recommendations[targetTag] = scored.slice(0, 5).map(p => ({
        name: p.name,
        contestId: p.contestId,
        index: p.index,
        rating: p.rating,
        solveCount: p.solveCount,
        tags: p.tags,
        tagOverlap: p.tagOverlap,
        url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`
      }));
    }

    return recommendations;
  }

  /* ===============================================================
     computeStreak(submissions)
     Returns { current: number, longest: number }
     A "day" = calendar day (UTC) where user has at least one AC.
  =============================================================== */
  function computeStreak(submissions) {
    const solvedDates = new Set();
    for (const sub of submissions) {
      if (sub.verdict === 'OK') {
        const d = new Date(sub.creationTimeSeconds * 1000);
        // UTC date string YYYY-MM-DD
        solvedDates.add(d.toISOString().slice(0, 10));
      }
    }

    if (solvedDates.size === 0) return { current: 0, longest: 0 };

    const sorted = [...solvedDates].sort().reverse(); // newest first

    // Streak is "active" if the user solved something today or yesterday (UTC)
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString().slice(0, 10);
    const isActive = sorted[0] === today || sorted[0] === yesterday;

    // Compute current streak
    let current = 0;
    if (isActive) {
      current = 1;
      for (let i = 1; i < sorted.length; i++) {
        const dayDiff = (new Date(sorted[i - 1]) - new Date(sorted[i])) / MS_PER_DAY;
        if (dayDiff === 1) current++;
        else break;
      }
    }

    // Compute longest streak
    let longest = 1, run = 1;
    for (let i = 1; i < sorted.length; i++) {
      const dayDiff = (new Date(sorted[i - 1]) - new Date(sorted[i])) / MS_PER_DAY;
      if (dayDiff === 1) {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 1;
      }
    }

    return { current, longest: Math.max(longest, current) };
  }

  /* ===============================================================
     buildSnapshotRows(userId, tagScores, biasScores)
     Formats data ready for Supabase upsert into weakness_snapshots.
  =============================================================== */
  function buildSnapshotRows(userId, tagScores, biasScores) {
    const today = new Date().toISOString().slice(0, 10);
    return tagScores.map(ts => ({
      user_id: userId,
      tag: ts.tag,
      weakness_score: ts.weaknessScore,
      bias_score: biasScores.get(ts.tag) || 0,
      attempted_count: ts.attemptedCount,
      failed_count: ts.failedCount,
      snapshot_date: today
    }));
  }

  /* ===============================================================
     computeTagMasteryBadges(tagScores)
     Returns string[] of tags where weaknessScore < 10.
     (Used for badge display in profile.)
  =============================================================== */
  function computeTagMasteryBadges(tagScores) {
    return tagScores
      .filter(ts => ts.weaknessScore < 10 && ts.attemptedCount >= MIN_ATTEMPTS_PER_TAG)
      .map(ts => ts.tag);
  }

  // ── Public API ────────────────────────────────────────────────
  global.WeaknessEngine = {
    computeWeaknessScores,
    computeBiasScores,
    getTop5WeakestTags,
    generateRecommendations,
    computeStreak,
    buildSnapshotRows,
    computeTagMasteryBadges
  };

})(window);

