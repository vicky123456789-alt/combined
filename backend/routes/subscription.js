/* =============================================================
   routes/subscription.js  —  Razorpay ONE-TIME payment (no autopay)
   POST /api/subscription/create-order   → creates ₹1 Razorpay order
   POST /api/subscription/verify-payment → verifies signature, activates 30-day access
   Auth: Bearer <supabase_access_token>
   ============================================================= */

'use strict';

const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const crypto  = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RZP_KEY      = process.env.RAZORPAY_KEY_ID;
const RZP_SECRET   = process.env.RAZORPAY_KEY_SECRET;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCL9UBLi5QpHRseUygqBKaEjYDU_PuyWw0';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'cf-tracker-combined';

// ── Auth middleware ───────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const userResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    if (!userResp.ok) return res.status(401).json({ error: 'Invalid or expired token.' });

    const data = await userResp.json();
    if (!data.users || data.users.length === 0) return res.status(401).json({ error: 'Invalid token payload.' });

    const user    = data.users[0];
    req.userId    = user.localId;
    req.userEmail = user.email;
    req.token     = token; // Pass token forward for Firestore updates
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Auth error: ' + e.message });
  }
}

// ── POST /api/subscription/create-order ──────────────────────
// Creates a Razorpay order for ₹1 (100 paise). One-time, no autopay.
router.post('/create-order', requireAuth, async function (req, res) {
  if (!RZP_KEY || !RZP_SECRET) {
    return res.status(500).json({ error: 'Razorpay keys not configured on server.' });
  }

  try {
    const auth = Buffer.from(RZP_KEY + ':' + RZP_SECRET).toString('base64');

    const rzpResp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount:   100,       // ₹1 in paise
        currency: 'INR',
        receipt:  'cf_pro_' + req.userId.slice(0, 8),
        notes:    { user_id: req.userId }
      })
    });

    if (!rzpResp.ok) {
      const err = await rzpResp.json();
      throw new Error(err.error?.description || 'Failed to create Razorpay order');
    }

    const order = await rzpResp.json();

    return res.json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
      key_id:   RZP_KEY
    });

  } catch (e) {
    console.error('[subscription] create-order error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /api/subscription/verify-payment ────────────────────
// Verifies Razorpay payment signature, then activates 30-day access.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
router.post('/verify-payment', requireAuth, async function (req, res) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields.' });
  }

  // Verify HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac('sha256', RZP_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment signature verification failed.' });
  }

  // Signature valid — activate 30-day subscription
  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiryISO = expiry.toISOString();

    const updateResp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/profiles/${req.userId}?updateMask.fieldPaths=subscription_status&updateMask.fieldPaths=subscription_expiry`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + req.token,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          fields: {
            subscription_status: { stringValue: 'active' },
            subscription_expiry: { stringValue: expiryISO }
          }
        })
      }
    );

    if (!updateResp.ok) {
      const err = await updateResp.text();
      throw new Error('Database update failed: ' + err);
    }

    return res.json({
      success: true,
      subscription_expiry: expiryISO,
      message: 'Pro access activated for 30 days!'
    });

  } catch (e) {
    console.error('[subscription] activate error:', e);
    return res.status(500).json({ error: 'Payment verified but activation failed: ' + e.message });
  }
});

module.exports = router;
