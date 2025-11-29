import { InvalidOidError } from '../../errors/InvalidOidError.ts'
import type { GitBackend } from '../../backends/GitBackend.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

/**
 * Updates remote refs based on refspecs
 * 
 * This function handles the translation of remote refs (from fetch/push operations)
 * to local remote-tracking refs (e.g., refs/remotes/origin/main).
 * 
 * @param gitBackend - Git backend instance
 * @param remote - Remote name (e.g., 'origin')
 * @param refs - Map of server ref paths to OIDs
 * @param symrefs - Map of server symbolic ref paths to targets
 * @param tags - Whether to fetch tags
 * @param refspecs - Optional refspec patterns (not fully implemented)
 * @param prune - Whether to prune remote-tracking refs that no longer exist on remote
 * @param pruneTags - Whether to prune tags (not fully implemented)
 * @returns Object with list of pruned refs
 * 
 * @example
 * ```typescript
 * const result = await updateRemoteRefs({
 *   gitBackend: repo.gitBackend,
 *   remote: 'origin',
 *   refs: new Map([['refs/heads/main', 'abc123...']]),
 *   symrefs: new Map(),
 * })
 * ```
 */
export async function updateRemoteRefs({
  gitBackend,
  remote,
  refs,
  symrefs,
  tags = false,
  refspecs,
  prune = false,
  pruneTags = false,
  // Legacy parameters for backward compatibility
  fs: _fs,
  gitdir: _gitdir,
}: {
  gitBackend?: GitBackend
  remote: string
  refs: Map<string, string>
  symrefs: Map<string, string>
  tags?: boolean
  refspecs?: string[]
  prune?: boolean
  pruneTags?: boolean
  // Legacy parameters for backward compatibility
  fs?: FileSystemProvider
  gitdir?: string
}): Promise<{ pruned: string[] }> {
  // Support both new signature (gitBackend) and legacy signature (fs/gitdir)
  let backend: GitBackend
  if (gitBackend) {
    backend = gitBackend
  } else if (_fs && _gitdir) {
    // Legacy: create a temporary backend
    const { GitBackendFs } = await import('../../backends/GitBackendFs/index.ts')
    backend = new GitBackendFs(_fs, _gitdir)
  } else {
    throw new Error('Either gitBackend or (fs and gitdir) must be provided')
  }
  // Validate input
  for (const value of refs.values()) {
    if (!value.match(/[0-9a-f]{40}/)) {
      throw new InvalidOidError(value)
    }
  }

  // For now, use simple refspec translation: refs/heads/* -> refs/remotes/{remote}/*
  // Full implementation would use GitRefSpecSet
  const actualRefsToWrite = new Map<string, string>()

  // Handle tags
  if (tags) {
    for (const [serverRef, oid] of refs.entries()) {
      if (serverRef.startsWith('refs/tags/') && !serverRef.endsWith('^{}')) {
        // Only fetch tags that don't conflict
        const existingRef = await backend.readRef(serverRef, 5, {})
        if (!existingRef) {
          actualRefsToWrite.set(serverRef, oid)
        }
      }
    }
  }

  // Translate refs using simple refspec pattern
  for (const [serverRef, oid] of refs.entries()) {
    if (serverRef.startsWith('refs/heads/')) {
      const localRef = serverRef.replace('refs/heads/', `refs/remotes/${remote}/`)
      actualRefsToWrite.set(localRef, oid)
    } else if (serverRef === 'HEAD') {
      actualRefsToWrite.set(`refs/remotes/${remote}/HEAD`, oid)
    } else if (!serverRef.startsWith('refs/')) {
      // Handle short ref names (e.g., "test" instead of "refs/heads/test")
      // Assume they are branch names and translate to remote-tracking branch
      const localRef = `refs/remotes/${remote}/${serverRef}`
      actualRefsToWrite.set(localRef, oid)
    }
  }

  // Handle symrefs
  for (const [serverRef, target] of symrefs.entries()) {
    if (serverRef.startsWith('refs/heads/')) {
      const localRef = serverRef.replace('refs/heads/', `refs/remotes/${remote}/`)
      // Translate the target ref to remote ref path if it's a refs/heads/ ref
      let targetRef = target
      if (target.startsWith('refs/heads/')) {
        targetRef = target.replace('refs/heads/', `refs/remotes/${remote}/`)
      }
      actualRefsToWrite.set(localRef, `ref: ${targetRef}`)
    }
  }

  // Prune if requested
  const pruned: string[] = []
  if (prune) {
    const remoteRefsPath = `refs/remotes/${remote}`
    const existingRefs = await backend.listRefs(remoteRefsPath)
    for (const ref of existingRefs) {
      const fullRef = `${remoteRefsPath}/${ref}`
      if (!actualRefsToWrite.has(fullRef)) {
        pruned.push(fullRef)
      }
    }
    if (pruned.length > 0) {
      for (const ref of pruned) {
        await backend.deleteRef(ref, {})
      }
    }
  }

  // Write all refs with reflog support
  for (const [key, value] of actualRefsToWrite) {
    // Read old ref OID for reflog before updating
    let oldRefOid: string | undefined
    try {
      const refValue = await backend.readRef(key, 5, {})
      oldRefOid = refValue || undefined
    } catch {
      // Ref doesn't exist yet
      oldRefOid = undefined
    }
    
    if (value.startsWith('ref: ')) {
      await backend.writeSymbolicRef(key, value.slice(5), oldRefOid, {})
    } else {
      await backend.writeRef(key, value, false, {})
      
      // Add descriptive reflog entry for remote ref update (fetch)
      // Note: writeRef already logs reflog, but we want a more descriptive message
      if (oldRefOid !== value && key.startsWith('refs/remotes/')) {
        try {
          const timestamp = Math.floor(Date.now() / 1000)
          const oldOid = oldRefOid || '0000000000000000000000000000000000000000'
          const entry = `${oldOid} ${value} universal-git <noreply@isomorphic-git.org> ${timestamp} +0000\tupdate by fetch\n`
          await backend.appendReflog(key, entry)
        } catch {
          // Silently ignore reflog errors (Git's behavior)
          // Note: writeRef already wrote a reflog entry, so this is just for a better message
        }
      }
    }
  }
  
  // Add reflog entries for pruned refs
  if (pruned.length > 0) {
    for (const ref of pruned) {
      // Read old ref OID for reflog before deleting
      let oldRefOid: string | undefined
      try {
        const refValue = await backend.readRef(ref, 5, {})
        oldRefOid = refValue || undefined
      } catch {
        // Ref doesn't exist, skip
        continue
      }
      
      // Add descriptive reflog entry for remote ref deletion (prune)
      if (oldRefOid) {
        try {
          const timestamp = Math.floor(Date.now() / 1000)
          const entry = `${oldRefOid} 0000000000000000000000000000000000000000 universal-git <noreply@isomorphic-git.org> ${timestamp} +0000\tupdate by fetch (pruned)\n`
          await backend.appendReflog(ref, entry)
        } catch {
          // Silently ignore reflog errors (Git's behavior)
        }
      }
    }
  }

  return { pruned }
}

