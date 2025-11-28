import { listFiles } from '@awesome-os/universal-git-src/index.ts'
import { GitIndex } from '@awesome-os/universal-git-src/git/index/GitIndex.ts'
import { resolveFilepath } from '@awesome-os/universal-git-src/utils/resolveFilepath.ts'
import { normalize as normalizePath } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'
import type { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

/**
 * Reset the entire index to match a specific tree (e.g., HEAD)
 * This is useful for tests that need a clean index state
 * Uses Repository.writeIndexDirect() to ensure cache consistency
 */
export async function resetIndexToTree({
  repo,
  ref = 'HEAD',
}: {
  repo: Repository
  ref?: string
}): Promise<void> {
  const effectiveGitdir = await repo.getGitdir()
  const cache = repo.cache
  
  // Get all file paths from the tree using listFiles (handles nested trees)
  const filePaths = await listFiles({ repo, ref })
  
  // Resolve the commit/tree OID using gitBackend methods
  const { GitCommit } = await import('@awesome-os/universal-git-src/models/GitCommit.ts')
  let treeOid: string
  try {
    const commitOid = await repo.gitBackend.readRef(ref, 5, cache)
    if (!commitOid) {
      // Ref doesn't exist, return early
      return
    }
    const commitResult = await repo.gitBackend.readObject(commitOid, 'content', cache)
    if (commitResult.type === 'commit') {
      const commit = GitCommit.from(commitResult.object).parse()
      treeOid = commit.tree
    } else {
      // If ref points directly to a tree
      treeOid = commitOid
    }
  } catch {
    // If ref doesn't exist or can't be resolved, return early
    // This allows tests to work even if HEAD doesn't exist yet
    return
  }
  
  // CRITICAL: First, read the current index and clear ALL entries
  // This ensures we start with a completely clean index
  const currentIndex = await repo.readIndexDirect(false) // Force fresh read
  const allCurrentPaths = Array.from(currentIndex.entriesMap.keys())
  
  // Create a new empty index (this ensures we start fresh)
  const index = new GitIndex()
  
  // Add all entries from the tree
  // Use gitBackend.readObject to resolve filepaths in the tree
  // We can't access fs directly - backends are black boxes
  for (const filepath of filePaths) {
    try {
      // Resolve the OID for this filepath in the tree
      // Use a helper that works with gitBackend instead of requiring fs
      const { resolveFilepathInTree } = await import('@awesome-os/universal-git-src/utils/resolveFilepath.ts')
      // For now, we'll need to read the tree and traverse it manually
      // Since resolveFilepath requires fs, we need a different approach
      // Let's use gitBackend.readObject to read tree objects
      const pathParts = filepath.split('/')
      let currentTreeOid = treeOid
      let blobOid: string | undefined
      
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        const isLast = i === pathParts.length - 1
        
        const treeResult = await repo.gitBackend.readObject(currentTreeOid, 'content', cache)
        if (treeResult.type !== 'tree') {
          throw new Error(`Expected tree object, got ${treeResult.type}`)
        }
        const { parseTree } = await import('@awesome-os/universal-git-src/git/objects/parseTree.ts')
        const tree = parseTree(treeResult.object)
        const entry = tree.find(e => e.path === part)
        
        if (!entry) {
          throw new Error(`Path part ${part} not found in tree`)
        }
        
        if (isLast) {
          blobOid = entry.oid
        } else {
          currentTreeOid = entry.oid
        }
      }
      
      if (!blobOid) {
        throw new Error(`Could not resolve filepath ${filepath}`)
      }
      
      // Get stats from working directory if file exists
      let stats
      try {
        stats = await repo.worktreeBackend!.lstat(filepath)
      } catch {
        // File doesn't exist in workdir, use default stats
        stats = {
          ctime: new Date(0),
          mtime: new Date(0),
          dev: 0,
          ino: 0,
          mode: 0o100644,
          uid: 0,
          gid: 0,
          size: 0,
        }
      }
      
      // Insert into index
      index.insert({
        filepath,
        stats,
        oid: blobOid,
      })
    } catch (error) {
      // If we can't resolve the filepath, skip it
      // This can happen if the file was deleted or doesn't exist in the tree
      console.warn(`Could not resolve filepath ${filepath} in tree ${treeOid}:`, error)
    }
  }
  
  // Write the index using Repository.writeIndexDirect() to ensure cache consistency
  // If the index is empty (no entries), we still write it (empty index is valid)
  // But we ensure the write completes successfully
  try {
    await repo.writeIndexDirect(index)
    
    // CRITICAL: Invalidate the cache to force fresh reads
    // This ensures that subsequent reads will get the new index state
    const normalizedGitdir = normalizePath(effectiveGitdir)
    const cacheKey = `index:${normalizedGitdir}`
    if (cache) {
      // Delete the cache entry to force fresh read on next access
      delete cache[cacheKey]
      
      // Cache is now managed by Repository instance, no need to manually invalidate
    }
  } catch (error) {
    // If write fails, log it but don't throw - this allows tests to continue
    // The index might be in an inconsistent state, but that's better than crashing
    console.warn(`Failed to write index in resetIndexToTree:`, error)
    // Re-throw to let caller handle it
    throw error
  }
}

