const firebaseConfig = {
  apiKey: "AIzaSyCL9UBLi5QpHRseUygqBKaEjYDU_PuyWw0",
  authDomain: "cf-tracker-combined.firebaseapp.com",
  projectId: "cf-tracker-combined",
  storageBucket: "cf-tracker-combined.firebasestorage.app",
  messagingSenderId: "118539806141",
  appId: "1:118539806141:web:3b26ee333cc675d30cded4"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

window.FirebaseClient = {
  // === Auth Methods ===
  getSession: () => {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe();
        if (user) {
          resolve({ user: { id: user.uid, email: user.email }, access_token: user.multiFactor?.user?.accessToken || '' });
        } else {
          resolve(null);
        }
      });
    });
  },
  signOut: () => auth.signOut(),
  signInWithEmail: (email, password) => auth.signInWithEmailAndPassword(email, password),
  signUpWithEmail: async (email, password) => {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    return { session: { user: { id: cred.user.uid, email: cred.user.email } } };
  },
  signInWithGoogle: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
  
  sendEmailOtp: async (email) => {
    await auth.sendPasswordResetEmail(email);
    throw new Error("Firebase sent a password reset link to your email. Please click the link to reset your password, then return here to sign in.");
  },

  // === Profile Methods ===
  getProfile: async (userId) => {
    const doc = await db.collection('profiles').doc(userId).get();
    return doc.exists ? doc.data() : null;
  },

  ensureProfile: async (session) => {
    let profile = await window.FirebaseClient.getProfile(session.user.id);
    if (!profile) {
      profile = {
        id: session.user.id,
        email: session.user.email || '',
        display_name: session.user.email?.split('@')[0] || 'User',
        subscription_status: 'free',
        created_at: new Date().toISOString()
      };
      await db.collection('profiles').doc(session.user.id).set(profile);
    }
    return profile;
  },

  updateProfile: async (userId, updates) => {
    await db.collection('profiles').doc(userId).update(updates);
    return await window.FirebaseClient.getProfile(userId);
  },

  // === Problems Methods ===
  upsertProblems: async (userId, submissions) => {
    const rows = submissions.map(sub => ({
      user_id: userId,
      problem_id: sub.problemKey,
      contest_id: sub.problem.contestId || null,
      problem_index: sub.problem.index || null,
      source: sub.source,
      tags: sub.problem.tags || [],
      rating: sub.problem.rating || null,
      verdict: sub.verdict,
      submission_id: sub.id,
      solved_at: new Date(sub.creationTimeSeconds * 1000).toISOString()
    }));

    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();
      chunk.forEach(row => {
        const docRef = db.collection('problems_solved').doc(row.submission_id.toString());
        batch.set(docRef, row, { merge: true });
      });
      await batch.commit();
    }
  },

  // === Weakness Methods ===
  upsertWeaknessSnapshots: async (userId, snapshotRows) => {
    if (!snapshotRows || !snapshotRows.length) return;
    const batch = db.batch();
    snapshotRows.forEach(row => {
      const docId = `${row.user_id}_${row.tag.replace(/[/.]/g, '')}_${row.snapshot_date}`;
      const docRef = db.collection('weakness_snapshots').doc(docId);
      batch.set(docRef, row, { merge: true });
    });
    await batch.commit();
  },

  getWeaknessHistory: async (userId) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const snap = await db.collection('weakness_snapshots')
      .where('user_id', '==', userId)
      .where('snapshot_date', '>=', sixMonthsAgo.toISOString().slice(0, 10))
      .orderBy('snapshot_date', 'asc')
      .get();
    return snap.docs.map(d => d.data());
  },

  getLatestSnapshot: async (userId) => {
    const dateQuery = await db.collection('weakness_snapshots')
      .where('user_id', '==', userId)
      .orderBy('snapshot_date', 'desc')
      .limit(1)
      .get();
    if (dateQuery.empty) return [];
    const latestDate = dateQuery.docs[0].data().snapshot_date;

    const snap = await db.collection('weakness_snapshots')
      .where('user_id', '==', userId)
      .where('snapshot_date', '==', latestDate)
      .orderBy('weakness_score', 'desc')
      .get();
    return snap.docs.map(d => d.data());
  },

  // === Admin Methods ===
  getAdminStats: async () => {
    const snap = await db.collection('admin_stats').orderBy('date', 'asc').get();
    return snap.docs.map(d => d.data());
  }
};
