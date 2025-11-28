import { NotFoundError } from '../../errors/NotFoundError.ts'
import { readPackedRefs } from './packedRefs.ts'
import { join } from '../../core-utils/GitPath.ts'
import AsyncLock from 'async-lock'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import type { GitBackend } from '../../backends/GitBackend.ts'

let lock: AsyncLock | undefined

const acquireLock = async <T>(ref: string, callback: () => Promise<T>): Promise<T> => {
  if (lock === undefined) lock = new AsyncLock()
  return lock.acquire(ref, callback)
}

// @see https://git-scm.com/docs/git-rev-parse.html#_specifying_revisions
const refpaths = (ref: string): string[] => [
  `${ref}`,
  `refs/${ref}`,
  `refs/tags/${ref}`,
  `refs/heads/${ref}`,
  `refs/remotes/${ref}`,
  `refs/remotes/${ref}/HEAD`,
]

/**
 * Expands a ref to its full name
 * 
 * Supports both GitBackend (preferred) and legacy fs/gitdir parameters.
 * 
 * @param gitBackend - GitBackend instance (preferred)
 * @param fs - File system client (legacy, used if gitBackend not provided)
 * @param gitdir - Path to .git directory (legacy, used if gitBackend not provided)
 * @param ref - Reference name to expand (e.g., 'main', 'HEAD', 'refs/heads/main')
 * @param cache - Optional cache for packfile indices
 * @returns Full reference path (e.g., 'refs/heads/main')
 * 
 * @throws NotFoundError if the ref cannot be found
 * 
 * @example
 * ```typescript
 * // Using GitBackend (preferred)
 * const fullRef = await expandRef({ gitBackend, ref: 'main' })
 * 
 * // Using legacy fs/gitdir
 * const fullRef = await expandRef({ fs, gitdir, ref: 'main' })
 * ```
 */
export async function expandRef({
  gitBackend,
  fs,
  gitdir,
  ref,
  cache = {},
}: {
  gitBackend?: GitBackend
  fs?: FileSystemProvider
  gitdir?: string
  ref: string
  cache?: Record<string, unknown>
}): Promise<string> {
  // Is it a complete and valid SHA?
  if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
    return ref
  }

  // Use GitBackend if provided (preferred)
  if (gitBackend) {
    // Look in all the proper paths, in this order
    const allpaths = refpaths(ref)
    
    for (const refPath of allpaths) {
      // Use GitBackend.readRef to check if ref exists
      const oid = await gitBackend.readRef(refPath, 5, cache)
      if (oid !== null) {
        return refPath
      }
    }
    
    // Do we give up?
    throw new NotFoundError(ref)
  }

  // Legacy: use fs/gitdir
  if (!fs || !gitdir) {
    throw new Error('Either gitBackend or both fs and gitdir must be provided')
  }

  // We need to alternate between the file system and the packed-refs
  const packedMap = await readPackedRefs({ fs, gitdir })
  // Look in all the proper paths, in this order
  const allpaths = refpaths(ref)

  for (const refPath of allpaths) {
    const refExists = await acquireLock(refPath, async () => fs.exists(join(gitdir, refPath)))
    if (refExists) return refPath
    if (packedMap.has(refPath)) return refPath
  }

  // Do we give up?
  throw new NotFoundError(ref)
}

/**
 * Checks if a ref exists
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param ref - Reference name to check
 * @returns `true` if the ref exists, `false` otherwise
 * 
 * @example
 * ```typescript
 * const exists = await existsRef({ fs, gitdir, ref: 'refs/heads/main' })
 * ```
 */
export async function existsRef({
  fs,
  gitdir,
  ref,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
}): Promise<boolean> {
  try {
    await expandRef({ fs, gitdir, ref })
    return true
  } catch {
    return false
  }
}

/**
 * Expands a ref against a provided map (for remote refs)
 * 
 * @param ref - Reference name to expand
 * @param map - Map of ref paths to OIDs
 * @returns Full reference path
 * 
 * @throws NotFoundError if the ref cannot be found in the map
 */
export function expandRefAgainstMap({ ref, map }: { ref: string; map: Map<string, string> }): string {
  const allpaths = refpaths(ref)
  for (const refPath of allpaths) {
    if (map.has(refPath)) return refPath
  }
  throw new NotFoundError(ref)
}

/**
 * Resolves a ref against a provided map (for remote refs)
 * 
 * @param ref - Reference name or OID
 * @param fullref - Full reference path (used for recursion)
 * @param depth - Maximum depth for symbolic ref resolution
 * @param map - Map of ref paths to OIDs or symbolic ref targets
 * @returns Object with fullref and oid
 * 
 * @throws NotFoundError if the ref cannot be resolved
 */
export function resolveRefAgainstMap({
  ref,
  fullref = ref,
  depth,
  map,
}: {
  ref: string
  fullref?: string
  depth?: number
  map: Map<string, string>
}): { fullref: string; oid: string } {
  if (depth !== undefined) {
    depth--
    if (depth === -1) {
      return { fullref, oid: ref }
    }
  }

  // Is it a ref pointer?
  if (ref.startsWith('ref: ')) {
    ref = ref.slice('ref: '.length)
    return resolveRefAgainstMap({ ref, fullref, depth, map })
  }

  // Is it a complete and valid SHA?
  if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
    return { fullref, oid: ref }
  }

  // Look in all the proper paths, in this order
  const allpaths = refpaths(ref)
  for (const refPath of allpaths) {
    const sha = map.get(refPath)
    if (sha) {
      return resolveRefAgainstMap({
        ref: sha.trim(),
        fullref: refPath,
        depth,
        map,
      })
    }
  }

  // Do we give up?
  throw new NotFoundError(ref)
}

