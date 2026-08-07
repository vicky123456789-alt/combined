/* =============================================================
   compiler-worker.js  —  Web Worker: WASM C++ Compiler Engine
   Runs entirely off the main thread. Implements:
   - A MemFS (in-memory virtual filesystem)
   - A complete WASI Preview1 shim
   - Two-phase execution: clang compile → WASM instantiate & run
   ============================================================= */

'use strict';

/* ── Constants ─────────────────────────────────────────────── */
// WASI error codes
const ESUCCESS  = 0;
const EBADF     = 8;
const EEXIST    = 20;
const EINVAL    = 28;
const EIO       = 29;
const ENOENT    = 44;
const ENOSYS    = 52;
const ENOTDIR   = 54;

// WASI file types
const FT_REG_FILE  = 4;
const FT_DIRECTORY = 3;

// WASI rights (full access)
const RIGHTS_ALL = 0x1FFFFFFFFFFFn;

/* =============================================================
   MemFS — In-memory virtual filesystem
============================================================= */
class MemFS {
  constructor() {
    // path → { type:'file'|'dir', data:Uint8Array|null }
    this._nodes = new Map();
    this._nodes.set('/',     { type: 'dir',  data: null });
    this._nodes.set('/tmp',  { type: 'dir',  data: null });
    this._nodes.set('/src',  { type: 'dir',  data: null });
  }

  _norm(p) {
    if (!p.startsWith('/')) p = '/' + p;
    return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  exists(path)    { return this._nodes.has(this._norm(path)); }
  isDir(path)     { const n = this._nodes.get(this._norm(path)); return n && n.type === 'dir'; }
  isFile(path)    { const n = this._nodes.get(this._norm(path)); return n && n.type === 'file'; }
  fileSize(path)  { const n = this._nodes.get(this._norm(path)); return n && n.data ? n.data.byteLength : 0; }

  mkdir(path) {
    const p = this._norm(path);
    if (this._nodes.has(p)) return; // already exists — ok
    this._nodes.set(p, { type: 'dir', data: null });
  }

  writeFile(path, data) {
    const p = this._norm(path);
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this._nodes.set(p, { type: 'file', data: buf });
  }

  readFile(path) {
    const n = this._nodes.get(this._norm(path));
    return n && n.type === 'file' ? n.data : null;
  }

  appendFile(path, data) {
    const existing = this.readFile(path) || new Uint8Array(0);
    const incoming = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const merged = new Uint8Array(existing.byteLength + incoming.byteLength);
    merged.set(existing);
    merged.set(incoming, existing.byteLength);
    this._nodes.set(this._norm(path), { type: 'file', data: merged });
  }

  truncateFile(path) {
    if (this._nodes.has(this._norm(path))) {
      this._nodes.get(this._norm(path)).data = new Uint8Array(0);
    }
  }

  listDir(path) {
    const p = this._norm(path) + '/';
    const results = [];
    for (const key of this._nodes.keys()) {
      if (key !== this._norm(path) && key.startsWith(p) && !key.slice(p.length).includes('/')) {
        results.push(key.slice(p.length));
      }
    }
    return results;
  }

  unlink(path) { this._nodes.delete(this._norm(path)); }
}

/* =============================================================
   WASI Preview1 Shim
   Implements all syscalls required by a WASI-compiled Clang.
============================================================= */
class WASIShim {
  constructor(args, env, fs) {
    this.args    = args;  // string[]
    this.env     = env;   // Record<string,string>
    this.fs      = fs;    // MemFS
    this.mem     = null;  // set after instantiation

    // File descriptors
    // 0=stdin, 1=stdout, 2=stderr
    // 3+ = opened files
    this._fds = [
      { type: 'stdin',  path: null, offset: 0n, data: null },
      { type: 'stdout', path: null, offset: 0n, data: null },
      { type: 'stderr', path: null, offset: 0n, data: null }
    ];

    // Pre-opened directories (fd 3 = '/', fd 4 = '/tmp')
    this._fds.push({ type: 'preopened', path: '/',    offset: 0n, data: null });
    this._fds.push({ type: 'preopened', path: '/tmp', offset: 0n, data: null });

    this.stdout = '';
    this.stderr = '';
    this.exitCode = 0;
  }

  _v32(ptr)          { return new DataView(this.mem.buffer).getUint32(ptr, true); }
  _v64(ptr)          { return new DataView(this.mem.buffer).getBigUint64(ptr, true); }
  _w32(ptr, v)       { new DataView(this.mem.buffer).setUint32(ptr, v, true); }
  _w64(ptr, v)       { new DataView(this.mem.buffer).setBigUint64(ptr, v, true); }
  _bytes(p, n)       { return new Uint8Array(this.mem.buffer, p, n); }
  _str(p, n)         { return new TextDecoder().decode(this._bytes(p, n)); }
  _writeBytes(p, b)  { new Uint8Array(this.mem.buffer).set(b, p); }

  _writeStr(ptr, str) {
    const enc = new TextEncoder().encode(str + '\0');
    this._writeBytes(ptr, enc);
    return enc.byteLength;
  }

  _allocFd(entry) {
    this._fds.push(entry);
    return this._fds.length - 1;
  }

  // ── Exported WASI imports object ──────────────────────────
  get imports() {
    const W = this;
    return {
      wasi_snapshot_preview1: {
        /* args */
        args_sizes_get(argc_ptr, argv_buf_size_ptr) {
          const enc = W.args.map(a => new TextEncoder().encode(a + '\0'));
          W._w32(argc_ptr, enc.length);
          W._w32(argv_buf_size_ptr, enc.reduce((s, a) => s + a.byteLength, 0));
          return ESUCCESS;
        },
        args_get(argv_ptr, argv_buf_ptr) {
          const enc = W.args.map(a => new TextEncoder().encode(a + '\0'));
          let bufOff = argv_buf_ptr;
          enc.forEach(function (arg, i) {
            W._w32(argv_ptr + i * 4, bufOff);
            W._writeBytes(bufOff, arg);
            bufOff += arg.byteLength;
          });
          return ESUCCESS;
        },

        /* env */
        environ_sizes_get(count_ptr, buf_size_ptr) {
          const pairs = Object.entries(W.env).map(([k, v]) => k + '=' + v + '\0');
          const enc   = pairs.map(p => new TextEncoder().encode(p));
          W._w32(count_ptr, enc.length);
          W._w32(buf_size_ptr, enc.reduce((s, e) => s + e.byteLength, 0));
          return ESUCCESS;
        },
        environ_get(environ_ptr, environ_buf_ptr) {
          const pairs = Object.entries(W.env).map(([k, v]) => k + '=' + v + '\0');
          const enc   = pairs.map(p => new TextEncoder().encode(p));
          let bufOff  = environ_buf_ptr;
          enc.forEach(function (pair, i) {
            W._w32(environ_ptr + i * 4, bufOff);
            W._writeBytes(bufOff, pair);
            bufOff += pair.byteLength;
          });
          return ESUCCESS;
        },

        /* clock */
        clock_time_get(clkid, precision, time_ptr) {
          W._w64(time_ptr, BigInt(Date.now()) * 1_000_000n);
          return ESUCCESS;
        },
        clock_res_get(clkid, res_ptr) {
          W._w64(res_ptr, 1_000_000n);
          return ESUCCESS;
        },

        /* fd_prestat */
        fd_prestat_get(fd, buf_ptr) {
          const entry = W._fds[fd];
          if (!entry || entry.type !== 'preopened') return EBADF;
          // prestat tag = 0 (dir), then 4-byte dir name len
          W._w32(buf_ptr,     0);
          W._w32(buf_ptr + 4, new TextEncoder().encode(entry.path).byteLength);
          return ESUCCESS;
        },
        fd_prestat_dir_name(fd, path_ptr, path_len) {
          const entry = W._fds[fd];
          if (!entry || entry.type !== 'preopened') return EBADF;
          const enc = new TextEncoder().encode(entry.path);
          W._writeBytes(path_ptr, enc.subarray(0, path_len));
          return ESUCCESS;
        },

        /* fd_fdstat */
        fd_fdstat_get(fd, stat_ptr) {
          const entry = W._fds[fd];
          if (!entry) return EBADF;
          const isDir = entry.type === 'preopened' || (entry.path && W.fs.isDir(entry.path));
          W._w32(stat_ptr,     isDir ? FT_DIRECTORY : FT_REG_FILE); // filetype (u8 → padded u32)
          W._w32(stat_ptr + 2, 0); // fdflags
          W._w64(stat_ptr + 8,  RIGHTS_ALL);
          W._w64(stat_ptr + 16, RIGHTS_ALL);
          return ESUCCESS;
        },
        fd_fdstat_set_flags(fd, flags) { return ESUCCESS; },

        /* fd_filestat */
        fd_filestat_get(fd, stat_ptr) {
          const entry = W._fds[fd];
          if (!entry) return EBADF;
          const size = entry.path ? W.fs.fileSize(entry.path) : 0;
          const view = new DataView(W.mem.buffer);
          view.setBigUint64(stat_ptr,      0n, true); // dev
          view.setBigUint64(stat_ptr + 8,  0n, true); // ino
          view.setUint8(stat_ptr + 16, entry.type === 'preopened' ? FT_DIRECTORY : FT_REG_FILE);
          view.setBigUint64(stat_ptr + 24, 1n, true); // nlink
          view.setBigUint64(stat_ptr + 32, BigInt(size), true); // size
          view.setBigUint64(stat_ptr + 40, 0n, true); // atim
          view.setBigUint64(stat_ptr + 48, 0n, true); // mtim
          view.setBigUint64(stat_ptr + 56, 0n, true); // ctim
          return ESUCCESS;
        },
        fd_filestat_set_size(fd, size) { return ESUCCESS; },

        /* fd_seek */
        fd_seek(fd, offset, whence, newoffset_ptr) {
          const entry = W._fds[fd];
          if (!entry) return EBADF;
          const size = BigInt(entry.data ? entry.data.byteLength : 0);
          const off  = entry.offset || 0n;
          let   newOff;
          if (whence === 0) newOff = offset;           // SEEK_SET
          else if (whence === 1) newOff = off + offset; // SEEK_CUR
          else newOff = size + offset;                  // SEEK_END
          if (newOff < 0n) newOff = 0n;
          entry.offset = newOff;
          W._w64(newoffset_ptr, newOff);
          return ESUCCESS;
        },

        /* fd_tell */
        fd_tell(fd, offset_ptr) {
          const entry = W._fds[fd];
          if (!entry) return EBADF;
          W._w64(offset_ptr, entry.offset || 0n);
          return ESUCCESS;
        },

        /* fd_write — stdout (1), stderr (2), files */
        fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr) {
          let written = 0;
          for (let i = 0; i < iovs_len; i++) {
            const base = W._v32(iovs_ptr + i * 8);
            const len  = W._v32(iovs_ptr + i * 8 + 4);
            const data = W._bytes(base, len);
            const text = new TextDecoder().decode(data);

            if (fd === 1) { W.stdout += text; }
            else if (fd === 2) { W.stderr += text; }
            else {
              const entry = W._fds[fd];
              if (!entry || !entry.path) return EBADF;
              W.fs.appendFile(entry.path, data);
            }
            written += len;
          }
          W._w32(nwritten_ptr, written);
          return ESUCCESS;
        },

        /* fd_read — stdin (0) returns EOF, files return data */
        fd_read(fd, iovs_ptr, iovs_len, nread_ptr) {
          let totalRead = 0;
          if (fd === 0) {
            W._w32(nread_ptr, 0);
            return ESUCCESS;
          }
          const entry = W._fds[fd];
          if (!entry) return EBADF;
          if (!entry.data) {
            entry.data = W.fs.readFile(entry.path) || new Uint8Array(0);
            entry.offset = 0n;
          }
          for (let i = 0; i < iovs_len; i++) {
            const base = W._v32(iovs_ptr + i * 8);
            const len  = W._v32(iovs_ptr + i * 8 + 4);
            const off  = Number(entry.offset);
            const avail = entry.data.byteLength - off;
            if (avail <= 0) break;
            const chunk = Math.min(len, avail);
            W._writeBytes(base, entry.data.subarray(off, off + chunk));
            entry.offset += BigInt(chunk);
            totalRead += chunk;
          }
          W._w32(nread_ptr, totalRead);
          return ESUCCESS;
        },

        /* fd_close */
        fd_close(fd) {
          if (fd < 3) return EBADF;
          W._fds[fd] = null;
          return ESUCCESS;
        },

        /* path_open */
        path_open(dirfd, dirflags, path_ptr, path_len, oflags, rights_base, rights_inheriting, fdflags, fd_ptr) {
          const name = W._str(path_ptr, path_len);
          const base = W._fds[dirfd] ? W._fds[dirfd].path || '/' : '/';
          const fullPath = base === '/' ? '/' + name : base + '/' + name;

          const OFLAGS_CREAT = 1, OFLAGS_TRUNC = 8, OFLAGS_DIRECTORY = 2;
          if (oflags & OFLAGS_DIRECTORY) {
            W.fs.mkdir(fullPath);
          }
          if ((oflags & OFLAGS_CREAT) && !W.fs.exists(fullPath)) {
            W.fs.writeFile(fullPath, new Uint8Array(0));
          }
          if ((oflags & OFLAGS_TRUNC) && W.fs.isFile(fullPath)) {
            W.fs.truncateFile(fullPath);
          }
          if (!W.fs.exists(fullPath)) return ENOENT;

          const newFd = W._allocFd({
            type:   W.fs.isDir(fullPath) ? 'preopened' : 'file',
            path:   fullPath,
            offset: 0n,
            data:   null
          });
          W._w32(fd_ptr, newFd);
          return ESUCCESS;
        },

        /* path_create_directory */
        path_create_directory(dirfd, path_ptr, path_len) {
          const name = W._str(path_ptr, path_len);
          const base = W._fds[dirfd] ? W._fds[dirfd].path || '/' : '/';
          const full = base === '/' ? '/' + name : base + '/' + name;
          W.fs.mkdir(full);
          return ESUCCESS;
        },

        /* path_filestat_get */
        path_filestat_get(dirfd, flags, path_ptr, path_len, stat_ptr) {
          const name = W._str(path_ptr, path_len);
          const base = W._fds[dirfd] ? W._fds[dirfd].path || '/' : '/';
          const full = base === '/' ? '/' + name : base + '/' + name;
          if (!W.fs.exists(full)) return ENOENT;
          const size = W.fs.isFile(full) ? W.fs.fileSize(full) : 0;
          const view = new DataView(W.mem.buffer);
          view.setBigUint64(stat_ptr,      0n, true);
          view.setBigUint64(stat_ptr + 8,  0n, true);
          view.setUint8(stat_ptr + 16, W.fs.isDir(full) ? FT_DIRECTORY : FT_REG_FILE);
          view.setBigUint64(stat_ptr + 24, 1n, true);
          view.setBigUint64(stat_ptr + 32, BigInt(size), true);
          view.setBigUint64(stat_ptr + 40, 0n, true);
          view.setBigUint64(stat_ptr + 48, 0n, true);
          view.setBigUint64(stat_ptr + 56, 0n, true);
          return ESUCCESS;
        },

        /* path_rename */
        path_rename(old_fd, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) {
          const oldBase = W._fds[old_fd] ? W._fds[old_fd].path || '/' : '/';
          const newBase = W._fds[new_fd] ? W._fds[new_fd].path || '/' : '/';
          const oldName = W._str(old_path_ptr, old_path_len);
          const newName = W._str(new_path_ptr, new_path_len);
          const oldFull = oldBase === '/' ? '/' + oldName : oldBase + '/' + oldName;
          const newFull = newBase === '/' ? '/' + newName : newBase + '/' + newName;
          const data = W.fs.readFile(oldFull);
          if (data === null) return ENOENT;
          W.fs.writeFile(newFull, data);
          W.fs.unlink(oldFull);
          return ESUCCESS;
        },

        /* path_unlink_file */
        path_unlink_file(dirfd, path_ptr, path_len) {
          const name = W._str(path_ptr, path_len);
          const base = W._fds[dirfd] ? W._fds[dirfd].path || '/' : '/';
          const full = base === '/' ? '/' + name : base + '/' + name;
          W.fs.unlink(full);
          return ESUCCESS;
        },
        path_remove_directory(dirfd, path_ptr, path_len) {
          return this.path_unlink_file(dirfd, path_ptr, path_len);
        },

        /* poll_oneoff — minimal stub */
        poll_oneoff(in_ptr, out_ptr, nsubscriptions, nevents_ptr) {
          W._w32(nevents_ptr, 0);
          return ESUCCESS;
        },

        /* random */
        random_get(buf_ptr, buf_len) {
          crypto.getRandomValues(W._bytes(buf_ptr, buf_len));
          return ESUCCESS;
        },

        /* sched */
        sched_yield() { return ESUCCESS; },

        /* proc_exit */
        proc_exit(code) {
          W.exitCode = code;
          throw new Error('__proc_exit:' + code);
        }
      }
    };
  }
}

/* =============================================================
   Worker State
============================================================= */
let _fs          = null;  // MemFS
let _wasi        = null;  // WASIShim (for compiler phase)
let _compilerMod = null;  // WebAssembly.Module (compiled clang.wasm)

/* =============================================================
   Phase 1: compile C++ source → a.out.wasm
   Phase 2: instantiate a.out.wasm → run → capture stdout/stderr
============================================================= */
async function compileAndRun(code, stdinText) {
  _fs = new MemFS();

  // Write C++ source
  _fs.writeFile('/tmp/main.cpp', code);

  // ── Phase 1: Compile ──────────────────────────────────────
  const compileArgs = [
    'clang', '-cc1',
    '-triple', 'wasm32-unknown-wasi',
    '-isysroot', '/',
    '-std=c++23',
    '-O2',
    '-emit-obj',
    '-o', '/tmp/main.o',
    '/tmp/main.cpp'
  ];

  _wasi = new WASIShim(compileArgs, { PATH: '/usr/bin' }, _fs);

  let compileStderr = '';
  try {
    const instance = await WebAssembly.instantiate(_compilerMod, {
      ..._wasi.imports,
      // Allow compiler to reference its own memory
    });
    _wasi.mem = instance.exports.memory;
    instance.exports._start();
  } catch (e) {
    if (!e.message.startsWith('__proc_exit:')) throw e;
    _wasi.exitCode = parseInt(e.message.split(':')[1], 10) || 0;
  }

  compileStderr = _wasi.stderr;
  if (_wasi.exitCode !== 0) {
    return {
      stdout: '',
      stderr: 'Compilation failed:\n' + compileStderr,
      exitCode: _wasi.exitCode
    };
  }

  // ── Phase 1b: Link (wasm-ld / lld stub) ──────────────────
  // Note: Real linking requires lld.wasm. For a self-contained
  // clang.wasm that bundles the linker, the object file IS the final WASM.
  // If the compiler outputs a raw WASM object, rename it.
  const objData = _fs.readFile('/tmp/main.o');
  if (!objData || objData.byteLength === 0) {
    return {
      stdout: '',
      stderr: 'Compilation produced no output. Compiler error:\n' + compileStderr,
      exitCode: 1
    };
  }

  // ── Phase 2: Execute compiled WASM ────────────────────────
  _fs.writeFile('/tmp/a.out.wasm', objData);

  const runFs   = new MemFS();
  const runWasi = new WASIShim(['a.out'], {}, runFs);

  // Feed stdin text if any
  if (stdinText) runFs.writeFile('/dev/stdin', stdinText);

  try {
    const runMod  = await WebAssembly.compile(objData.buffer.slice(
      objData.byteOffset, objData.byteOffset + objData.byteLength
    ));
    const runInst = await WebAssembly.instantiate(runMod, runWasi.imports);
    runWasi.mem = runInst.exports.memory;
    runInst.exports._start();
  } catch (e) {
    if (!e.message.startsWith('__proc_exit:')) {
      return {
        stdout: runWasi.stdout,
        stderr: runWasi.stderr + '\nRuntime error: ' + e.message,
        exitCode: 1
      };
    }
    runWasi.exitCode = parseInt(e.message.split(':')[1], 10) || 0;
  }

  return {
    stdout: runWasi.stdout,
    stderr: runWasi.stderr || (compileStderr ? '[Compile warnings]\n' + compileStderr : ''),
    exitCode: runWasi.exitCode
  };
}

/* =============================================================
   Message handler (main thread ↔ worker protocol)
============================================================= */
self.onmessage = async function (e) {
  const msg = e.data;

  switch (msg.type) {

    case 'init': {
      // msg.wasmBinary: ArrayBuffer of clang.wasm
      try {
        _compilerMod = await WebAssembly.compile(msg.wasmBinary);
        self.postMessage({ type: 'ready' });
      } catch (err) {
        self.postMessage({ type: 'error', message: 'Failed to compile WASM binary: ' + err.message });
      }
      break;
    }

    case 'compile': {
      // msg.code: string (C++ source)
      // msg.stdin: string (optional stdin input)
      if (!_compilerMod) {
        self.postMessage({
          type: 'done',
          stdout: '',
          stderr: 'Compiler not initialized. Reload the page.',
          exitCode: 1
        });
        return;
      }
      try {
        const result = await compileAndRun(msg.code, msg.stdin || '');
        self.postMessage({ type: 'done', ...result });
      } catch (err) {
        self.postMessage({
          type: 'done',
          stdout: '',
          stderr: 'Internal worker error: ' + err.message,
          exitCode: 1
        });
      }
      break;
    }

    default:
      self.postMessage({ type: 'error', message: 'Unknown message type: ' + msg.type });
  }
};
