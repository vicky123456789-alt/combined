'use strict';
/**
 * api/index.js  — Vercel Serverless Function entry point
 * Routes all /api/* and /health requests to the Express app.
 *
 * On Vercel, env vars come from the Vercel dashboard (no .env file).
 * dotenv's config() call in backend/index.js silently no-ops when
 * the .env file is missing, so env vars from the dashboard are used.
 */

const app = require('../backend/index');

module.exports = app;
