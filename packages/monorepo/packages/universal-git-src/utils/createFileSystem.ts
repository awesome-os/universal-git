import { FileSystem } from '../models/FileSystem.ts'
import type { RawFileSystemProvider, FileSystemProvider } from '../models/FileSystem.ts'

// A WeakMap to cache the FileSystem wrapper for each raw fs object.
// This ensures that the same raw fs object always returns the same FileSystem wrapper instance,
// which is critical for Repository instance caching to work correctly.
const wrapperCache = new WeakMap<object, FileSystem>()

/**
 * Creates a normalized FileSystem instance from a raw filesystem client.
 * 
 * This is the preferred way to create a FileSystem instance. It hides the
 * implementation details of the FileSystem class and provides a clean factory
 * interface for consumers.
 * 
 * This function is the ONLY file that should know about the FileSystem class
 * implementation. All other code should use this factory function instead of
 * directly instantiating FileSystem.
 * 
 * @param fs - Raw filesystem client (callback or promise-based) or existing FileSystem instance
 * @returns A normalized FileSystem instance with a consistent API
 * 
 * @example
 * ```typescript
 * import * as fs from 'fs'
 * import { createFileSystem } from './utils/createFileSystem'
 * 
 * const FileSystemProvider = createFileSystem(fs)
 * // Now you can use FileSystemProvider with all git commands
 * ```
 */
export function createFileSystem(fs: RawFileSystemProvider | FileSystemProvider): FileSystemProvider {
  // Guard against undefined/null fs
  if (fs == null) {
    throw new Error('createFileSystem: fs parameter is required but was undefined or null')
  }

  // If fs is already a FileSystem instance, return it directly
  if (fs instanceof FileSystem) {
    return fs
  }

  // The raw fs object is the true source of identity.
  // If 'fs' is already a FileSystem wrapper, we can use it directly as the key.
  // Otherwise, use the raw fs object as the key.
  const rawFs = (fs as any)._original_unwrapped_fs || fs
  const key = rawFs as object

  // 1. Check if we have already created a wrapper for this raw fs instance.
  if (wrapperCache.has(key)) {
    return wrapperCache.get(key)!
  }

  // 2. If not, create a new wrapper. The FileSystem constructor is smart
  //    and won't re-wrap an existing wrapper.
  const wrapper = new FileSystem(fs as any)

  // 3. Cache the new wrapper against the raw fs object.
  wrapperCache.set(key, wrapper)

  return wrapper
}

// Export the types for those who want them, but primary interaction is through factory
export type { FileSystem, FileSystemProvider, RawFileSystemProvider } from '../models/FileSystem.ts'

