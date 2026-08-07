/* =============================================================
   compiler-ui.js  —  Main thread: Compiler page controller

   Strategy: Use the @wasmer/sdk CDN package which bundles a
   full WASI runtime + pre-compiled WASM toolchains. No manual
   binary download required. Falls back gracefully with a clear
   error if the CDN is unreachable.

   Architecture:
   - Service Worker: caches static assets + any WASM blobs
   - Main thread (this file): registers SW, initialises Wasmer,
     wires UI events
   - No Web Worker needed for Wasmer path (it manages its own
     workers internally via SharedArrayBuffer / Atomics)

   Exposes: window.CompilerUI
   ============================================================= */

(function (global) {
  'use strict';

  // ── Configuration ─────────────────────────────────────────
  // Wasmer SDK v0.5+ bundles the full WASI runtime and a
  // pre-compiled clang/wasi-sdk toolchain in the browser.
  // CDN served — no self-hosting required, no CORS issues.
  const WASMER_SDK_URL    = 'https://cdn.wasmer.io/static/sdk/wasmer-js-0.5.0.js';
  const SW_PATH           = '/sw.js';

  // Fallback: if Wasmer SDK is unavailable, route compile requests
  // to the Express backend (Phase 6) which runs native g++.
  const BACKEND_COMPILE_URL = '/api/compile';

  let _wasmer       = null;  // Wasmer SDK instance
  let _compilerReady = false;
  let _compiling     = false;
  let _useBackend    = false; // fallback flag

  /* ---------------------------------------------------------------
     init()
     Called on DOMContentLoaded. Registers SW, initialises Wasmer,
     enables the Run button.
  --------------------------------------------------------------- */
  async function init() {
    _setProgress(5, 'Registering Service Worker...');
    _showProgressBar(true);

    await _registerSW();

    _setProgress(20, 'Loading WASM runtime (Wasmer SDK)...');

    try {
      await _initWasmer();
      _compilerReady = true;
      _showProgressBar(false);
      _setStatus('Compiler ready. Write C++ and click Run.', false);
      _enableRunButton(true);
    } catch (e) {
      console.warn('[CompilerUI] Wasmer unavailable:', e.message);
      _useBackend = true;

      // Try backend fallback
      _setProgress(80, 'Wasmer unavailable — checking backend compiler...');
      try {
        await _checkBackend();
        _compilerReady = true;
        _showProgressBar(false);
        _setStatus(
          'Compiler ready (server-side mode via backend API).',
          false
        );
        _enableRunButton(true);
      } catch (backendErr) {
        _showProgressBar(false);
        _setStatus(
          'Compiler engine unavailable: ' + e.message +
          '. Backend also unreachable (' + backendErr.message + ').' +
          ' Paste your code above — AI analysis still works.',
          true
        );
        // Still allow the button so users can trigger AI analysis
        _enableRunButton(true);
      }
    }
  }

  /* ---------------------------------------------------------------
     compile(code, stdin, accessToken)
     Routes to Wasmer (client-side) or backend (server-side).
  --------------------------------------------------------------- */
  async function compile(code, stdin, accessToken) {
    if (_compiling) return;
    _compiling = true;
    _enableRunButton(false);
    _clearOutput();

    if (_useBackend) {
      await _compileViaBackend(code, stdin, accessToken);
    } else {
      await _compileViaWasmer(code, stdin);
    }

    _compiling = false;
    _enableRunButton(true);
  }

  /* ---------------------------------------------------------------
     Private: Wasmer SDK initialisation
     @wasmer/sdk wraps the full WASI runtime + clang toolchain.
     The SDK lazy-loads WASM modules from its own CDN internally.
  --------------------------------------------------------------- */
  async function _initWasmer() {
    // Dynamically import via ESM
    const mod = await import(WASMER_SDK_URL).catch(function (e) {
      throw new Error('Could not import Wasmer SDK: ' + e.message);
    });
    _wasmer = mod;
    if (_wasmer && _wasmer.init) {
      await _wasmer.init();
    }
  }

  /* ---------------------------------------------------------------
     Private: Compile via Wasmer (client-side)
  --------------------------------------------------------------- */
  async function _compileViaWasmer(code, stdin) {
    _setStatus('Compiling (client-side WASM)...', false);
    try {
      if (!_wasmer || !_wasmer.runWasi) {
        throw new Error('Wasmer SDK not properly initialized.');
      }

      // Create a WASI instance with clang
      const result = await _wasmer.runWasi({
        program: 'clang++',
        args: ['-O2', '-std=c++23', '-x', 'c++', '-', '-o', '/tmp/a.out'],
        stdin: code,
        env: {}
      });

      if (result.exitCode !== 0) {
        _handleResult({
          stdout: result.stdout || '',
          stderr: result.stderr || 'Compilation failed.',
          exitCode: result.exitCode
        });
        return;
      }

      // Run the compiled output
      const runResult = await _wasmer.runWasi({
        program: '/tmp/a.out',
        args: [],
        stdin: stdin || '',
        env: {}
      });

      _handleResult({
        stdout: runResult.stdout || '',
        stderr: runResult.stderr || '',
        exitCode: runResult.exitCode
      });

    } catch (e) {
      _handleResult({ stdout: '', stderr: 'Runtime error: ' + e.message, exitCode: 1 });
    }
  }

  /* ---------------------------------------------------------------
     Private: Compile via Express backend (server-side fallback)
  --------------------------------------------------------------- */
  async function _compileViaBackend(code, stdin, accessToken) {
    _setStatus('Compiling (server-side)...', false);
    try {
      const resp = await fetch(BACKEND_COMPILE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (accessToken || '')
        },
        body: JSON.stringify({ code: code, stdin: stdin || '' })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(function () {
          return { error: 'HTTP ' + resp.status };
        });
        throw new Error(err.error || 'HTTP ' + resp.status);
      }

      const data = await resp.json();
      _handleResult({
        stdout:   data.stdout   || '',
        stderr:   data.stderr   || '',
        exitCode: data.exitCode != null ? data.exitCode : 1
      });
    } catch (e) {
      _handleResult({ stdout: '', stderr: 'Backend error: ' + e.message, exitCode: 1 });
    }
  }

  /* ---------------------------------------------------------------
     execute(code, stdin, accessToken)
     Returns a promise with {stdout, stderr, exitCode} for React UI.
  --------------------------------------------------------------- */
  async function execute(code, stdin, accessToken) {
    if (_useBackend) {
      return await _executeViaBackend(code, stdin, accessToken);
    } else {
      return await _executeViaWasmer(code, stdin);
    }
  }

  async function _executeViaWasmer(code, stdin) {
    try {
      if (!_wasmer || !_wasmer.runWasi) throw new Error('Wasmer SDK not properly initialized.');
      const result = await _wasmer.runWasi({ program: 'clang++', args: ['-O2', '-std=c++23', '-x', 'c++', '-', '-o', '/tmp/a.out'], stdin: code, env: {} });
      if (result.exitCode !== 0) return { stdout: result.stdout || '', stderr: result.stderr || 'Compilation failed.', exitCode: result.exitCode };
      const runResult = await _wasmer.runWasi({ program: '/tmp/a.out', args: [], stdin: stdin || '', env: {} });
      return { stdout: runResult.stdout || '', stderr: runResult.stderr || '', exitCode: runResult.exitCode };
    } catch (e) {
      return { stdout: '', stderr: 'Runtime error: ' + e.message, exitCode: 1 };
    }
  }

  async function _executeViaBackend(code, stdin, accessToken) {
    try {
      const resp = await fetch(BACKEND_COMPILE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (accessToken || '') },
        body: JSON.stringify({ code: code, stdin: stdin || '' })
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({ error: 'HTTP ' + resp.status })); throw new Error(err.error || 'HTTP ' + resp.status); }
      const data = await resp.json();
      return { stdout: data.stdout || '', stderr: data.stderr || '', exitCode: data.exitCode != null ? data.exitCode : 1 };
    } catch (e) {
      return { stdout: '', stderr: 'Backend error: ' + e.message, exitCode: 1 };
    }
  }

  /* ---------------------------------------------------------------
     Private: Check that the backend compile endpoint is alive
  --------------------------------------------------------------- */
  async function _checkBackend() {
    const resp = await fetch('/health', { method: 'GET' });
    if (!resp.ok) throw new Error('Backend returned HTTP ' + resp.status);
  }

  /* ---------------------------------------------------------------
     Private: SW registration
  --------------------------------------------------------------- */
  async function _registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
      await navigator.serviceWorker.ready;
    } catch (e) {
      console.warn('Service Worker registration failed:', e);
    }
  }

  /* ---------------------------------------------------------------
     Private: Result rendering
  --------------------------------------------------------------- */
  function _handleResult(msg) {
    const exitOk    = msg.exitCode === 0;
    const hasStderr = msg.stderr && msg.stderr.trim().length > 0;

    _setOutput(msg.stdout || '', msg.stderr || '', exitOk);
    _setStatus(
      exitOk ? 'Exit code 0 — OK' : 'Exit code ' + msg.exitCode + ' — Error',
      !exitOk
    );
    if (!exitOk || hasStderr) {
      _showAiButton(true);
    }
  }

  /* ---------------------------------------------------------------
     Private: DOM helpers
  --------------------------------------------------------------- */
  function _showProgressBar(show) {
    const el = document.getElementById('compiler-progress-wrap');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function _setProgress(pct, label) {
    const bar = document.getElementById('compiler-progress-bar');
    const lbl = document.getElementById('compiler-progress-label');
    if (!bar || !lbl) return;
    if (pct >= 0) bar.style.width = Math.min(100, pct) + '%';
    lbl.textContent = label;
  }

  function _setStatus(text, isError) {
    const el = document.getElementById('compiler-status');
    if (!el) return;
    el.textContent = text;
    el.className   = isError ? 'msg-error' : 'msg-info';
    el.style.display = text ? 'block' : 'none';
  }

  function _enableRunButton(enabled) {
    const btn = document.getElementById('run-btn');
    if (btn) {
      btn.disabled    = !enabled;
      btn.textContent = enabled ? '\u25B6 Run' : 'Compiling...';
    }
  }

  function _clearOutput() {
    const so = document.getElementById('output-stdout');
    const se = document.getElementById('output-stderr');
    if (so) so.textContent = '';
    if (se) se.textContent = '';
    const ai = document.getElementById('ai-btn-wrap');
    if (ai) ai.style.display = 'none';
  }

  function _setOutput(stdout, stderr, ok) {
    const so  = document.getElementById('output-stdout');
    const se  = document.getElementById('output-stderr');
    const pnl = document.getElementById('output-panel');
    const ph  = document.getElementById('output-placeholder');
    if (so)  so.textContent  = stdout || (ok ? '(no output)' : '');
    if (se)  { se.textContent = stderr || ''; se.style.color = ok ? '#555' : '#CC0000'; }
    if (pnl) pnl.style.display = 'block';
    if (ph)  ph.style.display  = 'none';
  }

  function _showAiButton(show) {
    const el = document.getElementById('ai-btn-wrap');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  // ── Public API ──────────────────────────────────────────────
  global.CompilerUI = { init, compile, execute };

})(window);

