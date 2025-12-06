/**
 * Reads a Git reference directly from .git/refs/ or .git/packed-refs
 * This is the single source of truth - reads directly from disk
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param ref - Reference name (e.g., 'HEAD', 'refs/heads/main', 'main')
 * @param depth - Maximum depth for symbolic ref resolution (default: 5)
 * @returns The resolved OID or null if ref doesn't exist
 */
import { NotFoundError } from '../errors/NotFoundError.ts'
import { parsePackedRefs, readPackedRefs } from './packedRefs.ts'
import { join } from '../../core-utils/GitPath.ts'
import { createFileSystem } from '../backends/GitBackendFs/utils/createFileSystem.ts'
import { validateOid, getOidLength, type ObjectFormat } from '../backends/GitBackendFs/utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../backends/GitBackendFs/utils/UniversalBuffer.ts'
import AsyncLock from 'async-lock'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

// @see https://git-scm.com/docs/git-rev-parse.html#_specifying_revisions
const refpaths = (ref: string): string[] => [
  `${ref}`,
  `refs/${ref}`,
  `refs/tags/${ref}`,
  `refs/heads/${ref}`,
  `refs/remotes/${ref}`,
  `refs/remotes/${ref}/HEAD`,
]

// @see https://git-scm.com/docs/gitrepository-layout
const GIT_FILES = ['config', 'description', 'index', 'shallow', 'commondir']

let lock: AsyncLock | undefined

const acquireLock = async <T>(ref: string, callback: () => Promise<T>): Promise<T> => {
  if (lock === undefined) lock = new AsyncLock()
  return lock.acquire(ref, callback)
}

/**
 * Reads a Git reference and resolves it to an OID
 * Handles both direct refs and symbolic refs (like HEAD -> refs/heads/main)
 */
export async function readRef({
  fs,
  gitdir,
  ref,
  depth = 5,
  objectFormat = 'sha1',
  cache = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  depth?: number
  objectFormat?: ObjectFormat
  cache?: Record<string, unknown>
}): Promise<string | null> {
  // Ensure ref is a string
  if (typeof ref !== 'string') {
    return null
  }
  
  // Handle depth=0 early return for ref pointer strings and OIDs
  // But allow ref paths to continue so we can read the file
  if (depth <= 0) {
    // If it's a ref pointer string (not a file path), return the target
    if (ref.startsWith('ref: ')) {
      return ref.slice('ref: '.length).trim()
    }
    // If it's already a valid OID, return it
    if (validateOid(ref, objectFormat)) {
      return ref
    }
    // If depth=0 and it's a ref path, we still need to read the file
    // to get the OID (if it's a direct ref) or return the ref path (if it's symbolic)
    // So we continue to read the file below
  }

  // Is it a ref pointer?
  if (ref.startsWith('ref: ')) {
    const targetRef = ref.slice('ref: '.length).trim()
    // If depth is 1, resolve the target ref to its OID (one level of resolution)
    if (depth === 1) {
      return readRef({ fs, gitdir, ref: targetRef, depth: 0, objectFormat, cache })
    }
    return readRef({ fs, gitdir, ref: targetRef, depth: depth - 1, objectFormat, cache })
  }

  // Is it a complete and valid SHA?
  if (validateOid(ref, objectFormat)) {
    return ref
  }

  // Look in all the proper paths, in this order
  const allpaths = refpaths(ref).filter(p => !GIT_FILES.includes(p)) // exclude git system files

  const normalizedFs = createFileSystem(fs)
  
  // CRITICAL: To synchronize with writeRef, we need to lock on the original ref name
  // when checking the first path (which equals the ref). For other paths, we use
  // path-specific locks. This prevents deadlocks while ensuring synchronization.
  // IMPORTANT: We read packed-refs INSIDE the lock for the first path to ensure
  // we see the latest state after any concurrent writes complete.
  for (const refPath of allpaths) {
    // Use the original ref name as lock key for the first path to sync with writeRef
    // For other paths, use the path itself as the lock key
    const lockKey = refPath === ref ? ref : refPath
    // For the first path (which equals the ref), we need more aggressive retry logic
    // because writeRef might have just released the lock but the file write hasn't
    // been fully flushed to disk yet
    const isFirstPath = refPath === ref
    const maxRetries = isFirstPath ? 10 : 3
    
    const sha = await acquireLock(lockKey, async () => {
      // Retry logic to handle race conditions with concurrent writes
      // If a write is in progress, the file might be temporarily unavailable
      let lastError: unknown = null
      
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          // Read the ref file - try with 'utf8' encoding string first
          let content = await normalizedFs.read(join(gitdir, refPath), 'utf8')
          // If that returns null, try without encoding
          if (content === null || content === undefined) {
            content = await normalizedFs.read(join(gitdir, refPath))
          }
          if (content !== null && content !== undefined) {
            // Handle both string and Buffer returns
            let contentStr: string
            if (typeof content === 'string') {
              contentStr = content.trim()
            } else if (UniversalBuffer.isBuffer(content)) {
              contentStr = content.toString('utf8').trim()
            } else if (content && typeof content === 'object' && (content as any) instanceof Uint8Array) {
              contentStr = UniversalBuffer.from(content as Uint8Array).toString('utf8').trim()
            } else {
              // Invalid content type, try packed refs
              break
            }
            
            // Validate that we got a valid ref value (not empty, not just whitespace)
            if (!contentStr || contentStr.length === 0) {
              // Empty file might mean write is in progress, retry
              if (retry < maxRetries - 1) {
                // For first path, wait a bit longer to allow file write to complete
                if (isFirstPath) {
                  await new Promise(resolve => setTimeout(resolve, 1))
                } else {
                  // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
                  await new Promise<void>(resolve => {
                    if (typeof queueMicrotask !== 'undefined') {
                      queueMicrotask(() => resolve())
                    } else {
                      Promise.resolve().then(() => resolve())
                    }
                  })
                }
                lastError = new Error('Empty ref file, retrying')
                continue
              }
              break
            }
            
            // Check if the content is a ref pointer (starts with 'ref: ')
            if (contentStr.startsWith('ref: ')) {
              const targetRef = contentStr.slice('ref: '.length).trim()
              // If depth is 1, we want to resolve one level: return the OID of the target ref
              // If depth is undefined or > 1, resolve recursively
              if (depth === 1) {
                // Resolve the target ref to its OID (with depth=0 to get OID, not ref path)
                return readRef({ fs, gitdir, ref: targetRef, depth: 0, objectFormat, cache })
              }
              // Recursively resolve the symbolic ref
              const resolved = await readRef({ fs, gitdir, ref: targetRef, depth: depth - 1, objectFormat, cache })
              // If depth was > 1 and we resolved to an OID, but we want to stop at the ref path
              // when depth=2, we should return the targetRef instead of the OID
              // This handles the case: HEAD (depth=2) -> refs/heads/master (depth=1) -> OID
              // We want to return 'refs/heads/master' not the OID
              if (depth === 2 && resolved && validateOid(resolved, objectFormat)) {
                return targetRef
              }
              return resolved
            }
            // Otherwise return the SHA/content
            // If depth=0 and this is a symbolic ref, return the ref path (don't follow)
            if (depth === 0 && contentStr.startsWith('ref: ')) {
              return contentStr.slice('ref: '.length).trim()
            }
            // If depth=0 and this is a ref path (not an OID), return the ref path (don't follow)
            if (depth === 0 && !validateOid(contentStr, objectFormat) && contentStr.startsWith('refs/')) {
              return contentStr
            }
            // But if depth > 1 and this is a direct ref path (not an OID), return the ref path
            if (depth > 1 && !validateOid(contentStr, objectFormat) && contentStr.startsWith('refs/')) {
              return contentStr
            }
            return contentStr || null
          }
        } catch (err) {
          // File doesn't exist or error reading
          lastError = err
          // If this is not the last retry, wait a bit and try again
          // This handles the case where writeRef is in the middle of writing
          if (retry < maxRetries - 1) {
            // For first path, wait a bit longer to allow file write to complete
            // This is critical because writeRef might have just released the lock
            // but the file write hasn't been fully flushed to disk yet
            if (isFirstPath) {
              await new Promise(resolve => setTimeout(resolve, 1))
            } else {
              // Use queueMicrotask for cross-platform compatibility (works in both Node.js and browsers)
              await new Promise<void>(resolve => {
                if (typeof queueMicrotask !== 'undefined') {
                  queueMicrotask(() => resolve())
                } else {
                  Promise.resolve().then(() => resolve())
                }
              })
            }
            continue
          }
          // Last retry failed, break to try packed refs
          break
        }
      }
      
      // Try packed refs - read packed-refs INSIDE the lock to ensure we see latest state
      // This is critical for the first path (which equals the ref) to synchronize with writeRef
      const packedMap = await readPackedRefs({ fs, gitdir })
      const packedSha = packedMap.get(refPath)
      if (packedSha) {
        // If it's a symbolic ref and depth is 1, resolve to OID
        if (packedSha.startsWith('ref: ')) {
          const targetRef = packedSha.slice('ref: '.length).trim()
          if (depth === 1) {
            // Resolve the target ref to its OID (one level of resolution)
            return readRef({ fs, gitdir, ref: targetRef, depth: 0, objectFormat, cache })
          }
          // Recursively resolve the symbolic ref
          return readRef({ fs, gitdir, ref: targetRef, depth: depth - 1, objectFormat, cache })
        }
        // Recursively resolve - this handles SHA refs
        return readRef({ fs, gitdir, ref: packedSha, depth: depth - 1, objectFormat, cache })
      }
      
      return null
    })
    
    if (sha) {
      return sha
    }
  }
  
  // Ref not found - return null (caller can throw NotFoundError if needed)
  return null
}

/**
 * Resolves a ref to its object ID, throwing NotFoundError if not found
 * This is a convenience wrapper around readRef that throws instead of returning null
 */
export async function resolveRef({
  fs,
  gitdir,
  ref,
  depth = 5,
  objectFormat = 'sha1',
  cache = {},
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  depth?: number
  objectFormat?: ObjectFormat
  cache?: Record<string, unknown>
}): Promise<string> {
  const oid = await readRef({ fs, gitdir, ref, depth, objectFormat, cache })
  if (oid === null) {
    throw new NotFoundError(ref)
  }
  return oid
}

/**
 * Reads a symbolic ref and returns its target without resolving to OID
 * Returns null if the ref is not symbolic or doesn't exist
 */
export async function readSymbolicRef({
  fs,
  gitdir,
  ref,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
}): Promise<string | null> {
  const normalizedFs = createFileSystem(fs)
  
  // Try reading the ref file directly
  try {
    let content = await normalizedFs.read(join(gitdir, ref), 'utf8')
    if (content === null || content === undefined) {
      content = await normalizedFs.read(join(gitdir, ref))
    }
    if (content !== null && content !== undefined) {
      let contentStr: string
      if (typeof content === 'string') {
        contentStr = content.trim()
      } else if (UniversalBuffer.isBuffer(content)) {
        contentStr = content.toString('utf8').trim()
      } else if (content && typeof content === 'object' && (content as any) instanceof Uint8Array) {
        contentStr = UniversalBuffer.from(content as Uint8Array).toString('utf8').trim()
      } else {
        return null
      }
      
      // Check if it's a symbolic ref
      if (contentStr.startsWith('ref: ')) {
        return contentStr.slice('ref: '.length).trim()
      }
    }
  } catch {
    // File doesn't exist
  }
  
  // Try packed refs
  const packedMap = await readPackedRefs({ fs, gitdir })
  const allpaths = refpaths(ref).filter(p => !GIT_FILES.includes(p))
  
  for (const refPath of allpaths) {
    const packedValue = packedMap.get(refPath)
    if (packedValue && packedValue.startsWith('ref: ')) {
      return packedValue.slice('ref: '.length).trim()
    }
  }
  
  return null
}


