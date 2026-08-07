/* =============================================================
   firebase-client.js  —  Firebase Auth + Firestore replacement
   for Supabase. Exposes window.FirebaseClient with the same
   interface as supabase-client.js so all page scripts work
   unchanged.
   ============================================================= */

const firebaseConfig = {
  apiKey:            "AIzaSyCL9UBLi5QpHRseUygqBKaEjYDU_PuyWw0",
  authDomain:        "cf-tracker-combined.firebaseapp.com",
  projectId:         "cf-tracker-combined",
  storageBucket:     "cf-tracker-combined.firebasestorage.app",
  messagingSenderId: "118539806141",
  appId:             "1:118539806141:web:3b26ee333cc675d30cded4"
};

firebase.initializeApp(firebaseConfig);
const _auth = firebase.auth();
const _db   = firebase.firestore();

window.FirebaseClient = {

  // ── Auth ────────────────────────────────────────────────────
  getSession: function () {
    return new Promise(function (resolve) {
      var unsubscribe = _auth.onAuthStateChanged(async function (user) {
        unsubscribe();
        if (user) {
          const token = await user.getIdToken();
          resolve({
            user: { id: user.uid, email: user.email },
            access_token: token
          });
        } else {
          resolve(null);
        }
      });
    });
  },

  signOut: function () { return _auth.signOut(); },

  signInWithEmail: function (email, password) {
    return _auth.signInWithEmailAndPassword(email, password);
  },

  signUpWithEmail: async function (email, password) {
    var cred = await _auth.createUserWithEmailAndPassword(email, password);
    return { session: { user: { id: cred.user.uid, email: cred.user.email } } };
  },

  signInWithGoogle: function () {
    return _auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  },

  sendEmailOtp: async function (email) {
    await _auth.sendPasswordResetEmail(email);
    throw new Error(
      'Firebase sent a password-reset link to your email. ' +
      'Click it to set a new password, then sign in here.'
    );
  },

  // ── Profile ──────────────────────────────────────────────────
  getProfile: async function (userId) {
    var doc = await _db.collection('profiles').doc(userId).get();
    return doc.exists ? doc.data() : null;
  },

  ensureProfile: async function (session) {
    var profile = await window.FirebaseClient.getProfile(session.user.id);
    if (!profile) {
      profile = {
        id:                  session.user.id,
        email:               session.user.email || '',
        display_name:        (session.user.email || 'User').split('@')[0],
        subscription_status: 'free',
        created_at:          new Date().toISOString()
      };
      await _db.collection('profiles').doc(session.user.id).set(profile);
    }
    return profile;
  },

  updateProfile: async function (userId, updates) {
    await _db.collection('profiles').doc(userId).update(updates);
    return await window.FirebaseClient.getProfile(userId);
  },

  // ── Problems ─────────────────────────────────────────────────
  upsertProblems: async function (userId, submissions) {
    var rows = submissions.map(function (sub) {
      return {
        user_id:       userId,
        problem_id:    sub.problemKey,
        contest_id:    sub.problem.contestId  || null,
        problem_index: sub.problem.index       || null,
        source:        sub.source,
        tags:          sub.problem.tags        || [],
        rating:        sub.problem.rating      || null,
        verdict:       sub.verdict,
        submission_id: sub.id,
        solved_at:     new Date(sub.creationTimeSeconds * 1000).toISOString()
      };
    });

    var CHUNK = 500;
    for (var i = 0; i < rows.length; i += CHUNK) {
      var chunk = rows.slice(i, i + CHUNK);
      var batch = _db.batch();
      chunk.forEach(function (row) {
        var ref = _db.collection('problems_solved').doc(String(row.submission_id));
        batch.set(ref, row, { merge: true });
      });
      await batch.commit();
    }
  },

  // ── Weakness snapshots ───────────────────────────────────────
  upsertWeaknessSnapshots: async function (userId, snapshotRows) {
    if (!snapshotRows || !snapshotRows.length) return;
    var batch = _db.batch();
    snapshotRows.forEach(function (row) {
      var docId = (row.user_id + '_' + row.tag.replace(/[/.]/g, '') + '_' + row.snapshot_date);
      var ref   = _db.collection('weakness_snapshots').doc(docId);
      batch.set(ref, row, { merge: true });
    });
    await batch.commit();
  },

  getWeaknessHistory: async function (userId) {
    var sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    var snap = await _db.collection('weakness_snapshots')
      .where('user_id', '==', userId)
      .where('snapshot_date', '>=', sixMonthsAgo.toISOString().slice(0, 10))
      .orderBy('snapshot_date', 'asc')
      .get();
    return snap.docs.map(function (d) { return d.data(); });
  },

  getLatestSnapshot: async function (userId) {
    var dateQ = await _db.collection('weakness_snapshots')
      .where('user_id', '==', userId)
      .orderBy('snapshot_date', 'desc')
      .limit(1)
      .get();
    if (dateQ.empty) return [];
    var latestDate = dateQ.docs[0].data().snapshot_date;

    var snap = await _db.collection('weakness_snapshots')
      .where('user_id', '==', userId)
      .where('snapshot_date', '==', latestDate)
      .orderBy('weakness_score', 'desc')
      .get();
    return snap.docs.map(function (d) { return d.data(); });
  },

  // ── Admin ─────────────────────────────────────────────────────
  getAdminStats: async function () {
    var snap = await _db.collection('admin_stats').orderBy('date', 'asc').get();
    return snap.docs.map(function (d) { return d.data(); });
  }
};
