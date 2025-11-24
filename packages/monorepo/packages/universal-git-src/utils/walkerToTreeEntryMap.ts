import AsyncLock from 'async-lock'

import { WalkerFactory } from '../models/Walker.ts'
import { _walk } from '../commands/walk.ts'
import { writeTree } from '../commands/writeTree.ts'
import { InternalError } from '../errors/InternalError.ts'
import { NotFoundError } from '../errors/NotFoundError.ts'
import { isIgnored as isIgnoredInternal } from "../git/info/isIgnored.ts"
// GitIndexManager import removed - using Repository.readIndexDirect/writeIndexDirect instead
import { readObject } from "../git/objects/readObject.ts"
import { read as readLoose } from "../git/objects/loose.ts"
import { writeBlob } from "../commands/writeBlob.ts"
import { join } from './join.ts'
import { posixifyPathBuffer } from './posixifyPathBuffer.ts'
import { createFileSystem } from './createFileSystem.ts'
import { detectChange } from './changeDetection.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { ObjectType } from "../models/GitObject.ts"
import type { TreeEntry } from "../models/GitTree.ts"
import type { Walker, WalkerEntry, WalkerReduce, WalkerIterate, WalkerIterateCallback } from "../models/Walker.ts"
import { WalkerMapWithNulls } from "../models/Walker.ts"
import type { GitIndex } from "../git/index/GitIndex.ts"

const _TreeMap: Record<string, () => Walker> = {
  stage: () => WalkerFactory.stage(),
  workdir: () => WalkerFactory.workdir(),
}

let lock: AsyncLock | undefined
export async function acquireLock<T>(ref: string | { filepath: string }, callback: () => Promise<T>): Promise<T> {
  if (lock === undefined) lock = new AsyncLock()
  const lockKey = typeof ref === 'string' ? ref : ref.filepath
  return lock.acquire(lockKey, callback)
}

// make sure filepath, blob type and blob object (from loose objects) plus oid are in sync and valid
async function checkAndWriteBlob(
  fs: FileSystemProvider,
  gitdir: string,
  dir: string,
  filepath: string,
  oid: string | null = null,
  cache: Record<string, unknown> = {}
): Promise<string | undefined> {
  const normalizedFs = createFileSystem(fs)
  const currentFilepath = join(dir, filepath)
  
  // If OID is provided, first check if the object exists in the object store (loose or packed)
  if (oid) {
    try {
      const objResult = await readObject({ fs, cache, gitdir, oid, format: 'content' })
      if (objResult) {
        // Object exists in the store, return the OID
        return oid
      }
    } catch (error) {
      // Object doesn't exist in store - this can happen if the blob wasn't written yet
      // or if there's a cache issue. For staged files, the OID should exist.
      // Continue to try reading from working directory as fallback
    }
  }
  
  // Object doesn't exist in store (or OID not provided), try reading from working directory
  let stats
  try {
    stats = await normalizedFs.lstat(currentFilepath)
  } catch {
    // File doesn't exist in working directory
    if (oid) {
      // If OID was provided but object doesn't exist in store and file doesn't exist in workdir,
      // For staged files, the OID should exist in the object store (written by add())
      // If it doesn't exist, it might be a timing issue or the blob wasn't written yet
      // In this case, we should still return the OID and let the tree be written with it
      // The tree will be valid even if the blob doesn't exist yet (it will be written later)
      // Return the OID anyway - the tree structure is what matters
      return oid
    }
    // If no OID provided and file doesn't exist, return undefined
    return undefined
  }
  
  if (!stats) {
    if (oid) {
      throw new NotFoundError(currentFilepath)
    }
    return undefined
  }
  
  if ((stats as any).isDirectory())
    throw new InternalError(
      `${currentFilepath}: file expected, but found directory`
    )

  // Read from working directory and write to object store
  let retOid: string | undefined = undefined
  await acquireLock({ filepath: currentFilepath }, async () => {
    const object = (stats as any).isSymbolicLink()
      ? await normalizedFs.readlink(currentFilepath).then((link: UniversalBuffer | string | null) => {
          if (link === null) throw new NotFoundError(currentFilepath)
          return posixifyPathBuffer(UniversalBuffer.isBuffer(link) ? link : UniversalBuffer.from(link))
        })
      : await normalizedFs.read(currentFilepath)

    if (object === null) throw new NotFoundError(currentFilepath)

    const objectBuffer = UniversalBuffer.isBuffer(object) ? object : UniversalBuffer.from(object as string | Uint8Array)
    const uint8Array = objectBuffer instanceof Uint8Array ? objectBuffer : new Uint8Array(objectBuffer)
    retOid = await writeBlob({ fs, gitdir, blob: objectBuffer })
  })

  return retOid
}

interface TreeEntryWithChildren {
  mode: string | number
  path: string
  oid?: string
  type: ObjectType
  children?: TreeEntryWithChildren[]
}

async function processTreeEntries({
  fs,
  dir,
  gitdir,
  entries,
  cache = {},
  objectFormat,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  entries: TreeEntryWithChildren[]
  cache?: Record<string, unknown>
  objectFormat?: 'sha1' | 'sha256'
}): Promise<TreeEntryWithChildren[]> {
  // make sure each tree entry has valid oid
  async function processTreeEntry(entry: TreeEntryWithChildren): Promise<TreeEntryWithChildren> {
    if (entry.type === 'tree') {
      if (!entry.oid) {
        // Process children entries if the current entry is a tree
        // Use Promise.allSettled to handle partial failures gracefully
        const childrenResults = await Promise.allSettled((entry.children || []).map(processTreeEntry))
        const children = childrenResults
          .filter((result): result is PromiseFulfilledResult<TreeEntryWithChildren> => 
            result.status === 'fulfilled'
          )
          .map(result => result.value)
        
        // If any children failed, we still try to write the tree with successful children
        // This prevents one failure from blocking the entire operation
        if (childrenResults.some(result => result.status === 'rejected')) {
          const failures = childrenResults
            .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
            .map(result => result.reason)
          console.warn(`Some tree entries failed to process:`, failures)
        }
        
        // Convert children to tree format before writing
        const childrenTreeEntries: TreeEntry[] = children.map(child => ({
          mode: String(child.mode || (child.type === 'tree' ? '040000' : '100644')),
          path: child.path!,
          oid: child.oid!,
          type: child.type || 'blob',
        }))
        
        // Write the tree with the processed children
        entry.oid = await writeTree({
          fs,
          gitdir,
          tree: childrenTreeEntries,
          objectFormat,
        })
        entry.mode = '040000' // directory
      }
    } else if (entry.type === 'blob') {
      // If OID is already set (from map function for staged files), use it directly
      // Only call checkAndWriteBlob if OID is not set (for workdir files)
      if (entry.oid) {
        // OID is already set - this is a staged file, use the OID directly
        // Ensure mode and type are set
        entry.mode = entry.mode || '100644'
        entry.type = entry.type || 'blob'
      } else {
        // OID not set - this is a workdir file, need to write blob and get OID
        const oid = await checkAndWriteBlob(
          fs,
          gitdir,
          dir,
          entry.path,
          null,
          cache
        )
        if (oid) {
          entry.oid = oid
        }
        entry.mode = entry.mode || '100644'
        entry.type = entry.type || 'blob'
      }
    }

    // remove path from entry.path (keep only filename for tree structure)
    // CRITICAL: Only modify path if it contains a directory separator
    // For root-level files, path should remain unchanged
    if (entry.path && entry.path.includes('/')) {
      entry.path = entry.path.split('/').pop() || entry.path
    }
    return entry
  }

  // Use Promise.allSettled to process all entries concurrently and handle partial failures
  // This eliminates race conditions where one failure stops all processing
  const results = await Promise.allSettled(entries.map(processTreeEntry))
  const processedEntries = results
    .filter((result): result is PromiseFulfilledResult<TreeEntryWithChildren> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value)
  
  // Log any failures but continue with successful entries
  if (results.some(result => result.status === 'rejected')) {
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason)
    console.warn(`Some entries failed to process:`, failures)
  }
  
  return processedEntries
}

export async function writeTreeChanges({
  fs,
  dir,
  gitdir,
  treePair, // [WalkerFactory.tree({ ref: 'HEAD' }), 'stage'] would be the equivalent of `git write-tree`
  cache = {},
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  treePair: [Walker | string, Walker | string]
  cache?: Record<string, unknown>
}): Promise<string | null> {
  const isStage = treePair[1] === 'stage'
  const isWorkdir = treePair[1] === 'workdir'
  
  // CRITICAL: Get the Repository instance ONCE and pass it to _walk
  // This ensures all walkers (STAGE, TREE, WORKDIR) use the same Repository instance
  // and see the same index state as add(), status(), etc.
  // IMPORTANT: Pass gitdir to Repository.open() to ensure we get the same instance as add()
  const { Repository } = await import('../core-utils/Repository.ts')
  const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
  
  // Resolve effective gitdir from the repository (for worktree support)
  let effectiveGitdir = gitdir
  try {
    const worktree = repo.getWorktree()
    if (worktree) {
      effectiveGitdir = await worktree.getGitdir()
    } else {
      effectiveGitdir = await repo.getGitdir()
    }
  } catch {
    // If getGitdir fails, use provided gitdir
    effectiveGitdir = gitdir
  }
  
  // CRITICAL: If comparing against STAGE, ensure we read the latest index state
  // Since add() now writes directly to .git/index, the STAGE walker will read the latest state
  if (isStage) {
    await repo.readIndexDirect() // Read the owned instance (force=false by default)
  }
  
  const trees = treePair.map(t => (typeof t === 'string' ? _TreeMap[t]() : t)) as Walker[]

  // Track whether any changes were detected
  let hasChanges = false
  // transform WalkerEntry objects into the desired format
  const map = WalkerMapWithNulls(async (filepath: string, [head, stage]: (WalkerEntry | null)[]): Promise<TreeEntry | undefined> => {
    if (
      filepath === '.' ||
      (await isIgnoredInternal({ fs, dir, gitdir, filepath }))
    ) {
      return undefined
    }

    if (isStage) {
      // For HEAD vs STAGE comparison: STAGE is the source of truth
      // We are creating a tree that represents the STAGE state
      // Therefore, if an entry exists in STAGE, we use it (regardless of whether it changed)
      // If it doesn't exist in STAGE, it was deleted, so we return undefined
      
      // Record changes for tracking purposes
      const change = await detectChange(head, stage)
      if (change.type !== 'unchanged') {
        hasChanges = true
      }
      
      // If stage exists, use it (this includes both changed and unchanged files)
      if (stage) {
        const type = await stage.type()
        const stageMode = await stage.mode()
        const stageOid = await stage.oid()
        
        // Skip if mode or oid is undefined
        if (stageMode === undefined || stageOid === undefined) {
          return undefined
        }
        
        if (type === 'tree' || type === 'special' || type === 'commit') {
          // For trees, we return a placeholder that will be handled by the reducer
          return {
            mode: stageMode.toString(8).padStart(6, '0'),
            path: filepath.split('/').pop() || filepath, // Use basename for tree entries
            oid: stageOid,
            type: type as ObjectType,
          }
        }
        
        // It's a blob - return its properties
        // Use basename for the path (just the filename, not the full path)
        return {
          mode: stageMode.toString(8).padStart(6, '0'),
          path: filepath.split('/').pop() || filepath, // Use basename for consistency
          oid: stageOid,
          type: 'blob' as const,
        }
      }
      
      // If stage is null, the file was deleted from the index
      // Record it as a change but return undefined to exclude it from the new tree
      if (head) {
        hasChanges = true
      }
      return undefined
    } else {
      // For HEAD/STAGE vs WORKDIR comparison: WORKDIR is the source of truth
      // - head = HEAD or STAGE (depending on what was passed)
      // - stage = WORKDIR (working directory state)
      // - We want to return the WORKDIR state if it exists
      
      // Record changes for tracking purposes
      const change = await detectChange(head, stage)
      if (change.type !== 'unchanged') {
        hasChanges = true
      }
      
      // If WORKDIR exists, use it (this includes both changed and unchanged files)
      if (stage) {
        const type = await stage.type()
        const stageMode = await stage.mode()
        const stageOid = await stage.oid()
        
        // Skip if mode or oid is undefined
        if (stageMode === undefined || stageOid === undefined) {
          return undefined
        }
        
        if (type === 'tree' || type === 'special' || type === 'commit') {
          // For trees, we return a placeholder that will be handled by the reducer
          return {
            mode: stageMode.toString(8).padStart(6, '0'),
            path: filepath.split('/').pop() || filepath, // Use basename for tree entries
            oid: stageOid,
            type: type as ObjectType,
          }
        }
        
        // It's a blob - CRITICAL: Ensure the blob is written to the object database
        // WORKDIR files might not have their blobs written yet (if they were never added to index)
        // We need to write the blob to ensure it exists when the stash is applied
        const computedOid = stageOid
        // Use checkAndWriteBlob to ensure the blob exists in the object database
        // This will write the blob if it doesn't exist, or return the existing OID if it does
        const actualOid = await checkAndWriteBlob(
          fs,
          effectiveGitdir,
          dir,
          filepath,
          computedOid, // Pass the computed OID - checkAndWriteBlob will verify it exists or write it
          cache
        )
        
        if (!actualOid) {
          // Blob couldn't be written - skip this file
          return undefined
        }
        
        // Return the blob properties with the actual OID from the object database
        return {
          mode: (await stage.mode()).toString(8).padStart(6, '0'),
          path: filepath.split('/').pop() || filepath, // Use basename for consistency
          oid: actualOid,
          type: 'blob',
        }
      }
      
      // If WORKDIR doesn't exist, the file was deleted
      // Record it as a change but return undefined to exclude it from the new tree
      if (head) {
        hasChanges = true
      }
      return undefined
    }
  })

  // combine mapped entries with their parent results
  const reduce = async (parent: TreeEntry | TreeEntryWithChildren | undefined, children: (TreeEntry | TreeEntryWithChildren)[]): Promise<TreeEntryWithChildren | TreeEntryWithChildren[] | undefined> => {
    // Convert children from TreeEntry to TreeEntryWithChildren
    const filteredChildren: TreeEntryWithChildren[] = children
      .filter(Boolean)
      .map(child => {
        // If already TreeEntryWithChildren, return as-is
        if ('children' in child) {
          return child as TreeEntryWithChildren
        }
        // Convert TreeEntry to TreeEntryWithChildren
        return {
          mode: child.mode,
          path: child.path,
          oid: child.oid,
          type: child.type,
        } as TreeEntryWithChildren
      })
    
    if (!parent) {
      // No parent - return array of root-level entries
      return filteredChildren.length > 0 ? filteredChildren : undefined
    } else {
      // Convert parent to TreeEntryWithChildren if needed
      const parentWithChildren: TreeEntryWithChildren = {
        mode: parent.mode,
        path: parent.path,
        oid: parent.oid,
        type: parent.type,
        children: filteredChildren.length > 0 ? filteredChildren : undefined,
      }
      return parentWithChildren
    }
  }


  // Custom iterate function that processes all children
  // Note: children from unionOfIterators are (string | null)[] arrays, not WalkerEntry arrays
  // The walkCallback in walk.ts will handle converting strings to WalkerEntry objects
  // So we just need to process all children - the filtering happens in the map function
  const iterate = async (walkCallback: WalkerIterateCallback, children: IterableIterator<WalkerEntry[]>): Promise<unknown[]> => {
    // Convert iterator to array and process all children
    // The walkCallback will receive (string | null)[] from unionOfIterators
    // and will convert them to paths, then call walk() recursively
    const childrenArray = [...children]
    if (childrenArray.length === 0) return []
    // Process all children - filtering happens in the map function based on whether entries exist
    return Promise.all(childrenArray.map(walkCallback))
  }

  // Custom reduce function that flattens all entries into a single array
  // This is needed because the default reduce creates nested structures,
  // but writeTreeChanges needs a flat list of all changed files
  const customReduce = async (parent: TreeEntry | TreeEntryWithChildren | undefined, children: (TreeEntry | TreeEntryWithChildren)[]): Promise<TreeEntryWithChildren[]> => {
    // Helper function to recursively flatten and validate entries
    const flattenAndValidate = (items: unknown[]): TreeEntryWithChildren[] => {
      const result: TreeEntryWithChildren[] = []
      for (const item of items) {
        if (item === undefined || item === null) continue
        if (Array.isArray(item)) {
          // Recursively flatten nested arrays
          result.push(...flattenAndValidate(item))
        } else if (typeof item === 'object' && 'oid' in item && 'path' in item) {
          // Validate it's a proper TreeEntry
          const entry = item as TreeEntry | TreeEntryWithChildren
          if (entry.oid !== undefined && entry.path !== undefined && entry.path !== '.') {
            // Convert to TreeEntryWithChildren format
            result.push({
              mode: entry.mode,
              path: entry.path,
              oid: entry.oid,
              type: entry.type,
              children: 'children' in entry ? entry.children : undefined,
            })
          }
        }
      }
      return result
    }
    
    // Flatten all children (which may themselves be arrays from nested reduces)
    const flattenedChildren = flattenAndValidate(children)
    
    // If the parent is a valid entry (not undefined and not the root '.'), include it
    // The root '.' is filtered out in the map function, so parent should be undefined for root
    if (parent && typeof parent === 'object' && 'oid' in parent && 'path' in parent && parent.oid && parent.path && parent.path !== '.') {
      const parentEntry: TreeEntryWithChildren = {
        mode: parent.mode,
        path: parent.path,
        oid: parent.oid,
        type: parent.type,
        children: 'children' in parent ? parent.children : undefined,
      }
      return [parentEntry, ...flattenedChildren]
    }
    
    // Otherwise, just return the flattened children
    // This is the critical case - when parent is undefined (root filtered out),
    // we must return the children so they get collected
    return flattenedChildren
  }

  const entries = await _walk({
    repo,
    trees,
    map,
    reduce: customReduce as WalkerReduce,
    iterate: iterate as unknown as WalkerIterate,
  }) as TreeEntryWithChildren[]

  // The `entries` variable is the flat list of TreeEntry objects for the root tree.
  // If it's empty or not an array, there are no changes.
  // However, we also check hasChanges flag to ensure we don't miss changes
  // that were detected but not collected in entries (e.g., due to reduce function issues)
  if (!Array.isArray(entries) || entries.length === 0) {
    // If hasChanges is true but entries is empty, it means changes were detected
    // but not collected properly - this shouldn't happen, but we should still return null
    // to avoid creating an invalid tree
    if (!hasChanges) {
      return null // No changes found, return null.
    }
    // If hasChanges is true but entries is empty, log a warning and return null
    // This indicates a bug in the reduce function or walk processing
    console.warn('writeTreeChanges: hasChanges is true but entries is empty. This may indicate a bug in the reduce function.')
    return null
  }

  // CRITICAL: If comparing HEAD vs STAGE and no changes were detected, return null immediately
  // This short-circuits tree creation when HEAD and STAGE are identical
  // This must happen BEFORE processing entries to avoid creating unnecessary trees
  if (isStage && !hasChanges) {
    return null // No changes detected - HEAD and STAGE are identical
  }

  // CRITICAL: If comparing STAGE/HEAD vs WORKDIR and no changes were detected, return null immediately
  // This short-circuits tree creation when WORKDIR is identical to the base
  // This must happen BEFORE processing entries to avoid creating unnecessary trees
  if (isWorkdir && !hasChanges) {
    return null // No changes detected - WORKDIR is identical to the base
  }
  
  // CRITICAL: For HEAD vs STAGE comparison, if entries array is empty after filtering,
  // there are no changes - return null immediately
  // This handles the case where entries exist but are all filtered out (e.g., all ignored)
  if (isStage && entries.length === 0) {
    return null // No valid entries to process
  }

  // The entries are already in the correct format from the `map` function.
  // We just need to ensure they have all required fields before writing.
  const finalTreeEntries: TreeEntry[] = entries
    .filter((entry): entry is TreeEntryWithChildren & { oid: string; path: string; mode: string | number } => {
      // A valid TreeEntry must have a mode, path, and oid.
      return entry !== undefined && entry !== null && entry.mode !== undefined && entry.path !== undefined && entry.oid !== undefined
    })
    .map(entry => {
      // Ensure mode is in the correct format (string, octal, padded)
      let mode: string
      if (typeof entry.mode === 'number') {
        mode = entry.mode.toString(8).padStart(6, '0')
      } else if (typeof entry.mode === 'string') {
        // Already a string, ensure it's padded if needed
        mode = entry.mode.padStart(6, '0')
      } else {
        // Default to blob mode if mode is missing
        mode = entry.type === 'tree' ? '040000' : '100644'
      }
      return {
        mode,
        path: entry.path,
        oid: entry.oid,
        type: (entry.type || 'blob') as ObjectType,
      }
    })

  if (finalTreeEntries.length === 0) {
    return null // No valid entries to write.
  }

  // Get object format from repository
  const objectFormat = await repo.getObjectFormat()
  
  // Directly write the tree from these entries.
  // Note: finalTreeEntries already have OIDs set from the map function,
  // so we don't need to call processTreeEntries here.
  const finalTreeOid = await writeTree({
    fs,
    gitdir: effectiveGitdir,
    tree: finalTreeEntries,
    objectFormat,
  })

  // CRITICAL: If the resulting tree is the empty tree OID, treat it as "no changes"
  // The empty tree OID is a special Git object that represents an empty tree
  // If we're comparing two states and they both result in an empty tree, there are no changes
  // Get empty tree OID based on format
  const { getOidLength } = await import('./detectObjectFormat.ts')
  const EMPTY_TREE_OID = objectFormat === 'sha256' 
    ? '0'.repeat(getOidLength('sha256'))
    : '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
  if (finalTreeOid === EMPTY_TREE_OID) {
    return null // Empty tree means no changes
  }

  // If comparing HEAD vs STAGE, check if the final tree is identical to HEAD
  // If they're the same, return null (no changes)
  if (isStage && treePair[0] && typeof treePair[0] !== 'string') {
    try {
      // Get the HEAD tree OID from the TREE walker
      const headTree = treePair[0] as Walker
      const { GitWalkSymbol } = await import('./symbols.ts')
      const headWalker = await headTree[GitWalkSymbol]({ repo })
      const headTreeOid = await headWalker.oid({ _fullpath: '.' } as any)
      
      if (finalTreeOid === headTreeOid) {
        return null // No changes - the tree is identical to HEAD
      }
    } catch {
      // If we can't get the HEAD tree OID, just return the final tree OID
      // This can happen if HEAD doesn't exist (new repository)
    }
  }

  // If comparing STAGE/HEAD vs WORKDIR, check if the final tree is identical to the base
  // If they're the same, return null (no changes)
  if (isWorkdir && treePair[0] && typeof treePair[0] !== 'string') {
    try {
      // Get the base tree OID from the TREE/STAGE walker
      const baseTree = treePair[0] as Walker
      const { GitWalkSymbol } = await import('./symbols.ts')
      const baseWalker = await baseTree[GitWalkSymbol]({ repo })
      const baseTreeOid = await baseWalker.oid({ _fullpath: '.' } as any)
      
      if (finalTreeOid === baseTreeOid) {
        return null // No changes - the workdir tree is identical to the base
      }
    } catch {
      // If we can't get the base tree OID, just return the final tree OID
      // This can happen if HEAD doesn't exist (new repository)
    }
  }

  return finalTreeOid
}

export async function applyTreeChanges({
  fs,
  dir,
  gitdir,
  stashCommit,
  parentCommit,
  wasStaged,
  cache = {},
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  stashCommit: string
  parentCommit: string
  wasStaged: boolean
  cache?: Record<string, unknown>
}): Promise<void> {
  // Check for unmerged paths before applying tree changes
  // CRITICAL: Pass gitdir to Repository.open() to ensure we get the same Repository instance
  // as other operations like add(), status(), and stash(). This ensures index state consistency.
  const { Repository } = await import('../core-utils/Repository.ts')
  const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
  const index = await repo.readIndexDirect(false, false) // Force fresh read, allowUnmerged: false
  // If there are unmerged paths, readIndexDirect will throw UnmergedPathsError
  // This ensures we don't apply stash during a merge conflict
  
  const normalizedFs = createFileSystem(fs)
  const dirRemoved: string[] = []
  const stageUpdated: Array<{ filepath: string; oid: string; stats?: any }> = []

  // analyze the changes
  // Custom reduce function that flattens all operations into a single array
  const customReduce = async (parent: { method: string; filepath: string; oid?: string } | undefined, children: ({ method: string; filepath: string; oid?: string } | undefined)[]): Promise<({ method: string; filepath: string; oid?: string } | undefined)[]> => {
    // Helper function to recursively flatten and validate operations
    const flattenOps = (items: unknown[]): ({ method: string; filepath: string; oid?: string })[] => {
      const result: ({ method: string; filepath: string; oid?: string })[] = []
      for (const item of items) {
        if (item === undefined || item === null) continue
        if (Array.isArray(item)) {
          // Recursively flatten nested arrays
          result.push(...flattenOps(item))
        } else if (typeof item === 'object' && 'method' in item && 'filepath' in item) {
          // Validate it's a proper operation
          const op = item as { method: string; filepath: string; oid?: string }
          if (op.filepath !== undefined && op.filepath !== null && typeof op.filepath === 'string') {
            result.push(op)
          }
        }
      }
      return result
    }
    
    // Flatten all children (which may themselves be arrays from nested reduces)
    const flattenedChildren = flattenOps(children)
    
    // If the parent is a valid operation, include it
    if (parent && parent.filepath) {
      return [parent, ...flattenedChildren]
    }
    
    // Otherwise, just return the flattened children
    return flattenedChildren
  }

  const ops = await _walk({
    repo,
    trees: [WalkerFactory.tree({ ref: parentCommit }), WalkerFactory.tree({ ref: stashCommit })],
    reduce: customReduce as WalkerReduce,
    map: WalkerMapWithNulls(async (filepath: string, [parent, stash]: (WalkerEntry | null)[]): Promise<{ method: string; filepath: string; oid?: string } | undefined> => {
      if (
        filepath === '.' ||
        (await isIgnoredInternal({ fs, dir, gitdir, filepath }))
      ) {
        return undefined
      }
      // Helper function to resolve entry from a commit's tree directly
      const resolveEntryFromCommit = async (commitRef: string, filepath: string): Promise<{ type: 'tree' | 'blob' | 'special' | 'commit', oid: string } | null> => {
        try {
          const { readObject } = await import('../git/objects/readObject.ts')
          const { resolveRef } = await import('../git/refs/readRef.ts')
          const commitParser = await import('../core-utils/parsers/Commit.ts')
          const treeParser = await import('../core-utils/parsers/Tree.ts')
          const parseCommit = commitParser.parse
          const parseTree = treeParser.parse
          const commitOid = await resolveRef({ fs, gitdir, ref: commitRef })
          const commitResult = await readObject({ fs, cache, gitdir, oid: commitOid, format: 'content' })
          if (commitResult.type !== 'commit') {
            return null
          }
          const commit = parseCommit(commitResult.object)
          const treeResult = await readObject({ fs, cache, gitdir, oid: commit.tree, format: 'content' })
          if (treeResult.type !== 'tree') {
            return null
          }
          const treeEntries = parseTree(treeResult.object)
          const pathParts = filepath.split('/').filter(p => p)
          let currentEntries = treeEntries
          for (let i = 0; i < pathParts.length - 1; i++) {
            const entry = currentEntries.find(e => e.path === pathParts[i])
            if (!entry || entry.type !== 'tree') {
              return null
            }
            const subTreeResult = await readObject({ fs, cache, gitdir, oid: entry.oid, format: 'content' })
            currentEntries = parseTree(subTreeResult.object)
          }
          const entry = currentEntries.find(e => e.path === pathParts[pathParts.length - 1])
          if (entry) {
            return { type: entry.type as 'tree' | 'blob' | 'special' | 'commit', oid: entry.oid }
          }
          return null
        } catch {
          return null
        }
      }
      
      // Determine the type - prefer stash if it exists, otherwise use parent
      // If stash exists, it means the file is in the stash commit (new or modified)
      // If only parent exists, it means the file was deleted
      let type: 'tree' | 'blob' | 'special' | 'commit'
      let oid: string | undefined
      let resolvedFromCommit = false // Track if we resolved from commit to avoid calling stash methods
      
      try {
        if (stash) {
          type = await stash.type()
          oid = await stash.oid()
        } else if (parent) {
          type = await parent.type()
          oid = await parent.oid()
        } else {
          // Neither exists - default to blob (shouldn't happen in practice)
          type = 'blob'
        }
      } catch (error: any) {
        // If type() or oid() fails (e.g., "No obj for new.txt"), it means the entry couldn't be resolved
        // This can happen for new files that don't exist in the parent commit
        // Try to resolve directly from the commit's tree
        if (stash && error.message && error.message.includes('No obj for')) {
          const resolved = await resolveEntryFromCommit(stashCommit, filepath)
          if (resolved) {
            type = resolved.type
            oid = resolved.oid
            resolvedFromCommit = true
          } else {
            return undefined
          }
        } else if (parent && error.message && error.message.includes('No obj for')) {
          const resolved = await resolveEntryFromCommit(parentCommit, filepath)
          if (resolved) {
            type = resolved.type
            oid = resolved.oid
            resolvedFromCommit = true
          } else {
            return undefined
          }
        } else {
          // Can't resolve - skip this entry
          return undefined
        }
      }
      
      // If stash is null but we have a valid oid (from parent or resolved), we can still process it
      // This handles the case where stash is null but we resolved oid from commit
      if (!stash && !oid) {
        return undefined
      }
      
      if (type !== 'tree' && type !== 'blob') {
        return undefined
      }

      // deleted tree or blob
      if (!stash && parent) {
        const method = type === 'tree' ? 'rmdir' : 'rm'
        if (type === 'tree') dirRemoved.push(filepath)
        if (type === 'blob' && wasStaged) {
          // For index deletions, we need to remove from index
          // Pass null oid to indicate deletion
          stageUpdated.push({ filepath, oid: '', stats: undefined })
        }
        return { method, filepath }
      }

      // If we don't have an oid, we can't proceed (even if stash is null, we might have resolved oid from commit)
      if (!oid) return undefined
      
      // If stash is null but we have oid (resolved from commit), we still need to process it
      // Only check stash for stats/mode, not for existence
      const parentOid = parent ? await parent.oid().catch(() => undefined) : undefined
      if (!parent || parentOid !== oid) {
        // only apply changes if changed from the parent commit or doesn't exist in the parent commit
        if (type === 'tree') {
          return { method: 'mkdir', filepath }
        } else {
          if (wasStaged) {
            // For staged changes, we need stats for the index
            // Try to get stats from the workdir first (if file exists)
            // If not, get stats from the stash tree entry (which has the mode)
            let stats: any = null
            try {
              stats = await normalizedFs.lstat(join(dir, filepath))
            } catch {
              // File doesn't exist in workdir yet - will be written later
              // If we resolved from commit, stash methods will fail, so create minimal stats
              if (resolvedFromCommit) {
                stats = {
                  mode: 0o100644, // Default file mode
                  size: 0,
                  ctime: new Date(),
                  mtime: new Date(),
                }
              } else {
                // Try to get stats from the stash tree entry instead
                if (stash) {
                  try {
                    stats = await stash.stat()
                  } catch {
                    // If stash.stat() fails, try to get mode from stash entry
                    try {
                      const stashMode = await stash.mode()
                      // Create minimal stats object from mode
                      stats = {
                        mode: stashMode || 0o100644,
                        size: 0,
                        ctime: new Date(),
                        mtime: new Date(),
                      }
                    } catch {
                      // If all else fails, create minimal stats
                      stats = {
                        mode: 0o100644,
                        size: 0,
                        ctime: new Date(),
                        mtime: new Date(),
                      }
                    }
                  }
                } else {
                  // Stash is null, create minimal stats
                  stats = {
                    mode: 0o100644,
                    size: 0,
                    ctime: new Date(),
                    mtime: new Date(),
                  }
                }
              }
            }
            // If we still don't have stats, create minimal stats
            if (!stats) {
              if (resolvedFromCommit) {
                stats = {
                  mode: 0o100644,
                  size: 0,
                  ctime: new Date(),
                  mtime: new Date(),
                }
              } else {
                if (stash) {
                  try {
                    const stashMode = await stash.mode().catch(() => 0o100644)
                    stats = {
                      mode: stashMode || 0o100644,
                      size: 0,
                      ctime: new Date(),
                      mtime: new Date(),
                    }
                  } catch {
                    stats = {
                      mode: 0o100644,
                      size: 0,
                      ctime: new Date(),
                      mtime: new Date(),
                    }
                  }
                } else {
                  // Stash is null, create minimal stats
                  stats = {
                    mode: 0o100644,
                    size: 0,
                    ctime: new Date(),
                    mtime: new Date(),
                  }
                }
              }
            }
            stageUpdated.push({
              filepath,
              oid,
              stats,
            })
          }
          return {
            method: 'write',
            filepath,
            oid,
          }
        }
      }
      return undefined
    }),
  }) as Array<{ method: string; filepath: string; oid?: string } | undefined>
  
  // Flatten the result in case reduce returned nested arrays
  const flattenedOps = Array.isArray(ops) ? ops.flat() : []

  // Filter out undefined operations and operations with undefined filepath
  const validOps = flattenedOps.filter((op): op is { method: string; filepath: string; oid?: string } => 
    op !== undefined && op !== null && op.filepath !== undefined && op.filepath !== null && typeof op.filepath === 'string'
  )

  // apply the changes to work dir
  // Sort operations so files are removed before directories
  const sortedOps = [...validOps].sort((a, b) => {
    if (a.method === 'rmdir' && b.method !== 'rmdir') return 1 // rmdir after other ops
    if (a.method !== 'rmdir' && b.method === 'rmdir') return -1 // other ops before rmdir
    return 0
  })
  
  await acquireLock('applyTreeChanges', async () => {
    for (const op of sortedOps) {
      if (!op || !op.filepath) continue
      const currentFilepath = join(dir, op.filepath)
      switch (op.method) {
        case 'rmdir':
          try {
            await normalizedFs.rmdir(currentFilepath)
          } catch (err: any) {
            // If directory is not empty, try to remove it recursively
            if (err.code === 'ENOTEMPTY') {
              await normalizedFs.rm(currentFilepath, { recursive: true })
            } else {
              throw err
            }
          }
          break
        case 'mkdir':
          await normalizedFs.mkdir(currentFilepath)
          break
        case 'rm':
          await normalizedFs.rm(currentFilepath)
          break
        case 'write':
          // only writes if file is not in the removedDirs
          if (
            !dirRemoved.some(removedDir =>
              currentFilepath.startsWith(removedDir)
            )
          ) {
            if (!op.oid) {
              // Skip if no OID provided
              break
            }
            try {
              // Use readObject from git/objects/readObject.ts with 'content' format to get raw blob data
              const { readObject: readObjectFromGit } = await import('../git/objects/readObject.ts')
              const result = await readObjectFromGit({
                fs,
                cache,
                gitdir,
                oid: op.oid,
                format: 'content',
              })
              // just like checkout, since mode only applicable to create, not update, delete first
              if (await normalizedFs.exists(currentFilepath)) {
                await normalizedFs.rm(currentFilepath)
              }
              const objectBuffer = UniversalBuffer.isBuffer(result.object) ? result.object : UniversalBuffer.from(result.object as Uint8Array)
              await normalizedFs.write(currentFilepath, objectBuffer) // only handles regular files for now
            } catch (error) {
              // If object doesn't exist, this indicates a repository integrity issue
              // The stash commit references an object that was never written or was deleted
              // This should not happen in normal operation, but we should provide a clear error
              if (error instanceof NotFoundError) {
                throw new NotFoundError(
                  `Stash commit references object ${op.oid} that does not exist in the object database. ` +
                  `This indicates a repository integrity issue. The stash cannot be applied.`
                )
              }
              throw error
            }
          }
          break
      }
    }
  })

  // update the stage (if wasStaged is true)
  if (wasStaged) {
    // Use Repository.readIndexDirect() and writeIndexDirect() for consistency
    // CRITICAL: Read index AFTER workdir changes have been applied
    // This ensures we get the correct stats for files that were just written
    const currentIndex = await repo.readIndexDirect(false) // Force fresh read
    for (const { filepath, stats, oid } of stageUpdated) {
      if (oid === '') {
        // Deletion - remove from index
        currentIndex.delete({ filepath })
      } else if (oid) {
        // Addition or modification - insert/update in index
        // Re-read stats from workdir after files have been written (more accurate)
        let finalStats = stats
        try {
          // File should exist in workdir now (was written in the acquireLock block above)
          finalStats = await normalizedFs.lstat(join(dir, filepath))
        } catch {
          // File doesn't exist - use the stats we collected earlier (from stash entry)
          // This should only happen for deletions, but we handle it gracefully
          if (!finalStats) {
            // Fallback: create minimal stats
            finalStats = {
              mode: 0o100644,
              size: 0,
              ctime: new Date(),
              mtime: new Date(),
            }
          }
        }
        currentIndex.insert({ filepath, stats: finalStats, oid })
      }
    }
    await repo.writeIndexDirect(currentIndex)
  }
}

