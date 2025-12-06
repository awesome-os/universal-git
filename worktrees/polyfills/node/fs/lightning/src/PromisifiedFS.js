import DefaultBackend from '../_virtual/DefaultBackend.js';
import Stat from './Stat.js';
import * as path from './path.js';

// Helper to normalize the 'opts' parameter, which can be a string, object, or undefined.
const normalizeOpts = (opts) => {
  if (typeof opts === 'string') return { encoding: opts };
  // Return the object if it's a valid object, otherwise return an empty object.
  if (typeof opts === 'object' && opts !== null) return opts;
  return {};
};

// Simplified parameter cleaning functions
const cleanParamsFilepathOpts = (filepath, opts, ...rest) => [path.normalize(filepath), normalizeOpts(opts), ...rest];
const cleanParamsFilepathDataOpts = (filepath, data, opts, ...rest) => [path.normalize(filepath), data, normalizeOpts(opts), ...rest];
const cleanParamsFilepathFilepath = (oldPath, newPath, ...rest) => [path.normalize(oldPath), path.normalize(newPath), ...rest];

class PromisifiedFS {
  _deactivationPromise = null;
  _deactivationTimeout = null;
  _activationPromise = null;
  _operations = new Set();

  constructor(name, options = {}) {
    // Methods are now auto-bound by using arrow function properties or are called via `this.`
    // which preserves the correct context, removing the need for `bind` in the constructor.
    this.readFile = this._wrap(this.readFile, cleanParamsFilepathOpts, false);
    this.writeFile = this._wrap(this.writeFile, cleanParamsFilepathDataOpts, true);
    this.unlink = this._wrap(this.unlink, cleanParamsFilepathOpts, true);
    this.readdir = this._wrap(this.readdir, cleanParamsFilepathOpts, false);
    this.mkdir = this._wrap(this.mkdir, cleanParamsFilepathOpts, true);
    this.rmdir = this._wrap(this.rmdir, cleanParamsFilepathOpts, true);
    this.rename = this._wrap(this.rename, cleanParamsFilepathFilepath, true);
    this.stat = this._wrap(this.stat, cleanParamsFilepathOpts, false);
    this.lstat = this._wrap(this.lstat, cleanParamsFilepathOpts, false);
    this.readlink = this._wrap(this.readlink, cleanParamsFilepathOpts, false);
    this.symlink = this._wrap(this.symlink, cleanParamsFilepathFilepath, true);
    this.backFile = this._wrap(this.backFile, cleanParamsFilepathOpts, true);
    this.du = this._wrap(this.du, cleanParamsFilepathOpts, false);

    if (name) {
      this.init(name, options);
    }
  }

  // Using an arrow function as a class property auto-binds `this`.
  init = async (...args) => {
    if (this._initPromiseResolve) await this._initPromise;
    this._initPromise = this._init(...args);
    return this._initPromise;
  };

  async _init(name, options = {}) {
    await this._gracefulShutdown();
    if (this._activationPromise) await this._deactivate();

    await this._backend?.destroy(); // Optional chaining
    
    this._backend = options.backend || new DefaultBackend();
    await this._backend?.init(name, options); // Optional chaining

    if (this._initPromiseResolve) {
      this._initPromiseResolve();
      this._initPromiseResolve = null;
    }

    if (!options.defer) {
      this.stat('/'); // Initial activation
    }
  }

  async _gracefulShutdown() {
    if (this._operations.size > 0) {
      this._isShuttingDown = true;
      await new Promise(resolve => (this._gracefulShutdownResolve = resolve));
      this._isShuttingDown = false;
      this._gracefulShutdownResolve = null;
    }
  }

  _wrap(fn, paramCleaner, mutating) {
    return async (...args) => {
      const cleanedArgs = paramCleaner(...args);
      const op = { name: fn.name, args: cleanedArgs };
      this._operations.add(op);
      
      try {
        await this._activate();
        return await fn.apply(this, cleanedArgs);
      } finally {
        this._operations.delete(op);
        if (mutating) this._backend.saveSuperblock(); // Debounced
        if (this._operations.size === 0) {
          if (this._deactivationTimeout) clearTimeout(this._deactivationTimeout);
          this._deactivationTimeout = setTimeout(() => this._deactivate(), 500);
        }
      }
    };
  }

  async _activate() {
    if (!this._initPromise) console.warn(new Error(`Attempted to use LightningFS ${this._name} before it was initialized.`));
    await this._initPromise;
    
    if (this._deactivationTimeout) {
      clearTimeout(this._deactivationTimeout);
      this._deactivationTimeout = null;
    }
    
    await this._deactivationPromise;
    this._deactivationPromise = null;
    
    if (!this._activationPromise) {
      // Use optional chaining and nullish coalescing for cleaner fallback.
      this._activationPromise = this._backend?.activate() ?? Promise.resolve();
    }
    await this._activationPromise;
  }

  async _deactivate() {
    await this._activationPromise;

    if (!this._deactivationPromise) {
      this._deactivationPromise = this._backend?.deactivate() ?? Promise.resolve();
    }
    
    this._activationPromise = null;
    this._gracefulShutdownResolve?.(); // Optional chaining for function call
    return this._deactivationPromise;
  }

  // The public API methods are already clean and modern.
  async readFile(filepath, opts) { return this._backend.readFile(filepath, opts); }
  async writeFile(filepath, data, opts) { await this._backend.writeFile(filepath, data, opts); }
  async unlink(filepath, opts) { await this._backend.unlink(filepath, opts); }
  async readdir(filepath, opts) { return this._backend.readdir(filepath, opts); }
  async mkdir(filepath, opts) { await this._backend.mkdir(filepath, opts); }
  async rmdir(filepath, opts) { await this._backend.rmdir(filepath, opts); }
  async rename(oldFilepath, newFilepath) { await this._backend.rename(oldFilepath, newFilepath); }
  async stat(filepath, opts) { return new Stat(await this._backend.stat(filepath, opts)); }
  async lstat(filepath, opts) { return new Stat(await this._backend.lstat(filepath, opts)); }
  async readlink(filepath, opts) { return this._backend.readlink(filepath, opts); }
  async symlink(target, filepath) { await this._backend.symlink(target, filepath); }
  async backFile(filepath, opts) { await this._backend.backFile(filepath, opts); }
  async du(filepath) { return this._backend.du(filepath); }
  async flush() { return this._backend.flush(); }
}

export { PromisifiedFS  };
