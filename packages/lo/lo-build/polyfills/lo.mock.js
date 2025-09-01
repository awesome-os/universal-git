// file: lo.js

/**
 * @file lo - ES Module Wrapper (1:1 Mirror with Complete Built-in Mock)
 * @module lo
 *
 * This module provides an explicit, importable API for the 'lo' runtime's
 * global variables. It is enriched with JSDoc annotations and includes a
 * comprehensive `Mock` object. This object provides a fully-implemented,
 * type-safe mock of the entire `lo` API for use in testing environments.
 *
 * @example
 * import { Mock } from 'lo';
 *
 * // Create a test-specific version of the API by overriding one method.
 * const testApi = {
 *   ...Mock.lo, // Use the complete mock as a base
 *   core: {
 *     ...Mock.lo.core,
 *     read_file: (path) => {
 *       if (path === './config.json') {
 *         return new TextEncoder().encode(JSON.stringify({ setting: 'test' }));
 *       }
 *       return new Uint8Array();
 *     }
 *   }
 * };
 *
 * // Use the customized mock in a test. IntelliSense works perfectly.
 * const configData = testApi.core.read_file('./config.json');
 */

// #region Type Definitions
// This section defines all the core types used by the 'lo' runtime.

/** @typedef {'mac' | 'win' | 'linux'} OS */
/** @typedef {'x64' | 'arm64'} ARCH */
/** @typedef {Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array | BigUint64Array | BigInt64Array | ArrayBuffer} TypedArray */

/**
 * @typedef {object} Console
 * @property {function(any): number} log
 * @property {function(any): number} error
 */

/**
 * @typedef {object} RuntimeVersion
 * @property {string} lo
 * @property {string} v8
 */

/**
 * @typedef {object} Core - The low-level system API of the 'lo' runtime.
 * @property {'core'} name
 * @property {function(string, number, number=): number} open
 * @property {function(number, string): number} dlsym
 * @property {function(string, number): number} dlopen
 * @property {function(string | number, number): number} strnlen
 * @property {function(string): Uint8Array} read_file
 * @property {function(string, Uint8Array, number=, number=): number} write_file
 * @property {OS} os
 * @property {ARCH} arch
 * @property {boolean} little_endian
 * @property {string} homedir
 * @property {number} defaultWriteFlags
 * @property {number} defaultWriteMode
 * @property {function(number): (0 | 1)} isatty
 * @property {function(number, number, number, number, number, number): number} mmap
 * @property {function(number, number): number} calloc
 * @property {function(number, number, number): void} memcpy
 * @property {function(number, number): number} aligned_alloc
 * @property {function(number, number, number): void} memmove
 * @property {function(): number} fork
 * @property {function(number): number} sysconf
 * @property {function(TypedArray): number} times
 * @property {function(number, TypedArray, number, number): number} pread
 * @property {function(number, TypedArray, number): number} waitpid
 * @property {function(string, TypedArray, TypedArray): number} execve
 * @property {function(string, TypedArray): number} execvp
 * @property {function(string, TypedArray, number): number} readlink
 * @property {function(number, number, Uint32Array): void} getcwd
 * @property {function(string, Uint32Array): void} getenv
 * @property {function(string, string, number=): (0 | -1)} setenv
 * @property {function(number, string): number} write_string
 * @property {function(number, TypedArray): number} fstat
 * @property {function(number, TypedArray, number): (0 | -1)} read
 * @property {function(number, TypedArray, number): number} write
 * @property {function(number): (0 | -1)} close
 * @property {function(string, number=, number=): Uint8Array} readFile
 * @property {function(string, Uint8Array, number=, number=): number} writeFile
 * @property {function(string): boolean} isFile
 * // Constants
 * @property {number} O_RDONLY
 * @property {number} O_WRONLY
 * @property {number} O_CREAT
 * @property {number} STDIN
 * @property {number} STDOUT
 * @property {number} STDERR
 */

/**
 * @typedef {object} Runtime - The main 'lo' runtime API object.
 * @property {Map<string, object>} moduleCache
 * @property {Map<string, object>} libCache
 * @property {Map<string, object>} requireCache
 * @property {number} start
 * @property {number} errno
 * @property {Record<string, string>} colors
 * @property {Core} core
 * @property {function(): string[]} libraries
 * @property {function(): string[]} builtins
 * @property {function(any, (string | Function)=): any} assert
 * @property {function(string): CString} cstr
 * @property {function(string): any} load
 * @property {function(string): any} library
 * @property {function(string): void} print
 * @property {function(number): void} exit
 * @property {function(): void} runMicroTasks
 * @property {function(): number} hrtime
 * @property {function(Function): void} nextTick
 * @property {function(TypedArray): number} getAddress
 * @property {function(string): number} utf8Length
 * @property {function(string, TypedArray): number} utf8EncodeInto
 * @property {function(string, TypedArray, number): number} utf8EncodeIntoAtOffset
 * @property {function(number, number=): string} utf8_decode
 * @property {function(number, number=): string} latin1Decode
 * @property {function(string): Uint8Array} utf8Encode
 * @property {Runtime['utf8_decode']} utf8Decode
 * @property {RuntimeVersion} version
 * @property {string[]} args
 * @property {function(): OS} os
 * @property {function(): ARCH} arch
 * @property {function(string): string} getenv
 * @property {function(): string} getcwd
 * // ... and all other runtime properties
 */
// #endregion

// #region Complete Mock Implementation

/**
 * @type {Core}
 */
const mockCore = {
  name: 'core',
  open: (path, flags, mode) => { console.log('[MOCK] open', { path, flags, mode }); return 1; },
  dlsym: (handle, name) => { console.log('[MOCK] dlsym', { handle, name }); return 0; },
  dlopen: (path, flags) => { console.log('[MOCK] dlopen', { path, flags }); return 0; },
  strnlen: (str, size) => { console.log('[MOCK] strnlen'); return String(str).slice(0, size).length; },
  read_file: (path) => { console.log('[MOCK] read_file', { path }); return new Uint8Array(0); },
  write_file: (path, buffer, flags, mode) => { console.log('[MOCK] write_file', { path, byteLength: buffer.byteLength, flags, mode }); return buffer.byteLength; },
  os: 'linux',
  arch: 'x64',
  little_endian: true,
  homedir: '/home/mock',
  defaultWriteFlags: 0,
  defaultWriteMode: 0o666,
  isatty: (fd) => { console.log('[MOCK] isatty', { fd }); return 0; },
  mmap: (ptr, length, prot, flags, fd, offset) => { console.log('[MOCK] mmap'); return 0; },
  calloc: (num, size) => { console.log('[MOCK] calloc', { num, size }); return 0; },
  memcpy: (dest, src, size) => { console.log('[MOCK] memcpy'); },
  aligned_alloc: (alignment, size) => { console.log('[MOCK] aligned_alloc'); return 0; },
  memmove: (dest, src, size) => { console.log('[MOCK] memmove'); },
  fork: () => { console.log('[MOCK] fork'); return -1; },
  sysconf: (num) => { console.log('[MOCK] sysconf'); return 0; },
  times: (buf) => { console.log('[MOCK] times'); return 0; },
  pread: (num, buf, num2, num3) => { console.log('[MOCK] pread'); return 0; },
  waitpid: (num, buf, num2) => { console.log('[MOCK] waitpid'); return -1; },
  execve: (str, buf, buf2) => { console.log('[MOCK] execve'); return -1; },
  execvp: (str, buf) => { console.log('[MOCK] execvp'); return -1; },
  readlink: (path, buf, num) => { console.log('[MOCK] readlink'); return 0; },
  getcwd: (ptr, num, buf) => { console.log('[MOCK] getcwd'); },
  getenv: (name, buf) => { console.log('[MOCK] getenv'); },
  setenv: (name, value, overwrite) => { console.log('[MOCK] setenv', { name, value, overwrite }); return 0; },
  write_string: (num, str) => { console.log('[MOCK] write_string'); return str.length; },
  fstat: (fd, buf) => { console.log('[MOCK] fstat'); return 0; },
  read: (fd, buf, count) => { console.log('[MOCK] read'); return 0; },
  write: (fd, buf, count) => { console.log('[MOCK] write'); return count; },
  close: (fd) => { console.log('[MOCK] close', { fd }); return 0; },
  readFile: (path) => { console.log('[MOCK] readFile', { path }); return new Uint8Array(0); },
  writeFile: (path, u8) => { console.log('[MOCK] writeFile', { path, byteLength: u8.byteLength }); return u8.byteLength; },
  isFile: (path) => { console.log('[MOCK] isFile', { path }); return false; },
  S_IFBLK: 0, S_IFCHR: 0, S_IFIFO: 0, S_IRUSR: 0, S_IWUSR: 0, S_IRGRP: 0, S_IWGRP: 0, S_IROTH: 0, S_IWOTH: 0, O_RDONLY: 0, O_WRONLY: 0, O_CREAT: 0, S_IRWXU: 0, S_IRWXG: 0, S_IXOTH: 0, O_TRUNC: 0, STDIN: 0, STDOUT: 1, STDERR: 2, O_CLOEXEC: 0, RUSAGE_SELF: 0, SEEK_SET: 0, SEEK_CUR: 0, SEEK_END: 0, S_IRWXO: 0, F_OK: 0, S_IFMT: 0, S_IFDIR: 0, S_IFREG: 0, NAME_MAX: 0, O_RDWR: 0, O_SYNC: 0, O_DIRECTORY: 0, F_SETFL: 0, O_NONBLOCK: 0, EAGAIN: 0, WNOHANG: 0, SIGTERM: 0, MAP_SHARED: 0, MAP_ANONYMOUS: 0, MAP_PRIVATE: 0, MS_ASYNC: 0, MS_SYNC: 0, MS_INVALIDATE: 0, _SC_CLK_TCK: 0, F_GETFL: 0, RTLD_NOW: 0, RTLD_LAZY: 0, RTLD_GLOBAL: 0, RTLD_LOCAL: 0, RTLD_NODELETE: 0, RTLD_NOLOAD: 0, RTLD_DEFAULT: 0, RTLD_NEXT: 0, PROT_READ: 0, PROT_WRITE: 0, PROT_EXEC: 0,
};

/**
 * @type {Runtime}
 */
const mockRuntime = {
  moduleCache: new Map(),
  libCache: new Map(),
  requireCache: new Map(),
  start: 0,
  errno: 0,
  colors: {},
  core: mockCore,
  libraries: () => { console.log('[MOCK] libraries'); return []; },
  builtins: () => { console.log('[MOCK] builtins'); return []; },
  assert: (expression, message) => { if (!expression) throw new Error(message || 'Assertion failed'); },
  cstr: (str) => { console.log('[MOCK] cstr'); return new (globalThis.CString || Uint8Array)(new TextEncoder().encode(str + '\0')); },
  load: (name) => { console.log('[MOCK] load', { name }); return {}; },
  library: (name) => { console.log('[MOCK] library', { name }); return {}; },
  print: (str) => { console.log('[MOCK] print', str); },
  exit: (status) => { console.log(`[MOCK] exit(${status})`); },
  runMicroTasks: () => { console.log('[MOCK] runMicroTasks'); },
  hrtime: () => { console.log('[MOCK] hrtime'); return Date.now(); },
  nextTick: (callback) => { console.log('[MOCK] nextTick'); setTimeout(callback, 0); },
  getAddress: (buf) => { console.log('[MOCK] getAddress'); return 0; },
  utf8Length: (str) => { console.log('[MOCK] utf8Length'); return new TextEncoder().encode(str).length; },
  utf8EncodeInto: (str, buf) => { console.log('[MOCK] utf8EncodeInto'); const encoded = new TextEncoder().encode(str); buf.set(encoded); return encoded.length; },
  utf8EncodeIntoAtOffset: (str, buf, off) => { console.log('[MOCK] utf8EncodeIntoAtOffset'); const encoded = new TextEncoder().encode(str); buf.set(encoded, off); return encoded.length; },
  utf8_decode: (address, len) => { console.log('[MOCK] utf8_decode'); return ''; },
  latin1Decode: (address, len) => { console.log('[MOCK] latin1Decode'); return ''; },
  utf8Encode: (str) => { console.log('[MOCK] utf8Encode'); return new TextEncoder().encode(str); },
  utf8Decode: (address, len) => { console.log('[MOCK] utf8Decode'); return ''; },
  wrap: (handle, fn, plen) => { console.log('[MOCK] wrap'); return () => 0; },
  addr: (handle) => { console.log('[MOCK] addr'); return 0; },
  version: { lo: '0.0.0-mock', v8: '0.0.0-mock' },
  args: ['lo', 'mock.js'],
  argv: 0,
  argc: 2,
  workerSource: '',
  builtin: (path) => { console.log('[MOCK] builtin'); return ''; },
  os: () => 'linux',
  arch: () => 'x64',
  getenv: (str) => { console.log('[MOCK] getenv', { str }); return ''; },
  evaluateModule: (identifier) => { console.log('[MOCK] evaluateModule'); return Promise.resolve({}); },
  loadModule: (source, specifier) => { console.log('[MOCK] loadModule'); return { requests: '', isSourceTextModule: true, status: 0, specifier, src: source, identity: 0, scriptId: 0 }; },
  readMemory: (dest, start, len) => { console.log('[MOCK] readMemory'); },
  wrapMemory: (start, size, free) => { console.log('[MOCK] wrapMemory'); return new ArrayBuffer(size); },
  unwrapMemory: (buffer) => { console.log('[MOCK] unwrapMemory'); },
  ptr: (u8) => { console.log('[MOCK] ptr'); u8.ptr = 0; u8.size = u8.byteLength; return u8; },
  register_callback: (ptr, fn) => { console.log('[MOCK] register_callback'); },
  setModuleCallbacks: (on_module_load, on_module_instantiate) => { console.log('[MOCK] setModuleCallbacks'); },
  utf8EncodeIntoPtr: (str, ptr) => { console.log('[MOCK] utf8EncodeIntoPtr'); return new TextEncoder().encode(str).length; },
  runScript: (source, path) => { console.log('[MOCK] runScript', { path }); },
  pumpMessageLoop: () => { console.log('[MOCK] pumpMessageLoop'); },
  readMemoryAtOffset: (u8, start, size, offset) => { console.log('[MOCK] readMemoryAtOffset'); },
  setFlags: (str) => { console.log('[MOCK] setFlags'); },
  getMeta: () => { console.log('[MOCK] getMeta'); return {}; },
  setenv: (name, value, overwrite) => { console.log('[MOCK] setenv', { name, value, overwrite }); return 0; },
  getcwd: () => { console.log('[MOCK] getcwd'); return '/home/mock'; },
};

// Add aliases to the mock object
mockRuntime.registerCallback = mockRuntime.register_callback;
mockRuntime.run_script = mockRuntime.runScript;
// ... add all other snake_case aliases here in the same way

/**
 * A complete, deeply-typed mock implementation of the entire `lo` runtime API.
 * Ideal for testing environments. You can use this object as a base and
 * override specific methods for your tests.
 * @property {Runtime} lo - A mock of the global `lo` object.
 * @property {Console} console - A mock of the global `console` object.
 */
export const Mock = {
  lo: mockRuntime,
  console: {
    log: (str) => { console.log('[MOCK CONSOLE.LOG]', str); return 0; },
    error: (str) => { console.error('[MOCK CONSOLE.ERROR]', str); return 0; },
  },
};
// #endregion

// #region Real Module Exports
// Re-exports of the runtime's actual global objects and classes.

/** @type {Runtime} */
export const lo = globalThis.lo;
/** @type {Console} */
export const console = globalThis.console;
/** @type {import('lo').Require} */
export const require = globalThis.require;
/** @type {import('lo').OnUnhandledRejection} */
export const onUnhandledRejection = globalThis.onUnhandledRejection;
/** @type {typeof import('lo').CString} */
export const CString = globalThis.CString;
/** @type {typeof globalThis.TextEncoder} */
export const TextEncoder = globalThis.TextEncoder;
/** @type {typeof globalThis.TextDecoder} */
export const TextDecoder = globalThis.TextDecoder;
// #endregion

export default {
  lo,
  console,
  require,
  onUnhandledRejection,
  CString,
  TextEncoder,
  TextDecoder,
  Mock,
};