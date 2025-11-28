/**
 * Writes a Git reference directly to .git/refs/
 * This is the single source of truth - writes directly to disk
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param ref - Reference name (e.g., 'refs/heads/main')
 * @param value - OID to write (for direct refs) or target ref (for symbolic refs)
 * @param symbolic - Whether this is a symbolic ref (default: false)
 */
import { join, normalize } from '../../core-utils/GitPath.ts'
import { dirname } from '../../utils/dirname.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { validateOid, getOidLength, type ObjectFormat } from '../../utils/detectObjectFormat.ts'
import AsyncLock from 'async-lock'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

// Git's zero OID (null commit) - used for new refs and deletions
// SHA-1: 40 zeros, SHA-256: 64 zeros
const getZeroOid = (objectFormat: ObjectFormat = 'sha1'): string => {
  return '0'.repeat(getOidLength(objectFormat))
}

let lock: AsyncLock | undefined

const acquireLock = async <T>(ref: string, callback: () => Promise<T>): Promise<T> => {
  if (lock === undefined) lock = new AsyncLock()
  return lock.acquire(ref, callback)
}

/**
 * Writes a direct ref (OID) to a ref file
 */
export async function writeRef({
  fs,
  gitdir,
  ref,
  value,
  objectFormat = 'sha1',
  skipReflog = false,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  value: string
  objectFormat?: ObjectFormat
  skipReflog?: boolean
}): Promise<void> {
  const normalizedFs = createFileSystem(fs)
  const path = join(gitdir, ref)
  const zeroOid = getZeroOid(objectFormat)
  
  await acquireLock(ref, async () => {
    // POISON PILL: Detect creation of 'main' branch during singleBranch clone
    if (ref === 'refs/heads/main' && process.env.DEBUG_CLONE_REFS === 'true') {
      const stack = new Error().stack
      console.error(`\n[POISON PILL] writeRef called for refs/heads/main!`)
      console.error(`[POISON PILL] Value: ${value.substring(0, 8)}`)
      console.error(`[POISON PILL] Stack trace:`)
      if (stack) {
        const lines = stack.split('\n').slice(1, 10) // Get first 9 stack frames
        lines.forEach(line => console.error(`[POISON PILL] ${line}`))
      }
      // Don't throw - we want to see where it's called from, not crash
    }
    
    // Read old OID before writing (for reflog)
    let oldOid = zeroOid // Default for new refs
    try {
      const { readRef } = await import('./readRef.ts')
      const oldValue = await readRef({ fs, gitdir, ref, objectFormat })
      if (oldValue && typeof oldValue === 'string' && validateOid(oldValue, objectFormat)) {
        oldOid = oldValue
      }
    } catch {
      // Ref doesn't exist yet, use zero OID
    }
    
    // Ensure parent directory exists
    // FileSystem.mkdir already implements recursive directory creation
    const parentDir = dirname(path)
    await normalizedFs.mkdir(parentDir)
    
    // CRITICAL: Trim and validate OID to prevent concatenated OIDs
    const trimmedValue = value.trim()
    
    // Strict validation: must match expected OID format
    if (!validateOid(trimmedValue, objectFormat)) {
      const { InvalidOidError } = await import('../../errors/InvalidOidError.ts')
      const expectedLength = getOidLength(objectFormat)
      throw new InvalidOidError(
        `Invalid value for ref "${ref}": Not a ${expectedLength}-char OID. Got "${trimmedValue}" (length: ${trimmedValue.length})`
      )
    }
    
    // Write the ref file with ONLY the OID followed by a newline
    // This ensures we never write concatenated OIDs
    await normalizedFs.write(path, `${trimmedValue}\n`, 'utf8')
    
    // Record the mutation in StateMutationStream
    const { getStateMutationStream } = await import('../../core-utils/StateMutationStream.ts')
    const mutationStream = getStateMutationStream()
    const normalizedGitdir = normalize(gitdir)
    mutationStream.record({
      type: 'ref-write',
      gitdir: normalizedGitdir,
      data: { ref, value: trimmedValue },
    })
    
    // Log ref update to reflog (if enabled and not skipped)
    if (!skipReflog && oldOid !== trimmedValue) {
      // DEBUG: Log when branches are created
      if (process.env.DEBUG_CLONE_REFS === 'true' && ref.startsWith('refs/heads/')) {
        console.log(`[DEBUG writeRef] Creating/updating branch ${ref}: ${oldOid.substring(0, 8)} -> ${trimmedValue.substring(0, 8)}`)
        // Get stack trace to see where this is called from
        const stack = new Error().stack
        if (stack) {
          const lines = stack.split('\n').slice(1, 4) // Get first 3 stack frames
          console.log(`[DEBUG writeRef] Stack trace:`, lines.join('\n'))
        }
      }
      
      const { logRefUpdate } = await import('../logs/logRefUpdate.ts')
      await logRefUpdate({
        fs,
        gitdir,
        ref,
        oldOid,
        newOid: trimmedValue,
        message: 'update by writeRef',
      }).catch(() => {
        // Silently ignore reflog errors (Git's behavior)
      })
    }
  })
}

/**
 * Writes a symbolic ref (e.g., HEAD -> refs/heads/main)
 */
export async function writeSymbolicRef({
  fs,
  gitdir,
  ref,
  value,
  oldOid: providedOldOid,
  objectFormat = 'sha1',
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  value: string
  oldOid?: string
  objectFormat?: ObjectFormat
}): Promise<void> {
  const normalizedFs = createFileSystem(fs)
  const path = join(gitdir, ref)
  const zeroOid = getZeroOid(objectFormat)
  
  // Read old HEAD OID BEFORE acquiring lock (for HEAD reflog)
  // Use provided oldOid if available (from checkout command), otherwise try to read it
  let oldOid: string | undefined = undefined
  let newOid = zeroOid
  
  if (ref === 'HEAD') {
    // If oldOid was provided and is valid, use it
    // CRITICAL: providedOldOid should be set by checkout command BEFORE any HEAD modifications
    // IMPORTANT: The checkout command reads oldOid before any HEAD modifications, so we should use it
    // Check if providedOldOid is a valid OID string first
    // IMPORTANT: We check for truthy value AND valid format
    // If providedOldOid is provided but is not a valid OID, we still don't try to read HEAD
    // because the checkout command already read it, and it might have been modified by now
    if (providedOldOid && typeof providedOldOid === 'string' && validateOid(providedOldOid, objectFormat)) {
      // providedOldOid is a valid OID, use it
      oldOid = providedOldOid
    } else if (providedOldOid === undefined) {
      // providedOldOid was not provided at all, try to read it
      // Read old HEAD OID before writing (for HEAD reflog)
      // Use resolveRef which automatically handles symbolic refs
      // We read BEFORE acquiring the lock to avoid any lock-related issues
      // NOTE: This might fail if HEAD was already modified, so prefer providedOldOid
      try {
        const { resolveRef } = await import('./readRef.ts')
        // resolveRef automatically follows symbolic refs and returns the OID
        const oldHeadOid = await resolveRef({ fs, gitdir, ref: 'HEAD', objectFormat })
        if (oldHeadOid && validateOid(oldHeadOid, objectFormat)) {
          oldOid = oldHeadOid
        } else {
          // Resolved value is not a valid OID, leave as undefined
          oldOid = undefined
        }
      } catch (err) {
        // HEAD doesn't exist yet or can't be resolved - leave as undefined
        // This will be handled by logRefUpdate which will default to zero OID
        oldOid = undefined
      }
    }
    // If providedOldOid was provided but is not a valid OID, oldOid remains undefined
    // (will default to zero OID in logRefUpdate)
    
    // Resolve new HEAD OID (the target branch)
    // Strip 'ref: ' prefix if present (it's only used in HEAD file format, not in ref resolution)
    const targetRef = value.startsWith('ref: ') ? value.substring(5).trim() : value.trim()
    try {
      const { resolveRef } = await import('./readRef.ts')
      const newHeadOid = await resolveRef({ fs, gitdir, ref: targetRef, objectFormat })
      if (newHeadOid && validateOid(newHeadOid, objectFormat)) {
        newOid = newHeadOid
      }
    } catch {
      // Target ref doesn't exist yet - will be resolved later
      // This shouldn't happen in normal operation, but we handle it gracefully
    }
  }
  
  await acquireLock(ref, async () => {
    
    // Ensure parent directory exists
    // FileSystem.mkdir already implements recursive directory creation
    const parentDir = dirname(path)
    await normalizedFs.mkdir(parentDir)
    
    // Write the symbolic ref with 'ref: ' prefix
    // Strip 'ref: ' prefix if already present to avoid double prefix
    let trimmedValue = value.trim()
    if (trimmedValue.startsWith('ref: ')) {
      trimmedValue = trimmedValue.substring(5).trim()
    }
    await normalizedFs.write(path, `ref: ${trimmedValue}\n`, 'utf8')
    
    // Record the mutation in StateMutationStream
    const { getStateMutationStream } = await import('../../core-utils/StateMutationStream.ts')
    const mutationStream = getStateMutationStream()
    const normalizedGitdir = normalize(gitdir)
    mutationStream.record({
      type: 'ref-write',
      gitdir: normalizedGitdir,
      data: { ref, value: trimmedValue, symbolic: true },
    })
    
    // Log HEAD update to reflog (if enabled and HEAD changed)
    if (ref === 'HEAD') {
      // Use oldOid if available, otherwise use zero OID (for new refs)
      const finalOldOid = oldOid || zeroOid
      // Only log if oldOid and newOid are different (actual change occurred)
      if (finalOldOid !== newOid) {
        const { logRefUpdate } = await import('../logs/logRefUpdate.ts')
        await logRefUpdate({
          fs,
          gitdir,
          ref: 'HEAD',
          oldOid: finalOldOid,
          newOid,
          message: `checkout: moving from ${finalOldOid.slice(0, 7)} to ${trimmedValue}`,
        }).catch(() => {
          // Silently ignore reflog errors (Git's behavior)
        })
      }
    }
  })
}

