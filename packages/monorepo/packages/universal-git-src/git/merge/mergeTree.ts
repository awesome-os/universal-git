import { WalkerFactory } from '../../models/Walker.ts'
import { _walk } from '../../commands/walk.ts'
import { writeBlob } from '../../commands/writeBlob.ts'
import { writeTree } from '../../commands/writeTree.ts'
import { MergeConflictError } from '../../errors/MergeConflictError.ts'
import { MergeNotSupportedError } from '../../errors/MergeNotSupportedError.ts'
import { NotFoundError } from '../../errors/NotFoundError.ts'
import { GitTree } from "../../models/GitTree.ts"
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import { basename } from '../../utils/basename.ts'
import { join } from '../../utils/join.ts'
import { mergeFile } from './mergeFile.ts'
import { mergeBlobs as mergeBlobsCapability } from './mergeBlobs.ts'
import { modified, detectThreeWayChange } from '../../utils/changeDetection.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import type { GitBackend } from '../../backends/GitBackend.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { MergeDriverCallback, MergeDriverParams } from "./types.ts"
import type { ObjectType } from "../../models/GitObject.ts"
import type { TreeEntry } from "../../models/GitTree.ts"
import type { WalkerEntry } from "../../models/Walker.ts"
import { WalkerMapWithNulls, WalkerReduceTree } from "../../models/Walker.ts"
import type { GitIndex } from "../index/GitIndex.ts"
import type { Repository } from '../../core-utils/Repository.ts'

/**
 * Create a merged tree with index management and worktree operations
 * 
 * This is a higher-level utility function that merges trees while managing the Git index
 * and writing conflicted files to the worktree. It uses the `mergeBlobs()` capability module
 * internally for merge algorithm logic.
 * 
 * **When to use this function:**
 * - You need to merge trees with index management (stages conflicts, updates index)
 * - You need to write conflicted files to the worktree
 * - You're working with `Repository` and `GitIndex` in higher-level operations
 * - You need worktree-level merge operations (index staging, conflict file writing)
 * - You're using `MergeStream.ts` for merge operations
 * 
 * **When NOT to use this function:**
 * - You have raw content (strings/buffers) to merge (use `mergeBlobs()` capability module instead)
 * - You have tree OIDs and need a pure algorithm (use `mergeTrees()` capability module instead)
 * - You're implementing merge logic in `cherryPick` or `rebase` (use `mergeTrees()` instead)
 * 
 * **Note:** This function requires a `Repository` instance with the correct worktree backend.
 * The caller is responsible for creating the Repository with the proper worktree backend.
 * 
 * @param {Object} args
 * @param {Repository} args.repo - Repository instance with proper worktree backend
 * @param {GitIndex} args.index - Git index instance
 * @param {string} args.ourOid - The SHA-1 object id of our tree
 * @param {string} args.baseOid - The SHA-1 object id of the base tree
 * @param {string} args.theirOid - The SHA-1 object id of their tree
 * @param {string} [args.ourName='ours'] - The name to use in conflicted files for our hunks
 * @param {string} [args.baseName='base'] - The name to use in conflicted files (in diff3 format) for the base hunks
 * @param {string} [args.theirName='theirs'] - The name to use in conflicted files for their hunks
 * @param {boolean} [args.dryRun=false] - If true, don't write to the index or worktree
 * @param {boolean} [args.abortOnConflict=false] - If true, throw error on conflict; if false, return MergeConflictError
 * @param {MergeDriverCallback} [args.mergeDriver] - Custom merge driver (defaults to `mergeFile`)
 *
 * @returns {Promise<string | MergeConflictError>} - The SHA-1 object id of the merged tree, or MergeConflictError if conflicts occur and abortOnConflict is false
 *
 */
export async function mergeTree({
  repo,
  index,
  ourOid,
  baseOid,
  theirOid,
  ourName = 'ours',
  baseName = 'base',
  theirName = 'theirs',
  dryRun = false,
  abortOnConflict = true,
  mergeDriver,
}: {
  repo: Repository
  index: GitIndex
  ourOid: string
  baseOid: string
  theirOid: string
  ourName?: string
  baseName?: string
  theirName?: string
  dryRun?: boolean
  abortOnConflict?: boolean
  mergeDriver?: MergeDriverCallback
}): Promise<string | MergeConflictError> {
  const gitBackend = repo.gitBackend
  
  const ourTree = WalkerFactory.tree({ ref: ourOid })
  const baseTree = WalkerFactory.tree({ ref: baseOid })
  const theirTree = WalkerFactory.tree({ ref: theirOid })

  const unmergedFiles: string[] = []
  const bothModified: string[] = []
  const deleteByUs: string[] = []
  const deleteByTheirs: string[] = []

  // Store conflicted file contents (with markers) to write to worktree
  // Map: filepath -> { content: string, mode: number }
  // We'll populate this when conflicts are detected
  const conflictedFiles: Map<string, { content: string; mode: number }> = new Map()

  // Store tree OIDs for error reporting
  const treeOids = { baseOid, ourOid, theirOid }
  
  let results
  let walkError: Error | null = null
  try {
    results = await _walk({
      gitBackend: repo.gitBackend,
      worktreeBackend: repo.worktreeBackend || undefined,
      cache: repo.cache,
      trees: [ourTree, baseTree, theirTree],
      map: WalkerMapWithNulls(async function (filepath: string, [ours, base, theirs]: (WalkerEntry | null)[]): Promise<TreeEntry | undefined> {
      const path = basename(filepath)
      
      // Use centralized three-way change detection
      const { ourChange, theirChange, ourOid, baseOid, theirOid } = await detectThreeWayChange(ours, base, theirs)
      
      // Determine the change pattern
      // false-false: neither changed (unchanged)
      // false-true: we deleted, they modified/added
      // true-false: we modified/added, they deleted
      // true-true: both modified/added (potential conflict)
      
      if (!ourChange && !theirChange) {
        // Neither changed - return base (if it exists)
        if (!base) return undefined
        return {
          mode: (await base.mode()).toString(8).padStart(6, '0'),
          path,
          oid: baseOid!,
          type: (await base.type()) as ObjectType,
        }
      }
      
      if (!ourChange && theirChange) {
        // We didn't change, they did - accept their changes
        // This can happen when:
        // 1. base exists, we kept it unchanged, they modified it
        // 2. base doesn't exist, we don't have it, they added it
        // 3. base exists, we deleted it, they kept/modified it (they win)
        
        if (base && theirs) {
          // Base exists and they have it - check if they modified it
          const baseType = await base.type()
          const theirType = await theirs.type()
          
          // If theirs matches base (unchanged), it's a delete/modify conflict
          // Native git treats this as a conflict when we delete and they keep it unchanged
          // But if they modified it, we should keep their version
          if (baseType === theirType && baseOid === theirOid) {
            // They kept it unchanged, we deleted it - this is a conflict
            // But for now, native git seems to accept their version (keep the file)
            // This matches the behavior where deleting a file that wasn't modified is not a conflict
            return {
              mode: (await theirs.mode()).toString(8).padStart(6, '0'),
              path,
              oid: theirOid!,
              type: (await theirs.type()) as ObjectType,
            }
          } else {
            // They modified it, so keep their version
            return {
              mode: (await theirs.mode()).toString(8).padStart(6, '0'),
              path,
              oid: theirOid!,
              type: (await theirs.type()) as ObjectType,
            }
          }
        }
        
        // if directory is deleted in theirs but not in ours we return our directory
        if (!theirs && ours && (await ours.type()) === 'tree') {
          return {
            mode: (await ours.mode()).toString(8).padStart(6, '0'),
            path,
            oid: ourOid!,
            type: (await ours.type()) as ObjectType,
          }
        }

        // If base doesn't exist and ours doesn't exist, include theirs (they added it)
        // This handles the case where they added a file that we don't have
        if (!base && !ours && theirs) {
          return {
            mode: (await theirs.mode()).toString(8).padStart(6, '0'),
            path,
            oid: theirOid!,
            type: (await theirs.type()) as ObjectType,
          }
        }

        // Base exists and ours matches base, so include their changes
        // But if they deleted it (theirs is null) and we kept it unchanged (ours exists),
        // we should keep our version (the file), not delete it
        // This matches native git behavior: deleting a file that wasn't modified in the other branch
        // results in keeping the file
        if (theirs) {
          return {
            mode: (await theirs.mode()).toString(8).padStart(6, '0'),
            path,
            oid: theirOid!,
            type: (await theirs.type()) as ObjectType,
          }
        } else if (ours) {
          // They deleted it, but we kept it unchanged - keep our version
          return {
            mode: (await ours.mode()).toString(8).padStart(6, '0'),
            path,
            oid: ourOid!,
            type: (await ours.type()) as ObjectType,
          }
        }
        // They deleted it and we also don't have it - file is deleted
        return undefined
      }
      
      if (ourChange && !theirChange) {
        // We changed, they didn't - keep our changes
        // This can happen when:
        // 1. base exists, we modified it, they kept it unchanged
        // 2. base doesn't exist, we added it, they don't have it
        // 3. base exists, we kept it unchanged, they deleted it (we win)
        
        if (ours) {
          // We modified/added it - keep our version
          return {
            mode: (await ours.mode()).toString(8).padStart(6, '0'),
            path,
            oid: ourOid!,
            type: (await ours.type()) as ObjectType,
          }
        } else if (theirs) {
          // We deleted it, but they kept it unchanged - keep their version
          // This matches native git behavior: deleting a file that wasn't modified in the other branch
          // results in keeping the file
          return {
            mode: (await theirs.mode()).toString(8).padStart(6, '0'),
            path,
            oid: theirOid!,
            type: (await theirs.type()) as ObjectType,
          }
        }
        // We deleted it and they also don't have it - file is deleted
        return undefined
      }
      
      // Both changed (ourChange && theirChange) - potential conflict
      {
          // Handle tree-tree merges (directories)
          if (
            ours &&
            theirs &&
            (await ours.type()) === 'tree' &&
            (await theirs.type()) === 'tree'
          ) {
            // Check if trees are the same - if so, return either one
            // OIDs already computed by detectThreeWayChange
            if (ourOid === theirOid) {
              // Trees are identical, return either one
              return {
                mode: (await ours.mode()).toString(8).padStart(6, '0'),
                path,
                oid: ourOid!,
                type: 'tree',
              }
            }
            // Trees are different - need to recursively merge them
            // Return undefined to let the walker continue recursively
            // The walker will automatically handle the recursive merge
            // by walking into both trees and merging their contents
            return undefined
          }

          // Modifications - both are blobs
          const ourType = ours ? await ours.type() : null
          const theirType = theirs ? await theirs.type() : null
          const isBlobMerge = ours && theirs && ourType === 'blob' && theirType === 'blob'
          if (isBlobMerge) {
            // mergeBlobs now uses GitBackend instead of fs/gitdir
            const r = await mergeBlobs({
              gitBackend,
              repo,
              path,
              ours,
              base,
              theirs,
              ourName,
              baseName,
              theirName,
              mergeDriver,
              dryRun,
            })
            if (!r.cleanMerge) {
              // Use filepath (full path) for unmergedFiles tracking
              unmergedFiles.push(filepath)
              bothModified.push(filepath)
              if (!abortOnConflict) {
                // OIDs already computed by detectThreeWayChange
                const baseOidValue = baseOid || ''
                const ourOidValue = ourOid || (ours ? await ours.oid() : '')
                const theirOidValue = theirOid || (theirs ? await theirs.oid() : '')

                // Delete existing entry for this filepath
                index.delete({ filepath })

                // Insert conflicted stages into index
                if (baseOidValue && base) {
                  const baseStats = await base.stat()
                  index.insert({ filepath, stats: baseStats, oid: baseOidValue, stage: 1 })
                }
                const ourStats = await ours.stat()
                index.insert({ filepath, stats: ourStats, oid: ourOidValue, stage: 2 })
                const theirStats = await theirs.stat()
                index.insert({ filepath, stats: theirStats, oid: theirOidValue, stage: 3 })

                // Store conflicted content to write to worktree
                // The conflicted content (with markers) is already generated by mergeFile
                // Only store if we're not aborting on conflict (abortOnConflict = false)
                if (repo.worktreeBackend && !dryRun && !abortOnConflict && r.mergedText) {
                  const mode = parseInt(r.mergeResult.mode, 8)
                  conflictedFiles.set(filepath, { content: r.mergedText, mode })
                }
              }
              // Return undefined so conflicted files don't get added to the tree
              return undefined
            } else {
              // Clean merge - update index with merged result (regardless of abortOnConflict)
              // When mergeDriver returns cleanMerge: true, the conflict is resolved
              const stats = await ours.stat()
              index.insert({ filepath, stats, oid: r.mergeResult.oid, stage: 0 })
            }
            return r.mergeResult
          }

          // deleted by us
          if (
            base &&
            !ours &&
            theirs &&
            (await base.type()) === 'blob' &&
            (await theirs.type()) === 'blob'
          ) {
            unmergedFiles.push(filepath)
            deleteByUs.push(filepath)
            if (!abortOnConflict) {
              // OIDs already computed by detectThreeWayChange
              const baseOidValue = baseOid || await base.oid()
              const theirOidValue = theirOid || await theirs.oid()

              index.delete({ filepath })

              const baseStats = await base.stat()
              index.insert({ filepath, stats: baseStats, oid: baseOidValue, stage: 1 })
              const theirStats = await theirs.stat()
              index.insert({ filepath, stats: theirStats, oid: theirOidValue, stage: 3 })
            }
            // Return undefined so conflicted files don't get added to the tree
            return undefined
          }

          // deleted by theirs
          if (
            base &&
            ours &&
            !theirs &&
            (await base.type()) === 'blob' &&
            (await ours.type()) === 'blob'
          ) {
            unmergedFiles.push(filepath)
            deleteByTheirs.push(filepath)
            if (!abortOnConflict) {
              // OIDs already computed by detectThreeWayChange
              const baseOidValue = baseOid || await base.oid()
              const ourOidValue = ourOid || await ours.oid()

              index.delete({ filepath })

              const baseStats = await base.stat()
              index.insert({ filepath, stats: baseStats, oid: baseOidValue, stage: 1 })
              const ourStats = await ours.stat()
              index.insert({ filepath, stats: ourStats, oid: ourOidValue, stage: 2 })
            }
            // Return undefined so conflicted files don't get added to the tree
            return undefined
          }

          // deleted by both
          if (
            base &&
            !ours &&
            !theirs &&
            ((await base.type()) === 'blob' || (await base.type()) === 'tree')
          ) {
            return undefined
          }

          // all other types of conflicts fail
          // TODO: Merge conflicts involving additions
          throw new MergeNotSupportedError()
        }
      }),
    reduce: WalkerReduceTree(async function (parent: TreeEntry | undefined, children: TreeEntry[]): Promise<TreeEntry | undefined> {
      // If we have conflicts and abortOnConflict is true, we still need to build the tree structure
      // to detect all conflicts, but we can skip writing objects to save time
      // The key is that we still need to return a valid tree structure so the walk completes
      // and we can detect all conflicts before throwing MergeConflictError
      // However, if abortOnConflict is false, we build the tree (without conflicted files)
      // and then return MergeConflictError at the end
      // For now, always build the tree structure to ensure all conflicts are detected
      
      // Flatten children - they might be arrays from the walk function
      const flattenedChildren: TreeEntry[] = []
      for (const child of children) {
        if (Array.isArray(child)) {
          // Child is an array - extract TreeEntry objects from it
          for (const item of child) {
            if (item && typeof item === 'object' && 'path' in item && 'oid' in item) {
              flattenedChildren.push(item as TreeEntry)
            }
          }
        } else if (child && typeof child === 'object' && 'path' in child && 'oid' in child) {
          // Child is a TreeEntry object directly
          flattenedChildren.push(child as TreeEntry)
        }
      }
      
      // Filter out entries with invalid paths (empty, undefined, or '.')
      // GitTree.from will throw if path is empty/undefined, so we need to filter them out
      const validEntries = flattenedChildren.filter((e): e is TreeEntry => {
        return e !== undefined && e !== null && 
               typeof e === 'object' && 
               'path' in e && 
               typeof e.path === 'string' && 
               e.path !== '' && 
               e.path !== '.' &&
               'oid' in e && 
               typeof e.oid === 'string' && 
               e.oid !== ''
      })

      // CRITICAL: Handle root case (parent is undefined or parent.path === '.')
      // For the root, we need to create a tree entry if we have any children
      if (!parent || parent.path === '.') {
        if (validEntries.length > 0) {
          // Create root tree from entries using writeTree with dryRun support
          const oid = await writeTree({
            repo,
            tree: validEntries,
            dryRun,
          })
          // Return a root tree entry
          return {
            mode: '040000',
            path: '.',
            oid,
            type: 'tree',
          }
        }
        // Empty root - return empty tree OID
        // The empty tree OID is hardcoded: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' for SHA-1
        const { getOidLength } = await import('../../utils/detectObjectFormat.ts')
        const objectFormat = await repo.getObjectFormat()
        const emptyTreeOid = objectFormat === 'sha256'
          ? '0'.repeat(getOidLength('sha256'))
          : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
        return {
          mode: '040000',
          path: '.',
          oid: emptyTreeOid,
          type: 'tree',
        }
      }

      // if the parent was deleted, the children have to go
      if (!parent) return undefined

      // automatically delete directories if they have been emptied
      // except for the root directory
      if (
        parent &&
        parent.type === 'tree' &&
        validEntries.length === 0 &&
        parent.path !== '.'
      )
        return undefined

      if (validEntries.length > 0) {
        // Use writeTree with dryRun support
        const oid = await writeTree({
          repo,
          tree: validEntries,
          dryRun,
        })
        parent.oid = oid
      }
      return parent
    }),
  })
  } catch (error) {
    console.error('[mergeTree] Walk failed:', error)
    // Store the error but don't throw yet - we need to check for conflicts first
    walkError = error as Error
    
    // If the walk fails due to missing objects, provide better error context
    if (error instanceof NotFoundError) {
      const errorMessage = (error as any).data?.what || error.message || 'unknown'
      // Ensure treeOids are available for error message
      const baseTree = treeOids.baseOid || 'unknown'
      const ourTree = treeOids.ourOid || 'unknown'
      const theirTree = treeOids.theirOid || 'unknown'
      
      // If the error already has a detailed message (from readdir), preserve it and add context
      if (errorMessage.includes('referenced at path')) {
        walkError = new NotFoundError(
          `${errorMessage} ` +
          `Base tree: ${baseTree}, Our tree: ${ourTree}, Their tree: ${theirTree}`
        )
      } else {
        // Otherwise, extract OID and create a new error message
        const oidMatch = errorMessage.match(/[a-f0-9]{40}/i)
        const oid = oidMatch ? oidMatch[0] : errorMessage
        walkError = new NotFoundError(
          `Tree object ${oid} does not exist in the object database during merge. ` +
          `This indicates a repository integrity issue. The merge cannot proceed without all referenced objects. ` +
          `Base tree: ${baseTree}, Our tree: ${ourTree}, Their tree: ${theirTree}`
        )
      }
    }
    // Don't throw yet - check for conflicts first
  }

  // Check for conflicts after the walk completes
  // IMPORTANT: Always check for conflicts FIRST, even if the walk failed or results is undefined
  // This ensures conflicts are detected even if there were errors during the walk
  // Conflicts take precedence over walk errors - if conflicts were detected, throw MergeConflictError
  // NOTE: Conflicts are detected regardless of abortOnConflict - we always track them in unmergedFiles
  // Even if the walk failed due to missing objects (NotFoundError), we should still check for conflicts
  // because conflicts might have been detected before the walk failed
  if (unmergedFiles.length > 0) {
    console.log('[mergeTree] Conflicts detected:', unmergedFiles)
    // Write workdir files from the merged tree (excluding conflicted files)
    // Only if we have a valid tree OID and worktree backend is available
    if (repo.worktreeBackend && results && typeof results === 'object' && 'oid' in results && results.oid) {
      await _walk({
        gitBackend: repo.gitBackend,
        worktreeBackend: repo.worktreeBackend || undefined,
        cache: repo.cache,
        trees: [WalkerFactory.tree({ ref: results.oid as string })],
        map: WalkerMapWithNulls(async function (filepath: string, [entry]: (WalkerEntry | null)[]): Promise<boolean> {
          if (!entry) return false
          if ((await entry.type()) === 'blob') {
            const mode = await entry.mode()
            const content = await entry.content()
            if (content) {
              const contentStr = new TextDecoder().decode(content)
              await repo.worktreeBackend!.write(filepath, contentStr, { mode })
            }
          }
          return true
        }),
      })

      // Write conflicted files with conflict markers to worktree (only if fs and dir are provided)
      if (repo.worktreeBackend) {
        // Use Promise.allSettled to write all files concurrently and handle partial failures
        // This eliminates race conditions and ensures all conflicts are written even if some fail
        const { dirname } = await import('../../utils/dirname.ts')
        const writePromises = Array.from(conflictedFiles.entries()).map(async ([filepath, { content, mode }]) => {
          const parentDir = dirname(filepath)
          try {
            // FileSystem.mkdir already implements recursive directory creation
            await repo.worktreeBackend!.mkdir(parentDir)
          } catch {
            // Directory might already exist, ignore
          }
          await repo.worktreeBackend!.write(filepath, content, { mode })
        })
      
      const writeResults = await Promise.allSettled(writePromises)
      // Check for any failures and log them, but don't throw - we still want to return MergeConflictError
      const failures = writeResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason)
      if (failures.length > 0) {
        // Log failures but continue - the merge conflict error will still be returned
        console.warn(`Failed to write ${failures.length} conflicted file(s):`, failures)
      }
      }
    }
    // Always return MergeConflictError when there are conflicts
    return new MergeConflictError(
      unmergedFiles,
      bothModified,
      deleteByUs,
      deleteByTheirs
    )
  }

  // If we get here and there are no conflicts, but also no results,
  // the walk must have failed. Throw the walk error if we have one.
  // This handles NotFoundError and other walk errors when there are no conflicts
  if (walkError) {
    throw walkError
  }

  // No conflicts - return the merged tree OID
  // The reduce function returns a TreeEntry (with oid) or undefined
  // If results is a TreeEntry, extract the oid
  // If results is undefined, it means the tree is empty (all files deleted)
  if (results === undefined) {
    // Empty tree - return the canonical empty tree OID
    return '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  }
  
  if (results && typeof results === 'object' && 'oid' in results) {
    const oid = (results as any).oid as string
    // If oid is undefined, it means the tree has no entries (empty tree)
    // This can happen when the reduce function didn't write a tree because entries.length === 0
    if (!oid) {
      return '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    }
    return oid
  }
  
  // If we get here, something unexpected happened
  throw new Error('Unexpected result from merge tree walk: no conflicts detected but no tree OID returned')
}

/**
 * Merges blob entries from a tree walk.
 * 
 * This is a higher-level utility function that works with `WalkerEntry` objects
 * and writes merged blobs to the Git object database. It uses the `mergeBlobs()`
 * capability module internally as the single source of truth for merge algorithm logic.
 * 
 * **When to use this function:**
 * - You have `WalkerEntry` objects from a tree walk
 * - You need to merge blobs and write them to the Git object database
 * - You're working within `mergeTree()` operations that manage tree merges
 * - You need to handle file modes and write merged blobs via `writeBlob()`
 * 
 * **When NOT to use this function:**
 * - You have raw content (strings/buffers) to merge (use `mergeBlobs()` capability module instead)
 * - You need to merge entire trees (use `mergeTrees()` or `mergeTree()` instead)
 * - You need index management or worktree operations (use `mergeTree()` from `GitWorktreeBackend` instead)
 * 
 * **Note:** This function is part of `mergeTree()` and will be moved to `GitWorktreeBackend`
 * in Phase 0A.1 as it's a worktree-level operation.
 * 
 * @param {Object} args
 * @param {import('../../types.ts').FileSystemProvider} args.fs - File system provider
 * @param {string} args.gitdir - Git directory path
 * @param {string} args.path - File path being merged
 * @param {WalkerEntry} args.ours - Our version of the file
 * @param {WalkerEntry} args.base - Base version of the file (can be null)
 * @param {WalkerEntry} args.theirs - Their version of the file
 * @param {string} [args.ourName] - Name to use in conflict markers for our side
 * @param {string} [args.baseName] - Name to use in conflict markers for base side
 * @param {string} [args.theirName] - Name to use in conflict markers for their side
 * @param {boolean} [args.dryRun = false] - If true, don't write the blob to the object database
 * @param {MergeDriverCallback} [args.mergeDriver] - Custom merge driver (defaults to `mergeFile`)
 * @returns {Promise<{cleanMerge: boolean, mergeResult: TreeEntry, mergedText?: string}>}
 *   - `cleanMerge`: Whether the merge was clean (no conflicts)
 *   - `mergeResult`: Tree entry with merged blob OID and mode
 *   - `mergedText`: Merged text content (only present for conflicts)
 */
export async function mergeBlobs({
  gitBackend,
  repo,
  path,
  ours,
  base,
  theirs,
  ourName,
  theirName,
  baseName,
  dryRun,
  mergeDriver = mergeFile as unknown as MergeDriverCallback,
}: {
  gitBackend: GitBackend
  repo?: Repository
  path: string
  ours: WalkerEntry
  base: WalkerEntry | null
  theirs: WalkerEntry
  ourName?: string
  theirName?: string
  baseName?: string
  dryRun?: boolean
  mergeDriver?: MergeDriverCallback
}): Promise<{ cleanMerge: boolean; mergeResult: TreeEntry; mergedText?: string }> {
  const type = 'blob'
  // Compute the new mode.
  // Since there are ONLY two valid blob modes ('100755' and '100644') it boils down to this
  let baseMode = '100755'
  let baseOid = ''
  let baseContent = ''
  if (base && (await base.type()) === 'blob') {
    baseMode = (await base.mode()).toString(8)
    baseOid = await base.oid()
    const baseContentBuffer = await base.content()
    if (baseContentBuffer) {
      baseContent = UniversalBuffer.from(baseContentBuffer).toString('utf8')
    }
  }
  const ourMode = (await ours.mode()).toString(8)
  const theirMode = (await theirs.mode()).toString(8)
  const mode = baseMode === ourMode ? theirMode : ourMode
  // The trivial case: nothing to merge except maybe mode
  if ((await ours.oid()) === (await theirs.oid())) {
    return {
      cleanMerge: true,
      mergeResult: { mode: mode.padStart(6, '0'), path, oid: await ours.oid(), type },
    }
  }
  // if only one side made oid changes, return that side's oid
  if ((await ours.oid()) === baseOid) {
    return {
      cleanMerge: true,
      mergeResult: { mode: theirMode.padStart(6, '0'), path, oid: await theirs.oid(), type },
    }
  }
  if ((await theirs.oid()) === baseOid) {
    return {
      cleanMerge: true,
      mergeResult: { mode: ourMode.padStart(6, '0'), path, oid: await ours.oid(), type },
    }
  }
  // if both sides made changes do a merge
  const ourContentBuffer = await ours.content()
  const theirContentBuffer = await theirs.content()
  const ourContent = ourContentBuffer ? UniversalBuffer.from(ourContentBuffer) : UniversalBuffer.from('')
  const theirContent = theirContentBuffer ? UniversalBuffer.from(theirContentBuffer) : UniversalBuffer.from('')
  const baseContentBuffer = base && (await base.type()) === 'blob' ? await base.content() : null
  const baseContentUniversal = baseContentBuffer ? UniversalBuffer.from(baseContentBuffer) : UniversalBuffer.from('')
  
  // Use mergeBlobs capability module as the single source of truth for merge algorithm
  // If a custom mergeDriver is provided, use it; otherwise use the capability module directly
  let mergedText: string
  let cleanMerge: boolean
  
  if (mergeDriver && mergeDriver !== mergeFile) {
    // Custom merge driver provided - use it
    const mergeResult = await mergeDriver({
      branches: [baseName || 'base', ourName || 'ours', theirName || 'theirs'],
      contents: [
        baseContentUniversal.toString('utf8'),
        ourContent.toString('utf8'),
        theirContent.toString('utf8'),
      ],
      path,
    } as MergeDriverParams)
    mergedText = mergeResult.mergedText
    cleanMerge = mergeResult.cleanMerge
  } else {
    // Use mergeBlobs capability module directly (eliminates duplication)
    const mergeResult = mergeBlobsCapability({
      base: baseContentUniversal,
      ours: ourContent,
      theirs: theirContent,
      ourName: ourName || 'ours',
      theirName: theirName || 'theirs',
    })
    mergedText = mergeResult.mergedContent.toString('utf8')
    cleanMerge = !mergeResult.hasConflict
  }
  
  // Write merged blob using GitBackend.writeObject() or writeBlob with repo
  let oid: string
  if (dryRun) {
    // For dryRun, compute OID without writing
    const { computeObjectId } = await import('../../utils/computeObjectId.ts')
    oid = computeObjectId({
      type: 'blob',
      object: UniversalBuffer.from(mergedText, 'utf8'),
    })
  } else {
    // Use GitBackend.writeObject() to write the blob
    oid = await gitBackend.writeObject(
      'blob',
      UniversalBuffer.from(mergedText, 'utf8'),
      'content'
    )
  }

  return { 
    cleanMerge, 
    mergeResult: { mode: mode.padStart(6, '0'), path, oid, type },
    mergedText: cleanMerge ? undefined : mergedText // Only return mergedText for conflicts
  }
}

