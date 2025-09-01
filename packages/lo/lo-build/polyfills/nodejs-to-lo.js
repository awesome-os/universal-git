// lo-node-wrapper.js

/**
 * @file A Node.js compatibility wrapper for the 'lo' JavaScript runtime.
 *
 * This script provides a simple, non-performant shim that mimics the global
 * APIs defined for the 'lo' runtime, allowing some 'lo' scripts to be
 * tested or run within a standard Node.js environment.
 *
 * NOTE: Low-level memory management, pointer manipulation, native library
 * loading (dlopen/dlsym), and process control (fork/exec) functions are
 * specific to the 'lo' runtime and are not implemented here. They are
 * provided as empty stubs to prevent 'undefined' errors.
 */

const fs = require('fs');
const process = require('process');
const os = require('os');
const tty = require('tty');
const path = require('path');
const { performance } = require('perf_hooks');
const { Buffer } = require('buffer');
const assert = require('assert');

// --- Global Type Implementations ---

/**
 * A shim for lo.CString. In Node.js, there is no direct concept of a
 * user-managed C pointer. This class mimics the structure but the `ptr`
 * and `size` properties are for compatibility only.
 */
class CString extends Uint8Array {
  constructor(...args) {
    super(...args);
    /**
     * @type {number} In this wrapper, this is always 0 as we don't manage memory pointers.
     */
    this.ptr = 0;
    /**
     * @type {number} The size of the CString in bytes.
     */
    this.size = this.byteLength;
  }
}

// --- Global Variable Mappings ---

// onUnhandledRejection: Node.js uses an event listener model for this.
// We can simulate the global function assignment with a setter.
let _onUnhandledRejection = (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
};
process.on('unhandledRejection', (reason, promise) => {
  _onUnhandledRejection(reason);
});

const onUnhandledRejectionProxy = {
  get: () => _onUnhandledRejection,
  set: (fn) => {
    if (typeof fn !== 'function') {
      throw new TypeError('onUnhandledRejection must be a function.');
    }
    _onUnhandledRejection = fn;
  },
};


// --- Core 'lo' Runtime Object Wrapper ---

const lo = {
  // --- Properties ---
  version: {
    lo: process.versions.node, // Map lo version to node version
    v8: process.versions.v8,
  },
  args: process.argv,
  // Note: In Node, argc/argv are concepts for C/C++ addons, not primary JS APIs.
  // We can derive them from process.argv for compatibility.
  get argc() { return process.argv.length; },
  get argv() { return 0; /* Cannot map C pointer argv */ },
  start: performance.timeOrigin,
  errno: 0, // Node.js exposes errno constants, but not a mutable global property.
  
  // --- Caches ---
  moduleCache: new Map(), // Not directly mappable to Node's module system internals
  libCache: new Map(),    // Specific to lo's `library` function
  requireCache: require.cache, // Direct mapping

  // --- Core Functions ---
  exit: (status) => process.exit(status),
  hrtime: () => performance.now(), // Returns milliseconds, can be BigInt for nanoseconds with process.hrtime.bigint()
  nextTick: (cb) => process.nextTick(cb),
  next_tick: (cb) => process.nextTick(cb),
  
  os: () => {
    const platform = process.platform;
    if (platform === 'darwin') return 'mac';
    if (platform === 'win32') return 'win';
    return 'linux';
  },
  arch: () => process.arch,
  
  getenv: (str) => process.env[str],
  setenv: (name, value, overwrite = 1) => {
    if (overwrite || process.env[name] === undefined) {
      process.env[name] = value;
      return 0;
    }
    return 0; // Return 0 on success, as per standard setenv
  },
  
  getcwd: () => process.cwd(),

  assert: (exp, msg) => assert(exp, msg),

  /**
   * @param {string} str
   * @returns {CString}
   */
  cstr: (str) => {
    // Append a null terminator for C compatibility
    const buffer = Buffer.from(str + '\0', 'utf8');
    return CString.from(buffer);
  },

  print: (str) => process.stdout.write(String(str)),
  
  // --- UTF8 / String Functions ---
  utf8Encode: (str) => Buffer.from(str, 'utf8'),
  utf8_encode: (str) => Buffer.from(str, 'utf8'),
  utf8Decode: (ptr, len) => { /* Cannot be mapped: requires reading from a raw memory address */ return ''; },
  utf8_decode: (ptr, len) => { /* Cannot be mapped: requires reading from a raw memory address */ return ''; },
  latin1Decode: (ptr, len) => { /* Cannot be mapped: requires reading from a raw memory address */ return ''; },
  latin1_decode: (ptr, len) => { /* Cannot be mapped: requires reading from a raw memory address */ return ''; },
  utf8Length: (str) => Buffer.byteLength(str, 'utf8'),
  utf8_length: (str) => Buffer.byteLength(str, 'utf8'),
  utf8EncodeInto: (str, buf) => Buffer.from(str, 'utf8').copy(buf),
  utf8_encode_into: (str, buf) => Buffer.from(str, 'utf8').copy(buf),
  
  // --- Memory Functions (NOT MAPPABLE) ---
  // Node.js abstracts memory management. These functions deal with raw pointers
  // and are fundamentally incompatible with the Node.js security model.
  getAddress: (buf) => 0,
  get_address: (buf) => 0,
  addr: (buf) => 0,
  ptr: (u8) => {
    u8.ptr = 0;
    u8.size = u8.byteLength;
    return u8;
  },
  wrapMemory: (start, size, free) => new ArrayBuffer(size),
  wrap_memory: (start, size, free) => new ArrayBuffer(size),
  unwrapMemory: (buffer) => {},
  unwrap_memory: (buffer) => {},
  readMemory: (dest, start, len) => {},
  read_memory: (dest, start, len) => {},
  register_callback: (ptr, fn) => {},
  registerCallback: (ptr, fn) => {},

  // --- Module/Library Functions (NOT MAPPABLE) ---
  // These are tied to the internal mechanics of the 'lo' runtime.
  library: (name) => ({ name, handle: 0, fileName: name, internal: false }),
  libraries: () => [],
  bindings: () => [],
  builtins: () => Object.keys(process.binding('natives')),
  builtin: (path) => { /* Cannot reliably read internal builtin source in Node */ return ''; },
  load: (name) => { /* Stub */ return {}; },
  loadModule: (source, specifier) => { /* Stub */ return {}; },
  evaluateModule: async (id) => { /* Stub */ return {}; },

  // --- Other Unmappable Stubs ---
  runMicroTasks: () => { /* Node does this automatically */ },
  run_microtasks: () => { /* Node does this automatically */ },
  pumpMessageLoop: () => { /* Node does this automatically */ },
  pump_message_loop: () => { /* Node does this automatically */ },
  runScript: (source, path) => {
      const { runInThisContext } = require('vm');
      runInThisContext(source, { filename: path });
  },
};

// Add snake_case aliases
lo.run_script = lo.runScript;

// --- Core API Object ('lo.core') ---
lo.core = {
  // --- File I/O ---
  // Using Node's synchronous FS APIs as they are the closest match.
  readFile: (path) => fs.readFileSync(path),
  read_file: (path) => fs.readFileSync(path),
  writeFile: (path, u8, flags, mode) => fs.writeFileSync(path, u8, { mode }),
  write_file: (path, u8, flags, mode) => fs.writeFileSync(path, u8, { mode }),
  
  open: (path, flags, mode) => fs.openSync(path, flags, mode),
  read: (fd, buf, count) => fs.readSync(fd, buf, 0, count, null),
  write: (fd, buf, count) => fs.writeSync(fd, buf, 0, count, null),
  close: (fd) => fs.closeSync(fd),
  fstat: (fd, buf) => {
    // NOTE: Node's fstatSync returns a Stats object, it doesn't fill a buffer.
    // This implementation returns the object, which differs from the 'lo' API.
    return fs.fstatSync(fd);
  },
  isFile: (path) => {
    try {
      return fs.statSync(path).isFile();
    } catch {
      return false;
    }
  },

  // --- System Info ---
  os: lo.os(),
  arch: lo.arch(),
  homedir: os.homedir(),
  isatty: (fd) => tty.isatty(fd) ? 1 : 0,

  // --- Low-level Process/Memory/Dynamic Lib (NOT MAPPABLE) ---
  dlopen: (path, flags) => 0,
  dlsym: (handle, name) => 0,
  mmap: (ptr, len, prot, flags, fd, off) => 0,
  fork: () => process.pid, // Can't fork, return current pid as a placeholder
  execve: (str, buf, buf2) => -1,
  execvp: (str, buf) => -1,
  waitpid: (num, buf, num2) => -1,
  calloc: (num, size) => 0,
  memcpy: (dest, src, size) => {},
  memmove: (dest, src, size) => {},
  
  // --- FS Constants ---
  // These are mapped from Node's fs.constants
  ...fs.constants,

  // --- Standard File Descriptors ---
  STDIN: 0,
  STDOUT: 1,
  STDERR: 2,

  // --- Other Constants (if not in fs.constants) ---
  RTLD_LAZY: 1,
  RTLD_NOW: 2,
  RTLD_GLOBAL: 256,
  RTLD_LOCAL: 0,
};

// --- Exported Globals ---

// This object can be destructured to populate the global scope if needed,
// or used as a single import.
module.exports = {
  lo,
  console: global.console, // Standard Node.js console is compatible
  TextEncoder: global.TextEncoder, // Standard in modern Node.js
  TextDecoder: global.TextDecoder, // Standard in modern Node.js
  require: require, // Standard Node.js require
  CString,
  // This uses a Proxy to simulate the global variable assignment
  onUnhandledRejection: onUnhandledRejectionProxy,
  global: global,
  globalThis: global,
};

// Example of how to pollute the global scope to truly emulate the 'lo' environment:
/*
  if (require.main === module) {
    const wrapper = module.exports;
    Object.assign(global, wrapper);
    
    // The proxy needs to be defined on the global object directly
    Object.defineProperty(global, 'onUnhandledRejection', wrapper.onUnhandledRejection);
    
    console.log('Node.js global scope patched with `lo` runtime wrapper.');
    // You can now run 'lo' code here.
    lo.print(`Hello from lo wrapper on Node.js ${lo.version.lo}\n`);
    assert(lo.core.isatty(lo.core.STDOUT) === 1);
  }
*/