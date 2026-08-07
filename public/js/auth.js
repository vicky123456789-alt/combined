/* =============================================================
   auth.js  —  Shared auth helpers + hamburger nav setup
   Depends on: supabase-client.js (window.FirebaseClient)
   Exposes: window.Auth
   ============================================================= */

(function (global) {
  'use strict';

  /* ---------------------------------------------------------------
     initPage(requireLogin)
     Call at top of every auth-gated page's DOMContentLoaded.
     - Checks for active session
     - If requireLogin=true and no session → redirect to index.html
     - Wires logout button and hamburger
     - Returns session (or null on public pages)
  --------------------------------------------------------------- */
  async function initPage(requireLogin) {
    requireLogin = requireLogin !== false; // default true

    let session;
    try {
      session = await FirebaseClient.getSession();
    } catch (e) {
      console.error('Auth check failed:', e);
      session = null;
    }

    if (requireLogin && !session) {
      window.location.replace('/index.html');
      return null;
    }

    if (session) {
      _wireLogout();
      _markActiveNav();
    }

    _wireHamburger();
    return session;
  }

  /* ---------------------------------------------------------------
     initPublicPage()
     Call on index.html. Redirects to dashboard if already logged in.
  --------------------------------------------------------------- */
  async function initPublicPage() {
    let session;
    try {
      session = await FirebaseClient.getSession();
    } catch (_) {
      session = null;
    }

    if (session) {
      window.location.replace('/dashboard.html');
      return null;
    }

    _wireHamburger();
    return null;
  }

  /* ---------------------------------------------------------------
     requireAdmin(session)
     Redirects to dashboard if the logged-in user is not the admin.
  --------------------------------------------------------------- */
  function requireAdmin(session) {
    const ADMIN_EMAIL = 'vignesh7311379@gmail.com';
    if (!session || session.user.email !== ADMIN_EMAIL) {
      window.location.replace('/dashboard.html');
      return false;
    }
    return true;
  }

  /* ── Private helpers ──────────────────────────────────────── */

  function _wireLogout() {
    const btn = document.getElementById('logout-btn');
    if (!btn) return;
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      try {
        await FirebaseClient.signOut();
      } catch (_) {
        window.location.replace('/index.html');
      }
    });
  }

  function _wireHamburger() {
    const burger = document.getElementById('hamburger-btn');
    const navLinks = document.getElementById('nav-links');
    if (!burger || !navLinks) return;

    burger.addEventListener('click', function () {
      const open = navLinks.classList.toggle('nav-open');
      burger.textContent = open ? '\u2715' : '\u2630'; // ✕ / ☰
      burger.setAttribute('aria-expanded', open);
    });
  }

  function _markActiveNav() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links li a').forEach(function (link) {
      const href = link.getAttribute('href') || '';
      if (href.includes(page) || (page === '' && href.includes('index'))) {
        link.classList.add('active');
      }
    });
  }

  /* ---------------------------------------------------------------
     showMsg(containerId, text, type)
     type: 'info' | 'error' | 'success' | 'warn'
  --------------------------------------------------------------- */
  function showMsg(containerId, text, type) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.className = 'msg-' + (type || 'info');
    el.textContent = text;
    el.style.display = 'block';
  }

  function hideMsg(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
  }

  // ── Public API ──────────────────────────────────────────────
  global.Auth = {
    initPage,
    initPublicPage,
    requireAdmin,
    showMsg,
    hideMsg
  };

})(window);

