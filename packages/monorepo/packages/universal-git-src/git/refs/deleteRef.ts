/**
 * Deletes Git references directly from .git/refs/ and .git/packed-refs
 * This is the single source of truth - deletes directly from disk
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param refs - Array of reference names to delete
 */
import { join } from '../../core-utils/GitPath.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { parsePackedRefs, serializePackedRefs } from './packedRefs.ts'
import AsyncLock from 'async-lock'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

let lock: AsyncLock | undefined

const acquireLock = async <T>(ref: string, callback: () => Promise<T>): Promise<T> => {
  if (lock === undefined) lock = new AsyncLock()
  return lock.acquire(ref, callback)
}

/**
 * Deletes one or more refs from both loose refs and packed-refs
 */
export async function deleteRefs({
  fs,
  gitdir,
  refs,
}: {
  fs: FileSystemProvider
  gitdir: string
  refs: string[]
}): Promise<void> {
  const normalizedFs = createFileSystem(fs)
  
  // Delete regular refs
  await Promise.all(refs.map(ref => normalizedFs.rm(join(gitdir, ref)).catch(() => {
    // Ignore errors if ref doesn't exist
  })))

  // Delete any packed refs
  let text = await acquireLock('packed-refs', async () => {
    try {
      const content = await normalizedFs.read(join(gitdir, 'packed-refs'), 'utf8')
      return typeof content === 'string' ? content : ''
    } catch {
      return ''
    }
  })
  
  const packed = parsePackedRefs(text)
  const beforeSize = packed.size

  for (const ref of refs) {
    packed.delete(ref)
  }

  if (packed.size < beforeSize) {
    const serialized = serializePackedRefs(packed)
    text = serialized.toString('utf8')
    await acquireLock('packed-refs', async () => {
      await normalizedFs.write(join(gitdir, 'packed-refs'), text, 'utf8')
    })
  }
}

/**
 * Deletes a single ref
 */
export async function deleteRef({
  fs,
  gitdir,
  ref,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
}): Promise<void> {
  // Read old OID before deleting (for reflog)
  let oldOid = '0000000000000000000000000000000000000000'
  try {
    const { readRef } = await import('./readRef.ts')
    const oldValue = await readRef({ fs, gitdir, ref })
    if (oldValue) {
      oldOid = oldValue
    }
  } catch {
    // Ref doesn't exist, use zero OID
  }
  
  await deleteRefs({ fs, gitdir, refs: [ref] })
  
  // Log ref deletion to reflog (if enabled)
  if (oldOid !== '0000000000000000000000000000000000000000') {
    const { logRefUpdate } = await import('../logs/logRefUpdate.ts')
    await logRefUpdate({
      fs,
      gitdir,
      ref,
      oldOid,
      newOid: '0000000000000000000000000000000000000000', // Zero OID for deletion
      message: 'delete by deleteRef',
    }).catch(() => {
      // Silently ignore reflog errors (Git's behavior)
    })
  }
}

