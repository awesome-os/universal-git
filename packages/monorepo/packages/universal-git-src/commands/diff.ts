import { RefManager } from "../core-utils/refs/RefManager.ts"
import { Repository } from "../core-utils/Repository.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { readObject } from "../git/objects/readObject.ts"
import { parse as parseBlob } from "../core-utils/parsers/Blob.ts"
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { parse as parseTree } from "../core-utils/parsers/Tree.ts"
import { GitIndex } from "../git/index/GitIndex.ts"
import { resolveTree } from "../utils/resolveTree.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { createFileSystem } from "../utils/createFileSystem.ts"
import { join } from "../utils/join.ts"
import { hashObject } from "../utils/hashObject.ts"
import { normalizeStats } from "../utils/normalizeStats.ts"
import { normalizeMode } from "../utils/normalizeMode.ts"
import type { FileSystem } from "../models/FileSystem.ts"
import type { TreeEntry } from "../models/GitTree.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

// ============================================================================
// DIFF TYPES
// ============================================================================

/**
 * Diff entry representing a single file change
 */
export type DiffEntry = {
  filepath: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  oldOid?: string
  newOid?: string
  oldMode?: string
  newMode?: string
}

/**
 * Diff operation result
 */
export type DiffResult = {
  entries: DiffEntry[]
  refA?: string
  refB?: string
}

/**
 * Shows changes between commits, commit and working tree, etc.
 * Similar to `git diff`
 */
export async function diff({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  refA,
  refB,
  filepath,
  staged = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystem
  dir?: string
  gitdir?: string
  refA?: string
  refB?: string
  filepath?: string
  staged?: boolean
  cache?: Record<string, unknown>
  }): Promise<DiffResult> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      refA,
      refB,
      filepath,
      staged,
    })

    const resolvedGitdir = effectiveGitdir
    let treeA: TreeEntry[] | null = null
    let treeB: TreeEntry[] | null = null
    let oidA: string | undefined
    let oidB: string | undefined

    // Early return if comparing same refs (unless filepath filter is provided)
    if (refA && refB && refA === refB && !filepath && !staged) {
      try {
        const resolvedA = await RefManager.resolve({ fs, gitdir: resolvedGitdir, ref: refA })
        const resolvedB = await RefManager.resolve({ fs, gitdir: resolvedGitdir, ref: refB })
        if (resolvedA === resolvedB) {
          // Same refs resolve to same commit = no diff
          return { entries: [] }
        }
      } catch {
        // If ref doesn't exist, continue with normal flow
      }
    }

    // Resolve refA (default to HEAD)
    if (refA) {
      oidA = await RefManager.resolve({ fs, gitdir: resolvedGitdir, ref: refA })
      const commitResult = await readObject({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: oidA, format: 'content' })
      if (commitResult.type === 'commit') {
        const commit = parseCommit(commitResult.object)
        if (commit.tree) {
          const treeResult = await resolveTree({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: commit.tree })
          // resolveTree returns TreeObject (TreeEntry[]), use directly
          treeA = treeResult.tree
        }
      }
    } else if (staged) {
      // Compare index with HEAD
      try {
        oidA = await RefManager.resolve({ fs, gitdir: resolvedGitdir, ref: 'HEAD' })
        const commitResult = await readObject({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: oidA, format: 'content' })
        if (commitResult.type === 'commit') {
          const commit = parseCommit(commitResult.object)
          if (commit.tree) {
            const treeResult = await resolveTree({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: commit.tree })
            // resolveTree returns TreeObject (TreeEntry[]), use directly
            treeA = treeResult.tree
          }
        }
      } catch (err: any) {
        // HEAD doesn't exist - treat as empty tree
        if (err?.code === 'NotFoundError' && err?.data?.what === 'HEAD') {
          treeA = []
          // Still set oidA to 'HEAD' string for staged comparison
          oidA = 'HEAD'
        } else {
          throw err
        }
      }
      // Read index for treeB
      try {
        const indexBuffer = await fs.read(join(resolvedGitdir, 'index'))
        const index = await GitIndex.fromBuffer(UniversalBuffer.from(indexBuffer as string | Uint8Array))
        treeB = index.entries
          .filter(entry => entry.flags.stage === 0) // Only stage 0 entries
          .map(entry => ({
            path: entry.path,
            oid: entry.oid,
            mode: entry.mode.toString(8).padStart(6, '0'),
            type: (entry.mode & 0o170000) === 0o040000 ? 'tree' : 'blob',
          }))
      } catch {
        // Index doesn't exist
        treeB = []
      }
    } else {
      // Compare working directory with HEAD
      try {
        oidA = await RefManager.resolve({ fs, gitdir: resolvedGitdir, ref: 'HEAD' })
        const commitResult = await readObject({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: oidA, format: 'content' })
        if (commitResult.type === 'commit') {
          const commit = parseCommit(commitResult.object)
          if (commit.tree) {
            const treeResult = await resolveTree({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: commit.tree })
            // resolveTree returns TreeObject (TreeEntry[]), use directly
            treeA = treeResult.tree
          }
        }
      } catch (err: any) {
        // HEAD doesn't exist - treat as empty tree
        if (err?.code === 'NotFoundError' && err?.data?.what === 'HEAD') {
          treeA = []
          // Still set oidA to undefined to indicate HEAD doesn't exist
          oidA = undefined
        } else {
          throw err
        }
      }
      // Read working directory for treeB
      if (dir) {
        treeB = await readWorkingDirectory({ fs, dir, gitdir: resolvedGitdir, cache: effectiveCache })
      }
    }

    // Resolve refB if provided
    if (refB) {
      oidB = await RefManager.resolve({ fs, gitdir: resolvedGitdir, ref: refB })
      const commitResult = await readObject({ fs, cache, gitdir: resolvedGitdir, oid: oidB, format: 'content' })
      if (commitResult.type === 'commit') {
        const commit = parseCommit(commitResult.object)
        if (commit.tree) {
          const treeResult = await resolveTree({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: commit.tree })
          // resolveTree returns TreeObject (TreeEntry[]), use directly
          treeB = treeResult.tree
        }
      }
    }

    // If no trees, return empty diff
    if (!treeA && !treeB) {
      return { entries: [], refA: oidA, refB: oidB }
    }

    // Helper function to recursively expand tree entries with full paths
    async function expandTreeEntries(
      treeOid: string,
      prefix: string = '',
      fs: FileSystem,
      cache: Record<string, unknown>,
      gitdir: string
    ): Promise<TreeEntry[]> {
      const entries: TreeEntry[] = []
      try {
        const { object: treeObject } = await readObject({ fs, cache, gitdir, oid: treeOid, format: 'content' })
        const treeEntries = parseTree(treeObject as Buffer)
        
        for (const entry of treeEntries) {
          const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path
          
          if (entry.type === 'tree') {
            // Recursively expand subdirectory
            const subEntries = await expandTreeEntries(entry.oid, fullPath, fs, cache, gitdir)
            entries.push(...subEntries)
          } else {
            // Add file entry with full path
            entries.push({
              ...entry,
              path: fullPath,
            })
          }
        }
      } catch (err) {
        // Tree doesn't exist or can't be read - return empty
      }
      return entries
    }

    // Build maps for efficient lookup - recursively expand trees if needed
    const mapA = new Map<string, TreeEntry>()
    const mapB = new Map<string, TreeEntry>()

    if (treeA) {
      // Check if we need to expand (if any entry is a tree type)
      const needsExpansion = treeA.some(e => e.type === 'tree')
      if (needsExpansion && oidA) {
        // Get the tree OID from the commit
        try {
          const commitResult = await readObject({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: oidA, format: 'content' })
          if (commitResult.type === 'commit') {
            const commit = parseCommit(commitResult.object)
            if (commit.tree) {
              const expanded = await expandTreeEntries(commit.tree, '', fs, effectiveCache, resolvedGitdir)
              for (const entry of expanded) {
                mapA.set(entry.path, entry)
              }
            }
          }
        } catch {
          // Can't expand - use entries as-is
          for (const entry of treeA) {
            mapA.set(entry.path, entry)
          }
        }
      } else {
        // No nested trees, use entries as-is
        for (const entry of treeA) {
          mapA.set(entry.path, entry)
        }
      }
    }

    if (treeB) {
      // Check if we need to expand (if any entry is a tree type)
      const needsExpansion = treeB.some(e => e.type === 'tree')
      if (needsExpansion && oidB) {
        // Get the tree OID from the commit
        try {
          const commitResult = await readObject({ fs, cache: effectiveCache, gitdir: resolvedGitdir, oid: oidB, format: 'content' })
          if (commitResult.type === 'commit') {
            const commit = parseCommit(commitResult.object)
            if (commit.tree) {
              const expanded = await expandTreeEntries(commit.tree, '', fs, effectiveCache, resolvedGitdir)
              for (const entry of expanded) {
                mapB.set(entry.path, entry)
              }
            }
          }
        } catch {
          // Can't expand - use entries as-is
          for (const entry of treeB) {
            mapB.set(entry.path, entry)
          }
        }
      } else {
        // No nested trees, use entries as-is
        for (const entry of treeB) {
          mapB.set(entry.path, entry)
        }
      }
    }

    // Collect all filepaths
    const allPaths = new Set<string>()
    for (const path of mapA.keys()) {
      allPaths.add(path)
    }
    for (const path of mapB.keys()) {
      allPaths.add(path)
    }

    // Filter by filepath if provided
    if (filepath) {
      const filtered = Array.from(allPaths).filter(path => path.startsWith(filepath))
      allPaths.clear()
      for (const path of filtered) {
        allPaths.add(path)
      }
    }

    // Generate diff entries
    const entries: DiffEntry[] = []
    for (const path of allPaths) {
      const entryA = mapA.get(path)
      const entryB = mapB.get(path)

      if (!entryA && entryB) {
        // Added
        entries.push({
          filepath: path,
          status: 'added',
          newOid: entryB.oid,
          newMode: entryB.mode,
        })
      } else if (entryA && !entryB) {
        // Deleted
        entries.push({
          filepath: path,
          status: 'deleted',
          oldOid: entryA.oid,
          oldMode: entryA.mode,
        })
      } else if (entryA && entryB) {
        if (entryA.oid !== entryB.oid || entryA.mode !== entryB.mode) {
          // Modified
          entries.push({
            filepath: path,
            status: 'modified',
            oldOid: entryA.oid,
            newOid: entryB.oid,
            oldMode: entryA.mode,
            newMode: entryB.mode,
          })
        }
      }
    }

    return {
      entries,
      refA: oidA || (staged ? 'HEAD' : undefined),
      refB: oidB,
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.diff'
    throw err
  }
}

/**
 * Reads the working directory and converts it to TreeEntry format
 */
async function readWorkingDirectory({
  fs,
  dir,
  gitdir,
  cache,
}: {
  fs: FileSystem
  dir: string
  gitdir: string
  cache: Record<string, unknown>
}): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = []
  const normalizedFs = createFileSystem(fs) as any
  
  async function walkDir(currentPath: string): Promise<void> {
    try {
      const fullPath = join(dir, currentPath)
      const stats = await normalizedFs.lstat(fullPath)
      if (!stats) return
      const normalizedStats = normalizeStats(stats)
      const mode = normalizedStats.mode
      
      if ((mode & 0o170000) === 0o100000 || (mode & 0o170000) === 0o120000) {
        // Regular file or symlink
        const content = await normalizedFs.read(fullPath)
        if (!content) return
        const contentBuffer = UniversalBuffer.from(content as string | Uint8Array)
        const oid = await hashObject({ gitdir, type: 'blob', object: contentBuffer })
        const normalizedMode = normalizeMode(normalizedStats.mode)
        entries.push({
          path: currentPath.replace(/\\/g, '/'), // Normalize path separators
          oid,
          mode: normalizedMode.toString(8).padStart(6, '0'),
          type: 'blob',
        })
      } else if ((mode & 0o170000) === 0o040000) {
        // Directory
        const children = await normalizedFs.readdir(fullPath)
        for (const child of children) {
          // Skip .git directory
          if (child === '.git') continue
          const childPath = currentPath ? join(currentPath, child) : child
          await walkDir(childPath)
        }
      }
    } catch {
      // Ignore files that can't be read
    }
  }
  
  await walkDir('')
  return entries
}

