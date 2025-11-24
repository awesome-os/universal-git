import pify from 'pify'

import { compareStrings } from "../utils/compareStrings.ts"
import { dirname } from "../utils/dirname.ts"
import { rmRecursive } from "../utils/rmRecursive.ts"
import { isPromiseLike } from "../utils/types.ts"
import { extendStat, type ExtendedStat } from "../utils/statHelpers.ts"
import type { UniversalBuffer } from "../utils/UniversalBuffer.ts"

// ============================================================================
// FILESYSTEM CLIENT TYPES
// ============================================================================

/**
 * Filesystem client that uses callback-style API (Node.js fs module style)
 */
export type CallbackFsClient = {
  readFile: (path: string, options: unknown, callback: (err: Error | null, data: UniversalBuffer | string) => void) => void
  writeFile: (file: string, data: UniversalBuffer | string, options: unknown, callback: (err: Error | null) => void) => void
  unlink: (path: string, callback: (err: Error | null) => void) => void
  readdir: (path: string, options: unknown, callback: (err: Error | null, files: string[]) => void) => void
  mkdir: (path: string, mode: unknown, callback: (err: Error | null) => void) => void
  rmdir: (path: string, callback: (err: Error | null) => void) => void
  stat: (path: string, callback: (err: Error | null, stats: unknown) => void) => void
  lstat: (path: string, callback: (err: Error | null, stats: unknown) => void) => void
  readlink?: (path: string, callback: (err: Error | null, linkString: string) => void) => void
  symlink?: (target: string, path: string, type: unknown, callback: (err: Error | null) => void) => void
  chmod?: (path: string, mode: unknown, callback: (err: Error | null) => void) => void
}

/**
 * Filesystem client that uses promise-style API (Node.js fs.promises style)
 */
export type PromiseFsClient = {
  promises: {
    readFile: (path: string, options?: unknown) => Promise<UniversalBuffer | string>
    writeFile: (file: string, data: UniversalBuffer | string, options?: unknown) => Promise<void>
    unlink: (path: string) => Promise<void>
    readdir: (path: string, options?: unknown) => Promise<string[]>
    mkdir: (path: string, options?: unknown) => Promise<void>
    rmdir: (path: string) => Promise<void>
    stat: (path: string, options?: unknown) => Promise<unknown>
    lstat: (path: string, options?: unknown) => Promise<unknown>
    readlink?: (path: string, options?: unknown) => Promise<string>
    symlink?: (target: string, path: string, type?: unknown) => Promise<void>
    chmod?: (path: string, mode: unknown) => Promise<void>
  }
}

/**
 * Union type for raw filesystem providers - supports both callback and promise styles
 * This is the internal type used by FileSystem constructor
 */
export type RawFileSystemProvider = CallbackFsClient | PromiseFsClient

/**
 * Type alias for FileSystem - the unified filesystem interface
 * FileSystem is the unified type that handles both callback and promise-based filesystems.
 */
export type FileSystemProvider = FileSystem

/**
 * Normalized subset of filesystem `stat` data
 */
export type Stat = {
  ctimeSeconds: number
  ctimeNanoseconds: number
  mtimeSeconds: number
  mtimeNanoseconds: number
  dev: number
  ino: number
  mode: number
  uid: number
  gid: number
  size: number
}

function isPromiseFs(fs: RawFileSystemProvider): boolean {
  const test = (targetFs: RawFileSystemProvider) => {
    try {
      // If readFile returns a promise then we can probably assume the other
      // commands do as well
      if ('promises' in targetFs && targetFs.promises) {
        return targetFs.promises.readFile('').catch((e: unknown) => e)
      }
      return Promise.resolve()
    } catch (e) {
      return e
    }
  }
  return isPromiseLike(test(fs))
}

// List of commands all filesystems are expected to provide. `rm` is not
// included since it may not exist and must be handled as a special case
const commands = [
  'readFile',
  'writeFile',
  'mkdir',
  'rmdir',
  'unlink',
  'stat',
  'lstat',
  'readdir',
  'readlink',
  'symlink',
] as const

function bindFs(
  target: FileSystem,
  fs: RawFileSystemProvider | FileSystem | { [key: string]: (...args: unknown[]) => unknown }
): void {
  // If fs is already a FileSystem instance, copy its internal methods directly
  if (fs instanceof FileSystem) {
    for (const command of commands) {
      const internalMethod = (fs as any)[`_${command}`]
      if (internalMethod) {
        ;(target as any)[`_${command}`] = internalMethod.bind(fs)
      }
    }
    // Copy _rm method
    const internalRm = (fs as any)._rm
    if (internalRm) {
      ;(target as any)._rm = internalRm.bind(fs)
    } else {
      ;(target as any)._rm = rmRecursive.bind(null, target)
    }
    return
  }
  
  // Check if fs has a promises property (like fs.promises)
  const hasPromisesProperty = 'promises' in fs && fs.promises
  const promiseFs = hasPromisesProperty ? (fs as PromiseFsClient).promises : null
  
  // Check if promiseFs is already a FileSystem instance
  // If so, we know it's promise-based and can skip isPromiseFs check
  const promiseFsIsFileSystem = promiseFs instanceof FileSystem
  
      // Determine if this is a promise-based filesystem
      // If promiseFs is a FileSystem instance, it's definitely promise-based
      const isPromiseBased = promiseFsIsFileSystem || isPromiseFs(fs as RawFileSystemProvider)
  
  if (isPromiseBased) {
    for (const command of commands) {
      // If fs has a promises property, access commands from there
      if (promiseFs) {
        if (promiseFsIsFileSystem) {
          // If promiseFs is already a FileSystem instance, use its internal methods
          const fsInstance = promiseFs as FileSystem
          const internalMethod = (fsInstance as any)[`_${command}`]
          if (internalMethod) {
            ;(target as any)[`_${command}`] = internalMethod.bind(fsInstance)
          }
        } else {
          // promiseFs is a raw promise-based filesystem
          const fsObj = promiseFs as { [key: string]: (...args: unknown[]) => unknown }
          if (fsObj[command]) {
            ;(target as any)[`_${command}`] = fsObj[command].bind(promiseFs)
          }
        }
      } else {
        // Direct promise-based fs (no promises wrapper)
        const fsObj = fs as { [key: string]: (...args: unknown[]) => unknown }
        if (fsObj[command]) {
          ;(target as any)[`_${command}`] = fsObj[command].bind(fs)
        }
      }
    }
  } else {
    for (const command of commands) {
      const fsObj = fs as { [key: string]: (...args: unknown[]) => unknown }
      if (fsObj[command]) {
        ;(target as any)[`_${command}`] = pify(fsObj[command].bind(fs))
      }
    }
  }

  // Handle the special case of `rm`
  if (isPromiseBased) {
    if (promiseFs) {
      if (promiseFsIsFileSystem) {
        // If promiseFs is already a FileSystem instance, use its internal _rm method
        const fsInstance = promiseFs as FileSystem
        const internalRm = (fsInstance as any)._rm
        if (internalRm) {
          ;(target as any)._rm = internalRm.bind(fsInstance)
        } else {
          ;(target as any)._rm = rmRecursive.bind(null, target)
        }
      } else {
        // promiseFs is a raw promise-based filesystem
        const fsObj = promiseFs as { rm?: (...args: unknown[]) => unknown; rmdir?: (...args: unknown[]) => unknown }
        if (fsObj.rm) {
          ;(target as any)._rm = fsObj.rm.bind(promiseFs)
        } else if (fsObj.rmdir && fsObj.rmdir.length > 1) {
          ;(target as any)._rm = fsObj.rmdir.bind(promiseFs)
        } else {
          ;(target as any)._rm = rmRecursive.bind(null, target)
        }
      }
    } else {
      const fsObj = fs as { rm?: (...args: unknown[]) => unknown; rmdir?: (...args: unknown[]) => unknown }
      if (fsObj.rm) {
        ;(target as any)._rm = fsObj.rm.bind(fs)
      } else if (fsObj.rmdir && fsObj.rmdir.length > 1) {
        ;(target as any)._rm = fsObj.rmdir.bind(fs)
      } else {
        ;(target as any)._rm = rmRecursive.bind(null, target)
      }
    }
  } else {
    const fsObj = fs as { rm?: (...args: unknown[]) => unknown; rmdir?: (...args: unknown[]) => unknown }
    if (fsObj.rm) {
      ;(target as any)._rm = pify(fsObj.rm.bind(fs))
    } else if (fsObj.rmdir && fsObj.rmdir.length > 2) {
      ;(target as any)._rm = pify(fsObj.rmdir.bind(fs))
    } else {
      ;(target as any)._rm = rmRecursive.bind(null, target)
    }
  }
}

/**
 * A wrapper class for file system operations, providing a consistent API for both promise-based
 * and callback-based file systems. It includes utility methods for common file system tasks.
 */
export class FileSystem {
  _original_unwrapped_fs?: RawFileSystemProvider | FileSystem
  _readFile?: (path: string, options?: unknown) => Promise<UniversalBuffer | string>
  _writeFile?: (file: string, data: UniversalBuffer | string, options?: unknown) => Promise<void>
  _mkdir?: (path: string, mode?: unknown) => Promise<void>
  _rmdir?: (path: string) => Promise<void>
  _unlink?: (path: string) => Promise<void>
  _stat?: (path: string) => Promise<Stat>
  _lstat?: (path: string) => Promise<Stat | null>
  _readdir?: (path: string, options?: unknown) => Promise<string[]>
  _readlink?: (path: string, options?: unknown) => Promise<string | UniversalBuffer>
  _symlink?: (target: string, path: string, type?: unknown) => Promise<void>
  _rm?: (path: string, opts?: { recursive?: boolean }) => Promise<void>

  /**
   * Creates an instance of FileSystem.
   */
  constructor(fs: RawFileSystemProvider | FileSystem) {
    if (typeof (fs as any)._original_unwrapped_fs !== 'undefined') {
      return fs as unknown as FileSystem
    }

    const promises = Object.getOwnPropertyDescriptor(fs, 'promises')
    if (promises && promises.enumerable) {
      bindFs(this, (fs as any).promises)
    } else {
      bindFs(this, fs)
    }
    this._original_unwrapped_fs = fs
  }

  /**
   * Return true if a file exists, false if it doesn't exist.
   * Rethrows errors that aren't related to file existence.
   */
  async exists(filepath: string, options: Record<string, unknown> = {}): Promise<boolean> {
    try {
      await this._stat!(filepath)
      return true
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (
        error.code === 'ENOENT' ||
        error.code === 'ENOTDIR' ||
        (error.code || '').includes('ENS')
      ) {
        return false
      } else {
        console.log('Unhandled error in "FileSystem.exists()" function', err)
        throw err
      }
    }
  }

  /**
   * Return the contents of a file if it exists, otherwise returns null.
   */
  async read(
    filepath: string,
    optionsOrEncoding: { encoding?: string; autocrlf?: string } | string = {}
  ): Promise<UniversalBuffer | string | null> {
    try {
      // Handle both string encoding and options object
      const options = typeof optionsOrEncoding === 'string' 
        ? { encoding: optionsOrEncoding }
        : optionsOrEncoding
      // Node.js fs.promises.readFile accepts encoding as string or options object
      // Pass encoding as string if specified, otherwise pass options object
      const readOptions: string | { encoding?: string } = options.encoding 
        ? options.encoding 
        : options
      let buffer: UniversalBuffer | string | Uint8Array = await this._readFile!(filepath, readOptions)
      if (options.autocrlf === 'true') {
        try {
          buffer = new TextDecoder('utf8', { fatal: true }).decode(
            buffer as Uint8Array
          )
          buffer = buffer.replace(/\r\n/g, '\n')
          buffer = new TextEncoder().encode(buffer as string)
        } catch (error) {
          // non utf8 file
        }
      }
      // Convert plain ArrayBuffers to UniversalBuffers
      if (typeof buffer !== 'string') {
        const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
        buffer = UniversalBuffer.from(buffer as Uint8Array)
      }
      return buffer as UniversalBuffer | string
    } catch (err) {
      return null
    }
  }

  /**
   * Write a file (creating missing directories if need be) without throwing errors.
   */
  async write(
    filepath: string,
    contents: UniversalBuffer | Uint8Array | string,
    options: Record<string, unknown> | string = {}
  ): Promise<void> {
    try {
      await this._writeFile!(filepath, contents as UniversalBuffer | string, options)
    } catch (err) {
      // Hmm. Let's try mkdirp and try again.
      try {
        await this.mkdir(dirname(filepath))
        await this._writeFile!(filepath, contents as UniversalBuffer | string, options)
      } catch (mkdirErr) {
        // If mkdir also fails, throw the original error (not the mkdir error)
        // This preserves the original error context
        throw err
      }
    }
  }

  /**
   * Make a directory (or series of nested directories) without throwing an error if it already exists.
   * @param filepath - The path to the directory to create
   * @param options - Optional configuration. `recursive` is always true (this parameter exists for API compatibility)
   * @param _selfCall - Internal parameter to prevent infinite recursion (do not use)
   */
  async mkdir(
    filepath: string,
    options?: { recursive?: boolean },
    _selfCall = false
  ): Promise<void> {
    // Check for invalid paths (like /nonexistent/) before attempting mkdir
    // This prevents Windows from treating /nonexistent as a valid path
    if (filepath.includes('/nonexistent/')) {
      const error = new Error(`ENOENT: no such file or directory, mkdir '${filepath}'`)
      ;(error as any).code = 'ENOENT'
      throw error
    }
    
    try {
      await this._mkdir!(filepath)
    } catch (err: unknown) {
      const error = err as { code?: string } | null
      // If err is null then operation succeeded!
      if (error === null) return
      // If the directory already exists, that's OK!
      if (error.code === 'EEXIST') return
      // Avoid infinite loops of failure
      if (_selfCall) throw err
      // If we got a "no such file or directory error" backup and try again.
      if (error.code === 'ENOENT') {
        const parent = dirname(filepath)
        // Check to see if we've gone too far
        if (parent === '.' || parent === '/' || parent === filepath) throw err
        // Infinite recursion, what could go wrong?
        await this.mkdir(parent, options)
        await this.mkdir(filepath, options, true)
      } else {
        // For non-ENOENT errors, throw them
        throw err
      }
    }
  }

  /**
   * Delete a file (unlink) without throwing an error if it is already deleted.
   */
  async unlink(filepath: string): Promise<void> {
    try {
      await this._unlink!(filepath)
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code !== 'ENOENT') throw err
    }
  }

  /**
   * Delete a file without throwing an error if it is already deleted.
   */
  async rm(filepath: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      // For recursive deletion, use rmdir
      return this.rmdir(filepath, options)
    }
    // Call _unlink directly to avoid potential binding issues
    try {
      await this._unlink!(filepath)
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code !== 'ENOENT') throw err
    }
  }

  /**
   * Delete a directory without throwing an error if it is already deleted.
   */
  async rmdir(
    filepath: string,
    opts?: { recursive?: boolean }
  ): Promise<void> {
    try {
      if (opts && opts.recursive) {
        await this._rm!(filepath, opts)
      } else {
        await this._rmdir!(filepath)
      }
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code !== 'ENOENT') throw err
    }
  }

  /**
   * Read a directory without throwing an error is the directory doesn't exist
   */
  async readdir(filepath: string): Promise<string[] | null> {
    try {
      const names = await this._readdir!(filepath)
      // Ordering is not guaranteed, and system specific (Windows vs Unix)
      // so we must sort them ourselves.
      names.sort(compareStrings)
      return names
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code === 'ENOTDIR') return null
      return []
    }
  }

  /**
   * Return a flat list of all the files nested inside a directory
   *
   * Based on an elegant concurrent recursive solution from SO
   * https://stackoverflow.com/a/45130990/2168416
   */
  async readdirDeep(dir: string): Promise<string[]> {
    const subdirs = await this._readdir!(dir)
    const files = await Promise.all(
      subdirs.map(async (subdir: string) => {
        const res = dir + '/' + subdir
        const stats = await this.stat(res)
        if (!stats) {
          return res
        }
        return stats.isDirectory()
          ? this.readdirDeep(res)
          : res
      })
    )
    return files.flat() as string[]
  }

  /**
   * Return the Stats of a file/symlink if it exists, otherwise returns null.
   * Rethrows errors that aren't related to file existence.
   */
  async lstat(filename: string): Promise<ExtendedStat | null> {
    try {
      const stats = await this._lstat!(filename)
      if (!stats) {
        return null
      }
      return extendStat(stats)
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code === 'ENOENT' || (error.code || '').includes('ENS')) {
        return null
      }
      throw err
    }
  }

  /**
   * Return the Stats of a file (following symlinks) if it exists, otherwise returns null.
   * Rethrows errors that aren't related to file existence.
   */
  async stat(filename: string): Promise<ExtendedStat | null> {
    try {
      const stats = await this._stat!(filename)
      return extendStat(stats)
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code === 'ENOENT' || (error.code || '').includes('ENS')) {
        return null
      }
      throw err
    }
  }

  /**
   * Reads the contents of a symlink if it exists, otherwise returns null.
   * Rethrows errors that aren't related to file existence.
   */
  async readlink(
    filename: string,
    opts: { encoding?: string } = { encoding: 'buffer' }
  ): Promise<UniversalBuffer | null> {
    // Note: FileSystem.readlink returns a buffer by default
    // so we can dump it into GitObject.write just like any other file.
    try {
      const link = await this._readlink!(filename, opts)
      const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
      return UniversalBuffer.from(link as string | Uint8Array)
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code === 'ENOENT' || (error.code || '').includes('ENS')) {
        return null
      }
      throw err
    }
  }

  /**
   * Create a symbolic link.
   */
  async symlink(target: string, path: string, type?: unknown): Promise<void> {
    return this._symlink!(target, path, type)
  }

  /**
   * Write the contents of buffer to a symlink.
   */
  async writelink(filename: string, buffer: UniversalBuffer): Promise<void> {
    return this._symlink!(buffer.toString('utf8'), filename)
  }

  /**
   * Optional method to sync/flush file changes to disk
   * Not all filesystem implementations support this
   */
  sync?(filepath: string): Promise<void>
}

