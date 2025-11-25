import { parse as parseTree } from '../../core-utils/parsers/Tree.ts'
import { readObject } from '../objects/readObject.ts'
import { writeBlob } from '../../commands/writeBlob.ts'
import { writeTree } from '../../commands/writeTree.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import { mergeBlobs } from './mergeBlobs.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { TreeEntry } from "../../models/GitTree.ts"

type MergeTreesResult = {
  mergedTree: TreeEntry[]
  mergedTreeOid: string
  conflicts: string[]
}

/**
 * Performs a recursive three-way merge on trees
 * 
 * This is a pure algorithm capability module - no file system operations beyond reading/writing Git objects.
 * Use this when you have tree OIDs and need a merged tree.
 * 
 * **When to use this function:**
 * - You have tree OIDs and need a merged tree
 * - You need a pure algorithm capability module (no index management or worktree operations)
 * - You're implementing merge logic in commands like `cherryPick`, `rebase`
 * - You want to merge trees without updating the index or writing conflicted files to the worktree
 * 
 * **When NOT to use this function:**
 * - You need index management or worktree operations (use `mergeTree()` from `GitWorktreeBackend` instead)
 * - You have raw blob content to merge (use `mergeBlobs()` instead)
 * - You need to write conflicted files to the worktree (use `mergeTree()` from `GitWorktreeBackend` instead)
 * 
 * **Example:**
 * ```typescript
 * import { mergeTrees } from 'universal-git/git/merge'
 * 
 * const result = await mergeTrees({
 *   fs,
 *   cache: {},
 *   gitdir,
 *   base: 'baseTreeOid',
 *   ours: 'ourTreeOid',
 *   theirs: 'theirTreeOid'
 * })
 * 
 * if (result.conflicts.length > 0) {
 *   console.log('Conflicts:', result.conflicts)
 * } else {
 *   console.log('Merged tree OID:', result.mergedTreeOid)
 * }
 * ```
 * 
 * @param fs - File system provider
 * @param cache - Object cache
 * @param gitdir - Git directory path
 * @param base - Base tree OID (null for initial merge)
 * @param ours - Our tree OID
 * @param theirs - Their tree OID
 * @returns Merge result with merged tree, tree OID, and conflict list
 */
export const mergeTrees = async ({
  fs,
  cache,
  gitdir,
  base,
  ours,
  theirs,
}: {
  fs: FileSystemProvider
  cache: Record<string, unknown>
  gitdir: string
  base: string | null
  ours: string
  theirs: string
}): Promise<MergeTreesResult> => {
  const conflicts: string[] = []
  const mergedEntries: TreeEntry[] = []

  // Read all three trees
  const baseTree = base ? await readTree(fs, cache, gitdir, base) : []
  const ourTree = await readTree(fs, cache, gitdir, ours)
  const theirTree = await readTree(fs, cache, gitdir, theirs)

  // Create maps for easy lookup
  const baseMap = new Map(baseTree.map(e => [e.path, e]))
  const ourMap = new Map(ourTree.map(e => [e.path, e]))
  const theirMap = new Map(theirTree.map(e => [e.path, e]))

  // Get all unique paths
  const allPaths = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()])

  for (const path of allPaths) {
    const baseEntry = baseMap.get(path)
    const ourEntry = ourMap.get(path)
    const theirEntry = theirMap.get(path)

    const baseOid = baseEntry?.oid
    const ourOid = ourEntry?.oid
    const theirOid = theirEntry?.oid

    // Check for type mismatches FIRST - before any other logic
    // This handles cases where one side changed the type (blob <-> tree)
    // If both ourEntry and theirEntry exist and have different types, it's a conflict
    // We check this early to catch type mismatches regardless of OID comparisons
    if (ourEntry && theirEntry) {
      const ourType = ourEntry.type || 'blob'
      const theirType = theirEntry.type || 'blob'
      
      // Type mismatch: both exist but have different types
      // This is always a conflict, regardless of OID changes
      if (ourType !== theirType) {
        conflicts.push(path)
        // Take ours
        mergedEntries.push(ourEntry)
        continue
      }
    }

    // Handle deletions (after type mismatch check)
    if (!ourEntry && !theirEntry && baseEntry) {
      // Deleted by both - skip (no conflict)
      continue
    }

    if (!ourEntry && theirEntry && baseEntry) {
      // Deleted by us, modified by them - conflict
      conflicts.push(path)
      mergedEntries.push(theirEntry)
      continue
    }

    if (ourEntry && !theirEntry && baseEntry) {
      // Modified by us, deleted by them - conflict
      conflicts.push(path)
      mergedEntries.push(ourEntry)
      continue
    }

    // Both unchanged
    if (ourOid === baseOid && theirOid === baseOid) {
      if (ourEntry) mergedEntries.push(ourEntry)
      continue
    }

    // Only theirs changed
    if (ourOid === baseOid && theirOid !== baseOid) {
      // Check for type mismatch (e.g., base/ours is blob, theirs is tree)
      // This is a conflict: we kept it unchanged, they changed the type
      if (baseEntry && ourEntry && theirEntry && ourEntry.type !== theirEntry.type) {
        conflicts.push(path)
        // Take ours (the unchanged side)
        mergedEntries.push(ourEntry)
        continue
      }
      // Also check if we have it but they deleted it (modify/delete conflict)
      if (baseEntry && ourEntry && !theirEntry) {
        conflicts.push(path)
        // Take ours (we kept it, they deleted it)
        mergedEntries.push(ourEntry)
        continue
      }
      if (theirEntry) {
        mergedEntries.push(theirEntry)
      }
      continue
    }

    // Only ours changed
    if (ourOid !== baseOid && theirOid === baseOid) {
      // Check for type mismatch (e.g., base/theirs is blob, ours is tree)
      // This is a conflict: they kept it unchanged, we changed the type
      if (baseEntry && ourEntry && theirEntry && ourEntry.type !== theirEntry.type) {
        conflicts.push(path)
        // Take ours (the changed side)
        mergedEntries.push(ourEntry)
        continue
      }
      // Also check if they have it but we deleted it (delete/modify conflict)
      if (baseEntry && !ourEntry && theirEntry) {
        conflicts.push(path)
        // Take theirs (they kept it, we deleted it)
        mergedEntries.push(theirEntry)
        continue
      }
      if (ourEntry) {
        mergedEntries.push(ourEntry)
      }
      continue
    }

    // Both changed - need to merge
    if (ourOid !== baseOid && theirOid !== baseOid) {
      if (ourEntry?.type === 'tree' && theirEntry?.type === 'tree') {
        // Recursively merge subtrees
        const subtreeResult = await mergeTrees({
          fs,
          cache,
          gitdir,
          base: baseOid ?? null,
          ours: ourOid!,
          theirs: theirOid!,
        })

        if (subtreeResult.conflicts.length > 0) {
          conflicts.push(...subtreeResult.conflicts.map(c => `${path}/${c}`))
        }

        mergedEntries.push({
          mode: ourEntry.mode,
          path,
          oid: subtreeResult.mergedTreeOid,
          type: 'tree',
        })
      } else if (ourEntry?.type === 'blob' && theirEntry?.type === 'blob') {
        // Merge blobs
        const baseBlob = baseEntry ? await readBlob(fs, cache, gitdir, baseOid!) : UniversalBuffer.alloc(0)
        const ourBlob = await readBlob(fs, cache, gitdir, ourOid!)
        const theirBlob = await readBlob(fs, cache, gitdir, theirOid!)

        const { mergedContent, hasConflict } = mergeBlobs({
          base: baseBlob,
          ours: ourBlob,
          theirs: theirBlob,
        })

        if (hasConflict) {
          conflicts.push(path)
        }

        // Write merged blob using writeBlob
        const mergedOid = await writeBlob({
          fs,
          gitdir,
          blob: mergedContent,
        })

        mergedEntries.push({
          mode: ourEntry.mode,
          path,
          oid: mergedOid,
          type: 'blob',
        })
      } else {
        // Type mismatch or other conflict
        conflicts.push(path)
        // For now, take ours
        if (ourEntry) mergedEntries.push(ourEntry)
      }
    }
  }

  // Write merged tree using writeTree
  const mergedTreeOid = await writeTree({
    fs,
    gitdir,
    tree: mergedEntries,
  })

  return {
    mergedTree: mergedEntries,
    mergedTreeOid,
    conflicts,
  }
}

const readTree = async (
  fs: FileSystemProvider,
  cache: Record<string, unknown>,
  gitdir: string,
  oid: string
): Promise<TreeEntry[]> => {
  const { object } = await readObject({ fs, cache, gitdir, oid })
  return parseTree(object as UniversalBuffer)
}

const readBlob = async (
  fs: FileSystemProvider,
  cache: Record<string, unknown>,
  gitdir: string,
  oid: string
): Promise<UniversalBuffer> => {
  const { object } = await readObject({ fs, cache, gitdir, oid })
  return UniversalBuffer.from(object as UniversalBuffer | Uint8Array)
}

