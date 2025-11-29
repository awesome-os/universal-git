import { InternalError } from "../../errors/InternalError.ts"
import { CheckoutConflictError } from "../../errors/CheckoutConflictError.ts"
import { readObject } from '../objects/readObject.ts'
import { parse as parseTree } from '../../core-utils/parsers/Tree.ts'
import { parse as parseCommit } from '../../core-utils/parsers/Commit.ts'
import { SparseCheckoutManager } from '../../core-utils/filesystem/SparseCheckoutManager.ts'
import { join } from '../../core-utils/GitPath.ts'
// Using src/git/ functions directly for refs, index, and other operations
import { normalizeStats } from "../../utils/normalizeStats.ts"
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"
import type { ProgressCallback } from "../remote/types.ts"

type CheckoutOperation = ['create' | 'update' | 'delete' | 'delete-index' | 'mkdir' | 'conflict' | 'keep', string, ...unknown[]]

/**
 * Analyzes what changes are needed to checkout a tree to the working directory
 */
export const analyzeCheckout = async ({
  fs,
  dir,
  gitdir,
  gitBackend,
  worktreeBackend,
  treeOid,
  filepaths,
  force = false,
  sparsePatterns,
  cache = {},
  index: gitIndex, // NEW: Accept the index object passed from checkout
}: {
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  gitBackend?: import('../../backends/GitBackend.ts').GitBackend
  worktreeBackend?: import('./GitWorktreeBackend.ts').GitWorktreeBackend
  treeOid: string
  filepaths?: string[]
  force?: boolean
  sparsePatterns?: string[]
  cache?: Record<string, unknown>
  index: import('../../git/index/GitIndex.ts').GitIndex // NEW: Index object parameter
}): Promise<CheckoutOperation[]> => {
  // CRITICAL: Use the Repository's fs (which is already normalized) for all file operations
  // This ensures we're using the exact same fs instance that the Repository uses
  // CRITICAL: Always pass both dir and gitdir to prevent createRepository() from calling findRoot
  // which could find the wrong repository (e.g., the workspace repo instead of the test fixture)
  
  // Use provided gitBackend or create GitBackendFs
  let effectiveGitBackend = gitBackend
  if (!effectiveGitBackend && fs && gitdir) {
     const { GitBackendFs } = await import('../../backends/GitBackendFs/index.ts')
     effectiveGitBackend = new GitBackendFs(fs, gitdir)
  }

  // Need gitBackend or gitdir to read objects
  // We prefer effectiveGitBackend
  if (!effectiveGitBackend && !gitdir) {
    throw new Error('analyzeCheckout requires gitBackend OR gitdir to be provided')
  }

  // Validate that we have a way to access the worktree
  let effectiveWorktreeBackend = worktreeBackend
  if (!effectiveWorktreeBackend && fs && dir) {
     const { GitWorktreeFs } = await import('./fs/GitWorktreeFs.ts')
     effectiveWorktreeBackend = new GitWorktreeFs(fs, dir)
  }

  if (!effectiveWorktreeBackend && (!fs || !dir)) {
     throw new Error('analyzeCheckout requires either worktreeBackend OR (fs and dir)')
  }
  
  // Use normalizedFs for file operations
  const normalizedFs = fs ? createFileSystem(fs) : undefined
  
  // Check sparse checkout patterns FIRST (before building tree map for optimization)
  let shouldCheckSparse = false
  let finalSparsePatterns = sparsePatterns
  let coneMode = false
  if (sparsePatterns && sparsePatterns.length > 0) {
    shouldCheckSparse = true
    // Try to detect cone mode from config
    try {
      if (effectiveGitBackend) {
        // Use gitBackend if available
        const cone = await effectiveGitBackend.getConfig('core.sparseCheckoutCone')
        coneMode = cone === 'true' || cone === true
      }
    } catch {
      // Config not available, default to false
    }
  } else {
    // Check if sparse checkout is enabled in config
    try {
      let isEnabled = false
      if (effectiveGitBackend) {
          const configVal = await effectiveGitBackend.getConfig('core.sparseCheckout')
          console.log(`[DEBUG] core.sparseCheckout = ${configVal}`)
          isEnabled = configVal === 'true' || configVal === true
      }

      if (isEnabled) {
          let patterns: string[] = []
          if (effectiveGitBackend && effectiveGitBackend.sparseCheckoutList && effectiveWorktreeBackend) {
             patterns = await effectiveGitBackend.sparseCheckoutList(effectiveWorktreeBackend)
          }

          if (patterns.length > 0) {
            finalSparsePatterns = patterns
            shouldCheckSparse = true
            if (effectiveGitBackend) {
                 const cone = await effectiveGitBackend.getConfig('core.sparseCheckoutCone')
                 coneMode = cone === 'true' || cone === true
            }
          }
      }
    } catch {
      // Sparse checkout not enabled or error checking
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
    // Use gitBackend if available, otherwise use readObject with fs/gitdir
    let treeObject: UniversalBuffer
    if (effectiveGitBackend) {
        const result = await effectiveGitBackend.readObject(treeOid, 'content', cache)
        treeObject = result.object
    } else {
        const result = await readObject({ fs: fs!, cache, gitdir: gitdir!, oid: treeOid })
        treeObject = result.object
    }
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
      
      let workdirExists = false
      try {
        if (worktreeBackend) {
          const stat = await worktreeBackend.lstat(filepath)
          if (stat && !stat.isDirectory()) {
            workdirExists = true
          }
        } else if (normalizedFs && dir) {
          const workdirPath = join(dir, filepath)
          const stat = await normalizedFs.lstat(workdirPath)
          if (stat && !(stat as any).isDirectory()) {
            workdirExists = true
          }
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
          let workdirContent: UniversalBuffer | Uint8Array | string
          if (worktreeBackend) {
            const result = await worktreeBackend.read(filepath)
            workdirContent = result as UniversalBuffer | Uint8Array
          } else if (normalizedFs && dir) {
            const workdirPath = join(dir, filepath)
            workdirContent = await normalizedFs.read(workdirPath) as UniversalBuffer
          } else {
             throw new Error('Missing worktree access')
          }
          
          const { hashObject } = await import('../../core-utils/ShaHasher.ts')
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
      try {
        if (worktreeBackend) {
          await worktreeBackend.lstat(filepath)
          operations.push(['delete', filepath])
        } else if (normalizedFs && dir) {
          const workdirPath = join(dir, filepath)
          await normalizedFs.lstat(workdirPath)
          operations.push(['delete', filepath])
        }
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
  gitBackend,
  worktreeBackend,
  operations,
  cache = {},
  onProgress,
  index: gitIndex, // NEW: Accept the index object passed from checkout
}: {
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  gitBackend?: import('../../backends/GitBackend.ts').GitBackend
  worktreeBackend?: import('./GitWorktreeBackend.ts').GitWorktreeBackend
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
  // CRITICAL: Always pass both dir and gitdir to prevent createRepository() from calling findRoot
  // which could find the wrong repository (e.g., the workspace repo instead of the test fixture)
  
  // gitBackend or gitdir needed for object reading
  // Use provided gitBackend or create GitBackendFs
  let effectiveGitBackend = gitBackend
  if (!effectiveGitBackend && fs && gitdir) {
     const { GitBackendFs } = await import('../../backends/GitBackendFs/index.ts')
     effectiveGitBackend = new GitBackendFs(fs, gitdir)
  }

  if (!effectiveGitBackend && !gitdir) {
      throw new Error('executeCheckout requires gitBackend OR gitdir')
  }

  // Validate that we have a way to access the worktree
  if (!worktreeBackend && (!fs || !dir)) {
     throw new Error('executeCheckout requires either worktreeBackend OR (fs and dir)')
  }

  const normalizedFs = fs ? createFileSystem(fs) : undefined
  
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
      const modeNum = typeof mode === 'string' ? parseInt(mode, 8) : (mode as number)
      
      // Handle submodules (gitlinks) - mode 160000 (0o160000)
      if (modeNum === 0o160000) {
        // Submodules are stored in the index but don't have file content
        // They're represented as directories in the workdir
        // Ensure the submodule directory exists
        if (worktreeBackend) {
            await worktreeBackend.mkdir(filepath)
        } else {
            await normalizedFs!.mkdir(join(dir!, filepath))
        }
        
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
        // Use gitBackend if available
        let blobObject: UniversalBuffer
        if (effectiveGitBackend) {
             const result = await effectiveGitBackend.readObject(oid as string, 'content', cache)
             blobObject = result.object
        } else {
             const result = await readObject({ fs: fs!, cache, gitdir: gitdir!, oid: oid as string })
             blobObject = result.object
        }

        // Apply LFS smudge filter if needed (converts pointer files to actual content)
        let fileContent = blobObject as UniversalBuffer
        try {
          const { applySmudgeFilter } = await import('../../git/lfs/filter.ts')
          // We need a backend to pass to applySmudgeFilter. If we have one, use it.
          // effectiveGitBackend is guaranteed if we have backend or fs/gitdir
          if (effectiveGitBackend) {
              fileContent = await applySmudgeFilter({
                fs: normalizedFs,
                dir,
                gitdir: gitdir!, // gitdir is required for LFS
                filepath: filepath as string,
                blobContent: blobObject as UniversalBuffer,
                backend: effectiveGitBackend as any,
              })
          }
        } catch (err) {
          // If LFS filter fails, use original content (allows repo to work without LFS objects)
          // This is expected behavior when LFS objects haven't been downloaded yet
        }

        // Ensure directory exists
        const dirPath = filepath.includes('/') ? filepath.substring(0, filepath.lastIndexOf('/')) : ''
        if (dirPath) {
          if (worktreeBackend) {
              await worktreeBackend.mkdir(dirPath)
          } else {
              await normalizedFs!.mkdir(join(dir!, dirPath))
          }
        }

        // Write the file
        if (modeNum === 0o100644) {
          if (worktreeBackend) {
              await worktreeBackend.write(filepath, fileContent)
          } else {
              await normalizedFs!.write(join(dir!, filepath), fileContent)
          }
        } else if (modeNum === 0o100755) {
          if (worktreeBackend) {
              await worktreeBackend.write(filepath, fileContent, { mode: 0o777 })
          } else {
              await normalizedFs!.write(join(dir!, filepath), fileContent, { mode: 0o777 })
          }
        } else if (modeNum === 0o120000) {
          // Handle symlinks
          // We assume worktreeBackend handles symlinks or we might skip special handling if it doesn't expose writelink
          // For normalizedFs (direct fs), we handle it explicitly.
          // If worktreeBackend is GitWorktreeFs, it uses fs.
          
          if (worktreeBackend) {
              // worktreeBackend.write usually handles content. For symlinks, content is target path.
              // If worktreeBackend supports symlinks properly (via mode), it should handle it.
              // But GitWorktreeBackend interface just has write.
              // If underlying fs supports symlinks, backend implementation should handle it based on mode?
              // Or we need explicit symlink support in interface?
              // Assuming write() with content as target is what we do for now if no dedicated method.
              // But strictly speaking, symlinks need `symlink` syscall.
              // If worktreeBackend is opaque, we trust it.
              await worktreeBackend.write(filepath, fileContent)
          } else {
              // ... existing symlink logic using normalizedFs ...
              // For brevity in this refactor, let's keep the existing logic for fs case
              // and assume worktreeBackend is smart or we fall back to normalizedFs if worktreeBackend is actually wrapping fs?
              // But we might not have normalizedFs if worktreeBackend is remote/db.
              
              // Simplification: just write content for now if worktreeBackend.
              // TODO: Add symlink support to WorktreeBackend interface?
              
              const fullPath = join(dir!, filepath)
              // ... copy existing complex logic ...
              try {
                const exists = await normalizedFs!.exists(fullPath)
                if (exists) {
                   try {
                     await normalizedFs!.unlink(fullPath)
                   } catch {}
                }
                await (normalizedFs as any).writelink?.(fullPath, fileContent)
              } catch (e) {
                 // fallback to write if writelink fails or not supported
                 await normalizedFs!.write(fullPath, fileContent)
              }
          }
        }

        // Add the entry to our new, clean index
        let stats: any
        if (worktreeBackend) {
            stats = await worktreeBackend.lstat(filepath)
        } else {
            stats = await normalizedFs!.lstat(join(dir!, filepath))
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
      }
    } else if (op[0] === 'keep') {
      // File is already correct - add it to our new index
      // Read stats from the workdir file to ensure they're current
      const [, , oid] = op
      try {
        let stats: any
        if (worktreeBackend) {
            stats = await worktreeBackend.lstat(filepath)
        } else {
            stats = await normalizedFs!.lstat(join(dir!, filepath))
        }
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
        try {
          if (worktreeBackend) {
              await worktreeBackend.remove(filepath)
          } else {
              await normalizedFs!.rm(join(dir!, filepath))
          }
        } catch {
          // File might not exist
        }
        if (onProgress) {
          await onProgress({ phase: 'Updating workdir', loaded: ++count, total })
        }
      }
    } else if (op[0] === 'mkdir') {
      if (worktreeBackend) {
          await worktreeBackend.mkdir(filepath)
      } else {
          await normalizedFs!.mkdir(join(dir!, filepath))
      }
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
  repo: import('../../core-utils/Repository.ts').Repository
  filepath: string
}): Promise<string> => {
  // worktreeBackend is required for file operations
  if (!repo.worktreeBackend) {
    throw new Error('Cannot get file status in bare repository')
  }
  const worktreeBackend = repo.worktreeBackend
  
  // gitBackend is required for object operations
  if (!repo.gitBackend) {
    throw new Error('gitBackend is required')
  }
  const gitBackend = repo.gitBackend
  
  const cache = repo.cache

  // Get HEAD tree
  let headTreeOid: string | null = null
  try {
    // Use repo.resolveRef() to ensure we use the same gitdir as checkout
    const headOid = await repo.resolveRef('HEAD')
    const commitResult = await gitBackend.readObject(headOid, 'content', cache)
    const commit = parseCommit(commitResult.object as UniversalBuffer | string)
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
      const treeResult = await gitBackend.readObject(headTreeOid, 'content', cache)
      const treeEntries = parseTree(treeResult.object as UniversalBuffer)
      const rootEntry = treeEntries.find(e => e.path === filepath)
      if (rootEntry) {
        headOid = rootEntry.oid
      } else {
        // File not in root, use resolveFilepath to search recursively
        const { resolveFilepath } = await import('../../utils/resolveFilepath.ts')
        // resolveFilepath needs gitBackend
        // resolveFilepath returns the OID directly, not an object
        // Pass minimal fs/gitdir if backend doesn't support direct path resolution (not used if gitBackend is passed)
        headOid = await resolveFilepath({ 
            cache, 
            oid: headTreeOid, 
            filepath,
            gitBackend,
            fs: (gitBackend as any).getFs?.(), // Fallback if backend exposes fs
            gitdir: await repo.getGitdir(), // Fallback
        })
      }
    } catch (err) {
      // File doesn't exist in HEAD tree
      headOid = null
    }
  }

  // CRITICAL: Get the index directly from gitBackend
  // This ensures we see the same index state that was modified by add()
  const { GitIndex } = await import('../../git/index/GitIndex.ts')
  
  let indexBuffer: UniversalBuffer
  try {
    indexBuffer = await gitBackend.readIndex()
  } catch {
    indexBuffer = UniversalBuffer.alloc(0)
  }
  
  let index: GitIndex
  if (indexBuffer.length === 0) {
    index = new GitIndex()
  } else {
    const objectFormat = await gitBackend.getObjectFormat(cache)
    index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
  }
  
  const indexEntry = index.entriesMap.get(filepath)
  const indexOid: string | null = indexEntry ? indexEntry.oid : null

  // Get file from working directory using worktreeBackend
  let workdirExists = false
  let workdirOid: string | null = null
  try {
    await worktreeBackend.lstat(filepath)
    workdirExists = true
    const content = await worktreeBackend.read(filepath)
    const { hashObject } = await import('../../core-utils/ShaHasher.ts')
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
  gitBackend,
  worktreeBackend,
  treeOid,
  filepaths,
  force = false,
  sparsePatterns,
  cache = {},
  onProgress,
  index,
}: {
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  gitBackend?: import('../../backends/GitBackend.ts').GitBackend
  worktreeBackend?: import('./GitWorktreeBackend.ts').GitWorktreeBackend
  treeOid: string
  filepaths?: string[]
  force?: boolean
  sparsePatterns?: string[]
  cache?: Record<string, unknown>
  onProgress?: ProgressCallback
  index?: import('../../git/index/GitIndex.ts').GitIndex
}): Promise<void> => {
  // CRITICAL: Use Repository to get a consistent context and access to the index.
  // Read the index ONCE and pass it to both analyzeCheckout and executeCheckout.
  // This ensures both functions operate on the same index object, and changes made
  // by executeCheckout are persisted when we write it back.
  // CRITICAL: Always pass both dir and gitdir to prevent createRepository() from calling findRoot
  // which could find the wrong repository (e.g., the workspace repo instead of the test fixture)
  
  // Need gitBackend or gitdir
  if (!gitBackend && !gitdir) {
      throw new Error('checkout requires gitBackend OR gitdir')
  }

  // Need worktreeBackend or fs/dir
  if (!worktreeBackend && (!fs || !dir)) {
      throw new Error('checkout requires worktreeBackend OR (fs and dir)')
  }
  
  // Use provided gitBackend or create GitBackendFs
  let effectiveGitBackend = gitBackend
  if (!effectiveGitBackend) {
     if (fs && gitdir) {
        const { GitBackendFs } = await import('../../backends/GitBackendFs/index.ts')
        effectiveGitBackend = new GitBackendFs(fs, gitdir)
     } else {
        throw new Error('checkout requires gitBackend OR (fs and gitdir)')
     }
  }
  
  const { GitIndex } = await import('../../git/index/GitIndex.ts')
  const { detectObjectFormat } = await import('../../utils/detectObjectFormat.ts')
  
  let gitIndex: import('../../git/index/GitIndex.ts').GitIndex

  if (index) {
    gitIndex = index
  } else {
    let indexBuffer: UniversalBuffer
    try {
        indexBuffer = await effectiveGitBackend.readIndex()
    } catch {
        indexBuffer = UniversalBuffer.alloc(0)
    }
    
    if (indexBuffer.length === 0) {
        gitIndex = new GitIndex()
    } else {
        // We don't have repo.cache, so pass undefined or a new object
        // Use gitBackend for object format detection if possible
        const objectFormat = await effectiveGitBackend.getObjectFormat(cache)
        gitIndex = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
  }
  
  // Analyze the checkout. Pass the live index object to it.
  const operations = await analyzeCheckout({ 
    fs, 
    dir, 
    gitdir, 
    gitBackend: effectiveGitBackend,
    worktreeBackend,
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
    gitdir, 
    gitBackend: effectiveGitBackend,
    worktreeBackend,
    operations, 
    index: gitIndex, // Pass the live index object
    cache, 
    onProgress,
  })
  
  // Write the modified index back to disk.
  const indexObjectFormat = await effectiveGitBackend.getObjectFormat(cache)
  const buffer = await gitIndex.toBuffer(indexObjectFormat)
  await effectiveGitBackend.writeIndex(buffer)
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

