/* =============================================================
   supabase-client.js  —  Supabase DB + Auth wrapper
   Depends on: Supabase JS v2 UMD loaded via <script> tag first.
   The UMD build exposes window.supabase = { createClient, ... }
   Exposes: window.SupabaseClient
   ============================================================= */

(function (global) {
  'use strict';

  // ── Config (anon key is safe client-side) ────────────────────
  const SUPABASE_URL     = 'https://tttfgfmjqokyidmevyii.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_WNXZ2ZwPBtBCf1baqSgAmA_PAlU44hn';

  // Initialise Supabase client once
  const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  /* =============================================================
     AUTH HELPERS
  ============================================================= */

  /* signInWithGoogle()
     Opens the Google OAuth popup / redirect flow. */
  async function signInWithGoogle() {
    const { data, error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard.html`
      }
    });
    if (error) throw error;
    return data;
  }

  /* signInWithEmail(email, password) */
  async function signInWithEmail(email, password) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  /* signUpWithEmail(email, password)
     Returns { user, session } — session is non-null if email confirmation is disabled. */
  async function signUpWithEmail(email, password) {
    const { data, error } = await _sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard.html` }
    });
    if (error) throw error;
    return data; // { user, session } — session is null if confirmation required
  }

  /* signOut() */
  async function signOut() {
    const { error } = await _sb.auth.signOut();
    if (error) throw error;
    window.location.href = '/index.html';
  }

  /* sendEmailOtp(email)
     Sends a 6-digit OTP to the email for password reset.
     Only works if the account already exists (shouldCreateUser: false). */
  async function sendEmailOtp(email) {
    const { error } = await _sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) throw error;
  }

  /* verifyEmailOtp(email, token)
     Verifies the 6-digit OTP sent by sendEmailOtp.
     Returns data with session if valid. */
  async function verifyEmailOtp(email, token) {
    const { data, error } = await _sb.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) throw error;
    return data;
  }

  /* updatePassword(newPassword)
     Updates the current user's password.
     Must be called while the user has an active session (e.g. after OTP verification). */
  async function updatePassword(newPassword) {
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  /* getSession() — returns the current session or null */
  async function getSession() {
    const { data: { session }, error } = await _sb.auth.getSession();
    if (error) throw error;
    return session;
  }

  /* requireAuth()
     Call at the top of every auth-gated page.
     Redirects to index.html if not logged in.
     Returns session. */
  async function requireAuth() {
    const session = await getSession();
    if (!session) {
      window.location.href = '/index.html';
      return null;
    }
    return session;
  }

  /* onAuthStateChange(callback)
     Fires whenever auth state changes (login, logout, token refresh). */
  function onAuthStateChange(callback) {
    return _sb.auth.onAuthStateChange(callback);
  }

  /* =============================================================
     PROFILES
  ============================================================= */

  /* getProfile(userId)
     Returns the profiles row or null if it doesn't exist yet.
     Uses maybeSingle() so it never throws on missing rows. */
  async function getProfile(userId) {
    const { data, error } = await _sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data; // null if no row exists
  }

  /* ensureProfile(session)
     Gets the profile for the user, creating it if it doesn't exist.
     Called on every page load so Google OAuth users are set up automatically. */
  async function ensureProfile(session) {
    const userId = session.user.id;
    const email  = session.user.email || '';
    const name   = session.user.user_metadata?.full_name
                || session.user.user_metadata?.name
                || email.split('@')[0]
                || 'User';

    // Try to get existing profile
    let profile = await getProfile(userId);

    // If no profile exists, create one now (first Google OAuth login)
    if (!profile) {
      const { data, error } = await _sb
        .from('profiles')
        .upsert({
          id:                  userId,
          email:               email,
          display_name:        name,
          subscription_status: 'free',
          created_at:          new Date().toISOString()
        }, { onConflict: 'id', ignoreDuplicates: false })
        .select()
        .maybeSingle();
      if (error) throw error;
      profile = data;
    }

    return profile;
  }

  /* updateProfile(userId, updates)
     updates: { cf_handle?, subscription_status?, badges?, ... }
     Returns updated row. */
  async function updateProfile(userId, updates) {
    const { data, error } = await _sb
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* =============================================================
     PROBLEMS SOLVED
  ============================================================= */

  /* upsertProblems(userId, submissions)
     submissions: enriched array from CFApi.fetchSubmissions()
     Uses ON CONFLICT (submission_id) DO NOTHING via upsert.
     Batches in chunks of 500 to avoid payload limits. */
  async function upsertProblems(userId, submissions) {
    const rows = submissions.map(sub => ({
      user_id:      userId,
      problem_id:   sub.problemKey,
      contest_id:   sub.problem.contestId || null,
      problem_index: sub.problem.index || null,
      source:       sub.source,
      tags:         sub.problem.tags || [],
      rating:       sub.problem.rating || null,
      verdict:      sub.verdict,
      submission_id: sub.id,           // CF submission ID (BIGINT)
      solved_at:    new Date(sub.creationTimeSeconds * 1000).toISOString()
    }));

    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await _sb
        .from('problems_solved')
        .upsert(chunk, { onConflict: 'submission_id', ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  /* =============================================================
     WEAKNESS SNAPSHOTS
  ============================================================= */

  /* upsertWeaknessSnapshots(userId, snapshotRows)
     snapshotRows: output of WeaknessEngine.buildSnapshotRows()
     Upserts by (user_id, tag, snapshot_date) — idempotent. */
  async function upsertWeaknessSnapshots(userId, snapshotRows) {
    if (!snapshotRows || snapshotRows.length === 0) return;
    const { error } = await _sb
      .from('weakness_snapshots')
      .upsert(snapshotRows, { onConflict: 'user_id,tag,snapshot_date' });
    if (error) throw error;
  }

  /* getWeaknessHistory(userId)
     Returns the last 6 months of snapshots, ordered by date ASC.
     Used by the chart service and trend calculations. */
  async function getWeaknessHistory(userId) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data, error } = await _sb
      .from('weakness_snapshots')
      .select('tag, weakness_score, bias_score, snapshot_date, attempted_count, failed_count')
      .eq('user_id', userId)
      .gte('snapshot_date', sixMonthsAgo.toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: true });
    if (error) throw error;
    return data;
  }

  /* getLatestSnapshot(userId)
     Returns the most recent weakness_snapshots rows for the user
     (one row per tag from the latest snapshot_date). */
  async function getLatestSnapshot(userId) {
    // Get the latest date first
    const { data: dateRow, error: dateErr } = await _sb
      .from('weakness_snapshots')
      .select('snapshot_date')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (dateErr || !dateRow) return [];

    const { data, error } = await _sb
      .from('weakness_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('snapshot_date', dateRow.snapshot_date)
      .order('weakness_score', { ascending: false });
    if (error) throw error;
    return data;
  }

  /* =============================================================
     ADMIN STATS
  ============================================================= */

  /* getAdminStats()
     Returns all admin_stats rows ordered by date ASC.
     Only works if the current user is the admin (RLS enforced). */
  async function getAdminStats() {
    const { data, error } = await _sb
      .from('admin_stats')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    return data;
  }

  /* =============================================================
     EXPOSE SUPABASE CLIENT (for advanced use in other modules)
  ============================================================= */
  function getClient() {
    return _sb;
  }

  // ── Public API ────────────────────────────────────────────────
  global.SupabaseClient = {
    // Auth
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    getSession,
    requireAuth,
    onAuthStateChange,
    // Password reset via email OTP
    sendEmailOtp,
    verifyEmailOtp,
    updatePassword,
    // Profiles
    getProfile,
    ensureProfile,
    updateProfile,
    // Problems
    upsertProblems,
    // Weakness snapshots
    upsertWeaknessSnapshots,
    getWeaknessHistory,
    getLatestSnapshot,
    // Admin
    getAdminStats,
    // Raw client (escape hatch)
    getClient
  };

})(window);
