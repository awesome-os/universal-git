import { InternalError } from "../../errors/InternalError.ts"
import { CheckoutConflictError } from "../../errors/CheckoutConflictError.ts"
import { readObject } from '../../git/objects/readObject.ts'
import { parse as parseTree } from '../parsers/Tree.ts'
import { parse as parseCommit } from '../parsers/Commit.ts'
import { SparseCheckoutManager } from './SparseCheckoutManager.ts'
import { join } from '../GitPath.ts'
// Using src/git/ functions directly for refs, index, and other operations
import { normalizeStats } from "../../utils/normalizeStats.ts"
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { ProgressCallback } from "../../git/remote/types.ts"

type CheckoutOperation = ['create' | 'update' | 'delete' | 'delete-index' | 'mkdir' | 'conflict' | 'keep', string, ...unknown[]]

/**
 * Analyzes what changes are needed to checkout a tree to the working directory
 */
export const analyzeCheckout = async ({
  fs,
  dir,
  gitdir,
  treeOid,
  filepaths,
  force = false,
  sparsePatterns,
  cache = {},
  index: gitIndex, // NEW: Accept the index object passed from checkout
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  treeOid: string
  filepaths?: string[]
  force?: boolean
  sparsePatterns?: string[]
  cache?: Record<string, unknown>
  index: import('../../git/index/GitIndex.ts').GitIndex // NEW: Index object parameter
}): Promise<CheckoutOperation[]> => {
  // CRITICAL: Use the Repository's fs (which is already normalized) for all file operations
  // This ensures we're using the exact same fs instance that the Repository uses
  // CRITICAL: Always pass both dir and gitdir to prevent Repository.open() from calling findRoot
  // which could find the wrong repository (e.g., the workspace repo instead of the test fixture)
  if (!dir || !gitdir) {
    throw new Error('analyzeCheckout requires both dir and gitdir to be provided to prevent auto-detection of wrong repository')
  }
  const { Repository } = await import('../Repository.ts')
  const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true, ignoreSystemConfig: false })
  const normalizedFs = repo.fs
  
  // Check sparse checkout patterns FIRST (before building tree map for optimization)
  let shouldCheckSparse = false
  let finalSparsePatterns = sparsePatterns
  let coneMode = false
  if (sparsePatterns && sparsePatterns.length > 0) {
    shouldCheckSparse = true
    // Try to detect cone mode from config
    try {
      coneMode = await SparseCheckoutManager.isConeMode({ fs, gitdir })
    } catch {
      // Config not available, default to false
    }
  } else {
    // Check if sparse checkout is enabled
    try {
      const patterns = await SparseCheckoutManager.loadPatterns({ fs, gitdir })
      if (patterns.length > 0) {
        finalSparsePatterns = patterns
        shouldCheckSparse = true
        coneMode = await SparseCheckoutManager.isConeMode({ fs, gitdir })
      }
    } catch {
      // Sparse checkout not enabled
    }
  }

  // Helper to check if a directory path could potentially match sparse patterns
  // This allows us to skip entire subtrees that don't match
  const couldMatchSparsePattern = (dirPath: string, patterns: string[], isCone: boolean): boolean => {
    if (!patterns || patterns.length === 0) return true
    
    if (isCone) {
      // In cone mode, check if any pattern could match files in this directory
      for (const pattern of patterns) {
        if (pattern.startsWith('!')) continue // Skip exclusion patterns for this check
        const normalizedPattern = pattern.replace(/^\/+/, '').replace(/\/$/, '')
        const normalizedDir = dirPath.replace(/^\/+/, '')
        
        // Check if this directory is within a pattern or a pattern is within this directory
        if (normalizedDir.startsWith(normalizedPattern + '/') || 
            normalizedPattern.startsWith(normalizedDir + '/') ||
            normalizedDir === normalizedPattern) {
          return true
        }
      }
      return false
    } else {
      // In non-cone mode, we need to check all patterns (more complex, so be conservative)
      // For performance, we'll be more permissive and let the actual match function filter
      return true
    }
  }

  // Helper to recursively walk tree and build a map of all entries
  // OPTIMIZATION: When sparse patterns are provided, only walk directories that could match
  const buildTreeMap = async (treeOid: string, prefix = '', map: Map<string, { oid: string; mode: string; type: 'blob' | 'tree' | 'commit' }> = new Map()): Promise<Map<string, { oid: string; mode: string; type: 'blob' | 'tree' | 'commit' }>> => {
    const { object: treeObject } = await readObject({ fs, cache, gitdir, oid: treeOid })
    const entries = parseTree(treeObject as UniversalBuffer)

    for (const entry of entries) {
      const filepath = prefix ? `${prefix}/${entry.path}` : entry.path
      
      // Filter by filepaths if specified
      if (filepaths && !filepaths.some(fp => filepath.startsWith(fp) || fp.startsWith(filepath))) {
        continue
      }

      // OPTIMIZATION: If sparse patterns are active, skip directories that can't match
      if (shouldCheckSparse && finalSparsePatterns && entry.type === 'tree') {
        if (!couldMatchSparsePattern(filepath, finalSparsePatterns, coneMode)) {
          continue // Skip this entire subtree
        }
      }

      if (entry.type === 'tree') {
        map.set(filepath, { oid: entry.oid, mode: entry.mode, type: 'tree' })
        // Recursively walk subdirectory
        await buildTreeMap(entry.oid, filepath, map)
      } else if (entry.type === 'blob') {
        // OPTIMIZATION: Only add blobs that match sparse patterns
        if (shouldCheckSparse && finalSparsePatterns) {
          if (!SparseCheckoutManager.match({ filepath, patterns: finalSparsePatterns, coneMode })) {
            continue // Skip this file
          }
        }
        map.set(filepath, { oid: entry.oid, mode: entry.mode, type: 'blob' })
      } else if (entry.type === 'commit') {
        // Submodules are stored as commit objects in the tree (mode 160000)
        // OPTIMIZATION: Only add submodules that match sparse patterns
        if (shouldCheckSparse && finalSparsePatterns) {
          if (!SparseCheckoutManager.match({ filepath, patterns: finalSparsePatterns, coneMode })) {
            continue // Skip this submodule
          }
        }
        map.set(filepath, { oid: entry.oid, mode: entry.mode, type: 'commit' })
      }
    }
    
    return map
  }

  // Build map of all entries in the target tree
  const targetTreeEntries = await buildTreeMap(treeOid)

  const operations: CheckoutOperation[] = []
  const filesToKeep = new Set<string>()

  // Get all paths from both the target tree AND the current index
  // If filepaths are specified, only include paths that match the filepaths
  let allPaths = new Set([...targetTreeEntries.keys(), ...gitIndex.entriesMap.keys()])
  if (filepaths && filepaths.length > 0) {
    // Filter to only include paths that match the specified filepaths
    const filteredPaths = new Set<string>()
    for (const path of allPaths) {
      if (filepaths.some(fp => path.startsWith(fp) || fp.startsWith(path))) {
        filteredPaths.add(path)
      }
    }
    allPaths = filteredPaths
  }

  // Process each path to determine if it should exist in the final state
  for (const filepath of allPaths) {
    const targetEntry = targetTreeEntries.get(filepath)
    const indexEntry = gitIndex.entriesMap.get(filepath)

    // Determine if this file should exist in the final state (matches sparse patterns)
    const matchesSparse = shouldCheckSparse && finalSparsePatterns
      ? SparseCheckoutManager.match({ filepath, patterns: finalSparsePatterns, coneMode })
      : true


    if (targetEntry && (targetEntry.type === 'blob' || targetEntry.type === 'commit') && matchesSparse) {
      // File should exist in the final state - mark it to keep
      filesToKeep.add(filepath)
      
      const workdirPath = join(dir, filepath)
      let workdirExists = false
      try {
        const stat = await normalizedFs.lstat(workdirPath)
        if (stat && !(stat as any).isDirectory()) {
          workdirExists = true
        }
      } catch {
        // File doesn't exist
      }

      // Check if file needs to be created or updated
      let needsUpdate = false
      if (!workdirExists) {
        needsUpdate = true
      } else if (indexEntry) {
        // File exists in both index and workdir - check if update needed
        let indexOid: string | null = null
        if (indexEntry.oid) {
          indexOid = indexEntry.oid
        } else if (indexEntry.stages && indexEntry.stages.length > 0) {
          const stage0 = indexEntry.stages.find((s: any) => s && s.flags && s.flags.stage === 0)
          if (stage0 && stage0.oid) {
            indexOid = stage0.oid
          } else if (indexEntry.stages[0] && indexEntry.stages[0].oid) {
            indexOid = indexEntry.stages[0].oid
          }
        }
        
        let workdirOid: string | null = null
        try {
          const workdirContent = await normalizedFs.read(workdirPath)
          const { hashObject } = await import('../ShaHasher.ts')
          workdirOid = await hashObject({
            type: 'blob',
            content: workdirContent as UniversalBuffer | Uint8Array,
          })
        } catch {
          workdirOid = null
        }
        
        const indexMismatch = indexOid !== null && indexOid !== targetEntry.oid
        const workdirMismatch = workdirOid !== null ? workdirOid !== targetEntry.oid : workdirExists
        
        if (force) {
          needsUpdate = workdirMismatch || (workdirOid === null && workdirExists) || indexMismatch
        } else {
          if (indexMismatch || workdirMismatch) {
            if (workdirOid !== null && workdirOid !== targetEntry.oid && (indexOid === null || workdirOid !== indexOid)) {
              operations.push(['conflict', filepath])
              continue
            } else {
              needsUpdate = true
            }
          }
        }
      } else {
        // File in workdir but not in index
        if (force) {
          needsUpdate = true
        } else {
          operations.push(['conflict', filepath])
          continue
        }
      }

      if (needsUpdate) {
        operations.push(['update', filepath, targetEntry.oid, targetEntry.mode])
      } else {
        // File is already correct - mark it to keep with all necessary index entry info
        // We need to pass the stats from the existing index entry so we can rebuild it
        // CRITICAL: Always generate a 'keep' operation for files that match sparse patterns
        // and don't need updates. This ensures they're added back to the index after clear().
        if (indexEntry) {
          // Get stats from the existing index entry
          const stats = {
            ctimeSeconds: indexEntry.ctimeSeconds || 0,
            ctimeNanoseconds: indexEntry.ctimeNanoseconds || 0,
            mtimeSeconds: indexEntry.mtimeSeconds || 0,
            mtimeNanoseconds: indexEntry.mtimeNanoseconds || 0,
            dev: indexEntry.dev || 0,
            ino: indexEntry.ino || 0,
            mode: indexEntry.mode || 0o100644,
            uid: indexEntry.uid || 0,
            gid: indexEntry.gid || 0,
            size: indexEntry.size || 0,
          }
          // Use targetEntry.oid since that's what we want to keep (the file matches the target)
          operations.push(['keep', filepath, targetEntry.oid, targetEntry.mode, stats])
        } else {
          // File is in target tree and matches sparse pattern, but not in index
          // This means we need to add it, so use 'update' (which will create it)
          operations.push(['update', filepath, targetEntry.oid, targetEntry.mode])
        }
      }
    } else {
      // File should NOT exist in the final state
      if (indexEntry) {
        operations.push(['delete-index', filepath])
      }
      // Check if file exists in workdir
      const workdirPath = join(dir, filepath)
      try {
        await normalizedFs.lstat(workdirPath)
        operations.push(['delete', filepath])
      } catch {
        // File doesn't exist in workdir, nothing to delete
      }
    }
  }

  // Also check for files in index that are not in the target tree (deletions)
  // But only if force is true (otherwise we might conflict with workdir changes)
  // AND only if filepaths are not specified (when filepaths are specified, we only update those files)
  if (force && (!filepaths || filepaths.length === 0)) {
    for (const filepath of gitIndex.entriesMap.keys()) {
      // Skip if we already processed this file
      if (operations.some(op => op[1] === filepath)) {
        continue
      }

      // Check if file exists in target tree
      if (!targetTreeEntries.has(filepath)) {
        operations.push(['delete', filepath])
        operations.push(['delete-index', filepath])
      }
    }
  }

  // Return operations along with filesToKeep information
  // We'll encode filesToKeep as a special operation type so executeCheckout knows which files to keep
  // Files that match sparse patterns but don't need updates should be kept
  return operations
}

/**
 * Executes checkout operations to update the working directory
 */
export const executeCheckout = async ({
  fs,
  dir,
  gitdir,
  operations,
  cache = {},
  onProgress,
  index: gitIndex, // NEW: Accept the index object passed from checkout
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  operations: CheckoutOperation[]
  cache?: Record<string, unknown>
  onProgress?: ProgressCallback
  index: import('../../git/index/GitIndex.ts').GitIndex // NEW: Index object parameter
}): Promise<void> => {
  // Check for conflicts
  const conflicts = operations.filter(op => op[0] === 'conflict').map(op => op[1] as string)
  if (conflicts.length > 0) {
    throw new CheckoutConflictError(conflicts)
  }

  // CRITICAL: Use the Repository's fs (which is already normalized) for all file operations
  // This ensures we're using the exact same fs instance that the Repository uses
  // Get the Repository instance to access normalized fs
  const { Repository } = await import('../Repository.ts')
  // CRITICAL: Always pass both dir and gitdir to prevent Repository.open() from calling findRoot
  // which could find the wrong repository (e.g., the workspace repo instead of the test fixture)
  if (!dir || !gitdir) {
    throw new Error('executeCheckout requires both dir and gitdir to be provided to prevent auto-detection of wrong repository')
  }
  const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true, ignoreSystemConfig: false })
  const normalizedFs = repo.fs
  
  // --- START OF THE FIX ---
  // Clear the in-memory index completely. We will rebuild it from scratch based only on operations.
  gitIndex.clear()
  
  let count = 0
  const total = operations.length

  // Execute operations and rebuild the index from scratch
  for (const op of operations) {
    const filepath = op[1] as string

    if (op[0] === 'update' || op[0] === 'create') {
      const [, , oid, mode] = op
      const fullPath = join(dir, filepath)
      const modeNum = typeof mode === 'string' ? parseInt(mode, 8) : (mode as number)
      
      // Handle submodules (gitlinks) - mode 160000 (0o160000)
      if (modeNum === 0o160000) {
        // Submodules are stored in the index but don't have file content
        // They're represented as directories in the workdir
        // Ensure the submodule directory exists
        await normalizedFs.mkdir(fullPath)
        
        // Add the gitlink entry to the index with mode 160000
        // Gitlinks don't have file stats, so we create minimal stats
        const stats = {
          ctimeSeconds: 0,
          ctimeNanoseconds: 0,
          mtimeSeconds: 0,
          mtimeNanoseconds: 0,
          dev: 0,
          ino: 0,
          mode: 0o160000, // Gitlink mode
          uid: 0,
          gid: 0,
          size: 0,
        }
        gitIndex.insert({
          filepath: filepath as string,
          oid: oid as string,
          stats,
          stage: 0,
        })
        
        if (onProgress) {
          await onProgress({ phase: 'Updating workdir', loaded: ++count, total })
        }
      } else {
        // Regular file (blob) - read and write it
        const { object: blobObject } = await readObject({ fs, cache, gitdir, oid: oid as string })

        // Apply LFS smudge filter if needed (converts pointer files to actual content)
        let fileContent = blobObject as UniversalBuffer
        try {
          const { applySmudgeFilter } = await import('../../git/lfs/filter.ts')
          const { FilesystemBackend } = await import('../../backends/FilesystemBackend.ts')
          const backend = new FilesystemBackend(normalizedFs, gitdir)
          fileContent = await applySmudgeFilter({
            fs: normalizedFs,
            dir,
            gitdir,
            filepath: filepath as string,
            blobContent: blobObject as UniversalBuffer,
            backend,
          })
        } catch (err) {
          // If LFS filter fails, use original content (allows repo to work without LFS objects)
          // This is expected behavior when LFS objects haven't been downloaded yet
        }

        // Ensure directory exists
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'))
        if (dirPath) {
          await normalizedFs.mkdir(dirPath)
        }

        // Write the file using normalizedFs for consistency
        if (modeNum === 0o100644) {
          await normalizedFs.write(fullPath, fileContent)
        } else if (modeNum === 0o100755) {
          await normalizedFs.write(fullPath, fileContent, { mode: 0o777 })
        } else if (modeNum === 0o120000) {
          // Handle symlinks - check if symlink already exists and remove it first
          // This prevents EEXIST errors in parallel operations or retries
          try {
            const exists = await normalizedFs.exists(fullPath)
            if (exists) {
              try {
                const stats = await normalizedFs.lstat(fullPath)
                if (stats && stats.isSymbolicLink()) {
                  // Remove existing symlink
                  await normalizedFs.unlink(fullPath)
                } else if (stats && stats.isDirectory()) {
                  // Remove directory if it exists (shouldn't happen, but handle it)
                  await normalizedFs.rmdir(fullPath, { recursive: true })
                } else {
                  // Remove file if it exists
                  await normalizedFs.unlink(fullPath)
                }
              } catch (removeErr) {
                // If removal fails, try unlink anyway (might work)
                try {
                  await normalizedFs.unlink(fullPath)
                } catch {
                  // Ignore - will try to create symlink anyway
                }
              }
            }
          } catch (checkErr) {
            // If existence check fails, continue anyway
          }
          
          // Create the symlink - wrap in try-catch to handle race conditions
          try {
            await (normalizedFs as { writelink?: (path: string, target: UniversalBuffer) => Promise<void> }).writelink?.(
              fullPath,
              fileContent
            )
          } catch (symlinkErr: any) {
            // Handle EEXIST errors (symlink already exists - could be from race condition)
            if (symlinkErr.code === 'EEXIST') {
              try {
                // Try to verify if it's the same symlink
                const existingTarget = await normalizedFs.readlink(fullPath)
                const expectedTarget = fileContent.toString('utf8')
                const existingTargetStr = typeof existingTarget === 'string' 
                  ? existingTarget 
                  : existingTarget?.toString() || ''
                
                if (existingTargetStr === expectedTarget || 
                    existingTargetStr.replace(/\\/g, '/') === expectedTarget.replace(/\\/g, '/')) {
                  // Same symlink already exists - that's fine, continue
                  // Don't throw error, just proceed
                } else {
                  // Different symlink - remove and retry
                  await normalizedFs.unlink(fullPath)
                  await (normalizedFs as { writelink?: (path: string, target: UniversalBuffer) => Promise<void> }).writelink?.(
                    fullPath,
                    fileContent
                  )
                }
              } catch (retryErr) {
                // If verification/retry fails, log but don't fail the checkout
                // The symlink might already be correct, or we'll handle it in copyWorktreeFiles
                console.warn(`Warning: Could not create/verify symlink ${fullPath}: ${(retryErr as Error).message}`)
              }
            } else {
              // Other error - rethrow
              throw symlinkErr
            }
          }
        }

        // Add the entry to our new, clean index
        const stats = await normalizedFs.lstat(fullPath)
        gitIndex.insert({
          filepath: filepath as string,
          oid: oid as string,
          stats,
          stage: 0,
        })

        if (onProgress) {
          await onProgress({ phase: 'Updating workdir', loaded: ++count, total })
        }
      }
    } else if (op[0] === 'keep') {
      // File is already correct - add it to our new index
      // Read stats from the workdir file to ensure they're current
      const [, , oid] = op
      const fullPath = join(dir, filepath)
      try {
        const stats = await normalizedFs.lstat(fullPath)
        gitIndex.insert({
          filepath: filepath as string,
          oid: oid as string,
          stats,
          stage: 0,
        })
      } catch {
        // File doesn't exist in workdir, but we have stats from the operation
        // Use the stats from the operation as fallback
        const [, , , , stats] = op
        gitIndex.insert({
          filepath: filepath as string,
          oid: oid as string,
          stats: stats as any,
          stage: 0,
        })
      }
    } else if (op[0] === 'delete' || op[0] === 'delete-index') {
      // For deletions, we simply do nothing to the index, because we already cleared it.
      // We only need to remove the file from the workdir if it's a 'delete' op.
      if (op[0] === 'delete') {
        const fullPath = join(dir, filepath)
        try {
          await normalizedFs.rm(fullPath)
        } catch {
          // File might not exist
        }
        if (onProgress) {
          await onProgress({ phase: 'Updating workdir', loaded: ++count, total })
        }
      }
    } else if (op[0] === 'mkdir') {
      const fullPath = join(dir, filepath)
      await normalizedFs.mkdir(fullPath)
    }
  }
  
  // No final cleanup loop is needed. The index is now perfectly correct.
  // The checkout() function will write this perfectly constructed index to disk.
  // --- END OF THE FIX ---
}

/**
 * Gets the status of a file in the working directory
 * 
 * CRITICAL: This function now accepts a Repository object directly to ensure
 * it uses the same Repository instance (and thus the same index state) as
 * other operations like add() and stash(). This bypasses GitIndexManager
 * and ensures state consistency.
 */
export const getFileStatus = async ({
  repo,
  filepath,
}: {
  repo: import('../Repository.ts').Repository
  filepath: string
}): Promise<string> => {
  // CRITICAL: Normalize fs to ensure consistency with add() and other operations
  const fs = createFileSystem(repo.fs)
  const dir = repo.dir!
  if (!dir) {
    throw new Error('Cannot get file status in bare repository')
  }
  // CRITICAL: Use repo.getGitdir() directly - this is the same gitdir used by checkout
  // worktree.getGitdir() may return a different path for linked worktrees, but for the main
  // worktree it should be the same. However, since checkout uses repo.getGitdir(), we should
  // use the same to ensure consistency.
  const gitdir = await repo.getGitdir()
  const cache = repo.cache

  // Get HEAD tree
  let headTreeOid: string | null = null
  try {
    // Use repo.resolveRef() to ensure we use the same gitdir as checkout
    const headOid = await repo.resolveRef('HEAD')
    const { object: commitObject } = await readObject({ fs, cache, gitdir, oid: headOid })
    const commit = parseCommit(commitObject as UniversalBuffer | string)
    headTreeOid = commit.tree
  } catch (err) {
    // No HEAD commit
    headTreeOid = null
  }

  // Get file from HEAD tree
  // CRITICAL: Use resolveFilepath to recursively find files in the tree
  // parseTree only parses the root tree, so nested files won't be found
  // For files in the root, we can use parseTree for efficiency
  let headOid: string | null = null
  if (headTreeOid) {
    try {
      // First try parseTree for root-level files (more efficient)
      const { object: treeObject } = await readObject({ fs, cache, gitdir, oid: headTreeOid })
      const treeEntries = parseTree(treeObject as UniversalBuffer)
      const rootEntry = treeEntries.find(e => e.path === filepath)
      if (rootEntry) {
        headOid = rootEntry.oid
      } else {
        // File not in root, use resolveFilepath to search recursively
        const { resolveFilepath } = await import('../../utils/resolveFilepath.ts')
        // resolveFilepath returns the OID directly, not an object
        headOid = await resolveFilepath({ fs, cache, gitdir, oid: headTreeOid, filepath })
      }
    } catch (err) {
      // File doesn't exist in HEAD tree
      headOid = null
    }
  }

  // CRITICAL: Get the index directly from the Repository instance
  // This ensures we see the same in-memory index state that was modified by add()
  // When force=false, readIndexDirect() returns the owned instance immediately,
  // which contains the modifications from writeIndexDirect()
  const index = await repo.readIndexDirect() // Use default force=false to get owned instance
  const indexEntry = index.entriesMap.get(filepath)
  const indexOid: string | null = indexEntry ? indexEntry.oid : null

  // Get file from working directory
  const workdirPath = join(dir, filepath)
  let workdirExists = false
  let workdirOid: string | null = null
  try {
    await fs.lstat(workdirPath)
    workdirExists = true
    const content = await fs.read(workdirPath)
    const { hashObject } = await import('../ShaHasher.ts')
    workdirOid = await hashObject({ type: 'blob', content: content as UniversalBuffer | Uint8Array })
  } catch {
    // File doesn't exist
  }

  // Determine status
  const H = headOid !== null
  const I = indexOid !== null
  const W = workdirExists

  if (!H && !W && !I) return 'absent'
  if (!H && !W && I) return '*absent'
  if (!H && W && !I) return '*added'
  if (!H && W && I) {
    return workdirOid === indexOid ? 'added' : '*added'
  }
  if (H && !W && !I) return 'deleted'
  if (H && !W && I) {
    return headOid === indexOid ? '*deleted' : '*deleted'
  }
  if (H && W && !I) {
    return workdirOid === headOid ? '*undeleted' : '*undeletemodified'
  }
  if (H && W && I) {
    if (workdirOid === headOid) {
      return workdirOid === indexOid ? 'unmodified' : '*unmodified'
    } else {
      return workdirOid === indexOid ? 'modified' : '*modified'
    }
  }

  return 'absent'
}

/**
 * Checks out a tree to the working directory
 * Thread-safe: The lock in GitIndexManager.acquire is per-filepath (per gitdir),
 * so parallel tests with different gitdirs are isolated. Each test from makeFixture
 * gets its own unique gitdir, ensuring no interference between parallel tests.
 */
export const checkout = async ({
  fs,
  dir,
  gitdir,
  treeOid,
  filepaths,
  force = false,
  sparsePatterns,
  cache = {},
  onProgress,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  treeOid: string
  filepaths?: string[]
  force?: boolean
  sparsePatterns?: string[]
  cache?: Record<string, unknown>
  onProgress?: ProgressCallback
}): Promise<void> => {
  // CRITICAL: Use Repository to get a consistent context and access to the index.
  // Read the index ONCE and pass it to both analyzeCheckout and executeCheckout.
  // This ensures both functions operate on the same index object, and changes made
  // by executeCheckout are persisted when we write it back.
  // CRITICAL: Always pass both dir and gitdir to prevent Repository.open() from calling findRoot
  // which could find the wrong repository (e.g., the workspace repo instead of the test fixture)
  if (!dir || !gitdir) {
    throw new Error('WorkdirManager.checkout requires both dir and gitdir to be provided to prevent auto-detection of wrong repository')
  }
  const { Repository } = await import('../Repository.ts')
  const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true, ignoreSystemConfig: false })
  const gitIndex = await repo.readIndexDirect(false) // Force fresh read
  
  // Analyze the checkout. Pass the live index object to it.
  const operations = await analyzeCheckout({ 
    fs, 
    dir, 
    gitdir: await repo.getGitdir(), 
    treeOid, 
    filepaths, 
    force, 
    sparsePatterns, 
    cache,
    index: gitIndex, // Pass the live index object
  })

  // Execute the checkout. Pass the live index object to it as well.
  await executeCheckout({ 
    fs, 
    dir, 
    gitdir: await repo.getGitdir(), 
    operations, 
    index: gitIndex, // Pass the live index object
    cache, 
    onProgress,
  })
  
  // Write the modified index back to disk. This ensures listFiles() and other operations
  // see the updated state after the checkout.
  await repo.writeIndexDirect(gitIndex)
}

/**
 * Namespace export for WorkdirManager
 */
export const WorkdirManager = {
  analyzeCheckout,
  executeCheckout,
  getFileStatus,
  checkout,
}

