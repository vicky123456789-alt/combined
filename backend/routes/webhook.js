'use strict';

const express  = require('express');
const router   = express.Router();

router.post('/razorpay', async function (req, res) {
  console.log('[webhook] Received event, ignoring as we use one-time synchronous payments.');
  res.status(200).json({ status: 'ignored' });
});

module.exports = router;
