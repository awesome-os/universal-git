/// <reference path="../globals.d.ts" />

/**
 * @file node_compat.js
 * A compatibility layer to provide Node.js-like APIs within the 'lo' runtime.
 *
 * This file should be required at the start of your application to polyfill
 * common Node.js globals like `process`, `Buffer`, and core modules like `fs`.
 *
 * Usage:
 * // at the top of your main script:
 * globalThis.require = require('./node_compat.js')(globalThis.require);
 *
 * // now you can use Node.js APIs:
 * const fs = require('fs');
 * const path = require('path');
 *
 * console.log(`Running on ${process.platform}`);
 * fs.writeFileSync('./hello.txt', 'Hello from Node.js compat layer!');
 */

(function (global) {
  // Store the original require function from the 'lo' runtime
  const originalRequire = global.require;

  // --- Polyfill: Buffer ---
  // Node.js's Buffer is a Uint8Array with extra methods.
  class Buffer extends Uint8Array {
    constructor(...args) {
      super(...args);
    }

    /**
     * @param {string} string
     * @param {string} [encoding='utf8']
     * @returns {Buffer}
     */
    static from(string, encoding = 'utf8') {
      if (encoding.toLowerCase() !== 'utf8') {
        // Only UTF-8 is directly supported by the 'lo' runtime for now.
        throw new Error('Encoding not supported: ' + encoding);
      }
      // Use the runtime's efficient utf8 encoder
      const u8 = lo.utf8Encode(string);
      return new Buffer(u8.buffer, u8.byteOffset, u8.byteLength);
    }

    /**
     * @param {number} size
     * @returns {Buffer}
     */
    static alloc(size) {
      return new Buffer(size);
    }

    /**
     * @param {string} [encoding='utf8']
     * @returns {string}
     */
    toString(encoding = 'utf8') {
      if (encoding.toLowerCase() !== 'utf8') {
        throw new Error('Encoding not supported: ' + encoding);
      }
      // Use the global TextDecoder, which should be available in 'lo'
      return new TextDecoder().decode(this);
    }
  }

  // --- Polyfill: process global ---
  const process = {
    argv: lo.args,
    arch: lo.arch(),
    platform: (() => {
      const os = lo.os();
      if (os === 'mac') return 'darwin';
      if (os === 'win') return 'win32';
      return 'linux'; // Default to linux
    })(),
    env: new Proxy({}, {
      get(target, prop) {
        return lo.getenv(prop);
      },
      set(target, prop, value) {
        // The `overwrite` parameter (1) is the default for Node.js `process.env`.
        lo.setenv(prop, String(value), 1);
        return true;
      },
      // Note: `Object.keys(process.env)` cannot be implemented without a
      // function to list all environment variables.
    }),
    cwd: () => lo.getcwd(),
    exit: (code = 0) => lo.exit(code),
    nextTick: (cb, ...args) => lo.nextTick(() => cb(...args)),
    stdout: {
      // This is a minimal stream-like object, not a full Node.js stream.
      write: (chunk) => {
        const str = (typeof chunk === 'string') ? chunk : chunk.toString();
        const bytes = lo.utf8Encode(str);
        return lo.core.write(lo.core.STDOUT, bytes, bytes.byteLength);
      },
      isTTY: !!lo.core.isatty(lo.core.STDOUT),
    },
    stderr: {
      write: (chunk) => {
        const str = (typeof chunk === 'string') ? chunk : chunk.toString();
        const bytes = lo.utf8Encode(str);
        return lo.core.write(lo.core.STDERR, bytes, bytes.byteLength);
      },
      isTTY: !!lo.core.isatty(lo.core.STDERR),
    },
    stdin: {
      // Minimal implementation for reading
      read: (size) => {
        const buf = Buffer.alloc(size);
        const bytesRead = lo.core.read(lo.core.STDIN, buf, size);
        if (bytesRead > 0) {
            return buf.slice(0, bytesRead);
        }
        return null;
      },
      isTTY: !!lo.core.isatty(lo.core.STDIN),
    },
    versions: {
      ...lo.version,
      // Other versions are not available in the 'lo' runtime
      node: lo.version.lo, // Map lo version to node for compatibility
    },
  };

  // --- Built-in Module: 'fs' ---
  // NOTE: This only implements the synchronous versions of fs methods,
  // as the 'lo' runtime API appears to be synchronous.
  const fs = {
    readFileSync: (path, options) => {
      const encoding = typeof options === 'string' ? options : options?.encoding;
      const buffer = Buffer.from(lo.core.readFile(path));
      if (encoding) {
        return buffer.toString(encoding);
      }
      return buffer;
    },
    writeFileSync: (path, data, options) => {
      const encoding = typeof options === 'string' ? options : options?.encoding;
      const buffer = typeof data === 'string' ? Buffer.from(data, encoding) : data;
      return lo.core.writeFile(path, buffer);
    },
    existsSync: (path) => {
        // A simple check can be attempted by trying to get file status.
        // `lo.core.isFile` might be the closest thing if a stat-like function is missing.
        // A more robust way is to try opening and closing the file.
        try {
            const fd = lo.core.open(path, lo.core.O_RDONLY);
            if (fd >= 0) {
                lo.core.close(fd);
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    },
    // Add other fs functions here by mapping them to `lo.core`
    // e.g., statSync, mkdirSync, etc. if primitives are available.
  };
  fs.constants = lo.core; // Expose all the O_* and S_* constants

  // --- Built-in Module: 'os' ---
  const os = {
    arch: () => process.arch,
    platform: () => process.platform,
    homedir: () => lo.core.homedir,
    // Other os functions like cpus(), totalmem() are not available in `lo` API.
  };

  // --- Built-in Module: 'path' ---
  // This is a minimal, pure-JS implementation of the path module.
  const path = {
      sep: lo.os() === 'win' ? '\\' : '/',
      join(...args) {
          const joined = args.filter(p => p).join(this.sep);
          // Simple cleanup for multiple separators
          return joined.replace(new RegExp(`${this.sep}{2,}`, 'g'), this.sep);
      },
      resolve(...args) {
          let resolvedPath = lo.getcwd();
          for (const p of args) {
              if (p.startsWith(this.sep)) {
                  resolvedPath = p;
              } else {
                  resolvedPath = this.join(resolvedPath, p);
              }
          }
          return resolvedPath;
      },
      basename(p, ext) {
          const base = p.substring(p.lastIndexOf(this.sep) + 1);
          if (ext && base.endsWith(ext)) {
              return base.substring(0, base.length - ext.length);
          }
          return base;
      }
  };


  // --- Cache for our built-in modules ---
  const builtinModules = {
    fs,
    os,
    path,
  };

  // --- The new `require` function ---
  function createCompatRequire() {
    return function require(id) {
      if (builtinModules[id]) {
        return builtinModules[id];
      }
      // If it's not a built-in, fall back to the runtime's original require.
      return originalRequire(id);
    };
  }

  // --- Export and Global Setup ---
  // Make the new require creator available
  module.exports = createCompatRequire;

  // For convenience, also patch the globals if this file is required directly
  if (global.require === originalRequire) {
    global.Buffer = Buffer;
    global.process = process;
    // Overwrite the global require with our new enhanced version
    global.require = createCompatRequire();
  }

})(globalThis);