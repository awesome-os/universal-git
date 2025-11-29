import { readTree } from './readTree.ts'
import { Repository } from "../core-utils/Repository.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { hashObject } from '../core-utils/ShaHasher.ts'
// Merge state files are now handled via GitBackend.deleteStateFile
import type { TreeEntry } from '../models/GitTree.ts'
import { getIndexEntryStage } from '../utils/indexHelpers.ts'
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

/**
 * Helper for controlled concurrency - processes items in parallel with a limit
 * This prevents EMFILE errors and file locking issues on Windows
 */
async function pMap<T>(
  array: T[],
  mapper: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  const queue = [...array]
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item !== undefined) {
        await mapper(item)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, array.length) }, worker))
}

/**
 * Abort a merge in progress.
 *
 * Based on the behavior of git reset --merge, i.e.  "Resets the index and updates the files in the working tree that are different between <commit> and HEAD, but keeps those which are different between the index and working tree (i.e. which have changes which have not been added). If a file that is different between <commit> and the index has unstaged changes, reset is aborted."
 *
 * Essentially, abortMerge will reset any files affected by merge conflicts to their last known good version at HEAD.
 * Any unstaged changes are saved and any staged changes are reset as well.
 *
 * NOTE: The behavior of this command differs slightly from canonical git in that an error will be thrown if a file exists in the index and nowhere else.
 * Canonical git will reset the file and continue aborting the merge in this case.
 *
 * **WARNING:** Running git merge with non-trivial uncommitted changes is discouraged: while possible, it may leave you in a state that is hard to back out of in the case of a conflict.
 * If there were uncommitted changes when the merge started (and especially if those changes were further modified after the merge was started), `git.abortMerge` will in some cases be unable to reconstruct the original (pre-merge) changes.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.commit='HEAD'] - commit to reset the index and worktree to, defaults to HEAD
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<void>} Resolves successfully once the git index has been updated
 *
 */
export async function abortMerge({
  repo: _repo,
  commit = 'HEAD',
  cache = {},
}: {
  repo: Repository
  commit?: string
  cache?: Record<string, unknown>
}): Promise<void> {
  const DEBUG = process.env.DEBUG_ABORT_MERGE === 'true'
  const log = DEBUG ? console.log.bind(console, '[abortMerge]') : () => {}
  
  try {
    log('Starting abortMerge')
    
    if (!_repo) {
      throw new MissingParameterError('repo')
    }
    
    const repo = _repo
    const worktreeBackend = repo.worktreeBackend
    const gitBackend = repo.gitBackend
    const effectiveCache = repo.cache || cache
    
    // abortMerge requires a worktree backend
    if (!worktreeBackend) {
      throw new MissingParameterError('worktreeBackend (Repository must have a worktree backend for abortMerge)')
    }
    
    if (!gitBackend) {
      throw new MissingParameterError('gitBackend (Repository must have a GitBackend for abortMerge)')
    }
    
    const effectiveGitdir = await repo.getGitdir()
    log('abortMerge initialized', { effectiveGitdir })

    // 2. Load HEAD tree and Index in PARALLEL for better performance
    log('Resolving HEAD and reading Index in parallel...')
    const [headTree, index] = await Promise.all([
      (async () => {
        // Use Repository.resolveRef() instead of low-level resolveRef
        const HEAD_oid = await repo.resolveRef(commit)
        log('HEAD resolved:', HEAD_oid)
        const { tree } = await readTree({ repo, oid: HEAD_oid })
        return tree
      })(),
      (async () => {
        if (!repo.gitBackend) {
          throw new Error('gitBackend is required for abortMerge')
        }
        const { GitIndex } = await import('../git/index/GitIndex.ts')
        const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
        const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
        
        let indexBuffer: UniversalBuffer
        try {
          indexBuffer = await repo.gitBackend.readIndex()
        } catch {
          indexBuffer = UniversalBuffer.alloc(0)
        }
        
        // Use gitBackend.getObjectFormat instead of detectObjectFormat with fs
        const objectFormat = await repo.gitBackend.getObjectFormat(repo.cache)
        if (indexBuffer.length === 0) {
          return new GitIndex(null, undefined, 2)
        } else {
          return await GitIndex.fromBuffer(indexBuffer, objectFormat)
        }
      })()
    ])
    
    log('HEAD tree read, entries:', headTree.length)
    const headTreeEntries = new Map<string, TreeEntry>()
    for (const entry of headTree) {
      if (entry.type === 'blob') {
        headTreeEntries.set(entry.path, entry)
      }
    }
    log('HEAD tree entries (blobs):', headTreeEntries.size)
    log('Index read, entries:', index.entries.length, 'unmerged:', index.unmergedPaths.length)
    const unmergedPaths = new Set(index.unmergedPaths)
    
    // Build index entries map (only stage 0 entries, or use the first stage for unmerged)
    const indexEntries = new Map<string, { oid: string; mode: number; stats?: any }>()
    for (const entry of index.entries) {
      const stage = getIndexEntryStage(entry)
      if (stage === 0 || (stage !== 0 && !indexEntries.has(entry.path))) {
        indexEntries.set(entry.path, {
          oid: entry.oid,
          mode: entry.mode,
          // Note: IndexEntry doesn't have a stat property by default
          // stats will be populated from filesystem when needed
        })
      }
    }

    // 3. Compute workdir OIDs ONLY for files that are in index or HEAD
    // OPTIMIZATION: Process in parallel batches of 20 to avoid EMFILE errors
    const workdirOids = new Map<string, string>()
    const allRelevantPaths = Array.from(new Set([...headTreeEntries.keys(), ...indexEntries.keys()]))
    
    log(`Checking workdir OIDs for ${allRelevantPaths.length} files (parallel, concurrency: 20)...`)
    log(`  allRelevantPaths: ${JSON.stringify(allRelevantPaths)}`)
    let processedCount = 0
    await pMap(allRelevantPaths, async (filepath) => {
      processedCount++
      log(`  [${processedCount}/${allRelevantPaths.length}] Processing ${filepath}...`)
      try {
        log(`    Calling worktreeBackend.stat(${filepath})...`)
        const stat = await worktreeBackend.stat(filepath)
        log(`    stat returned: ${stat ? `isDir=${stat.isDirectory()}` : 'null'}`)
        if (stat && !stat.isDirectory()) {
          log(`    Reading file content...`)
          const content = await worktreeBackend.read(filepath)
          log(`    Content read, length: ${content ? (typeof content === 'string' ? content.length : (content instanceof Uint8Array ? content.length : (content as any).length || 0)) : 0}`)
          log(`    Hashing content...`)
          const contentBuffer = UniversalBuffer.isBuffer(content) ? content : (typeof content === 'string' ? UniversalBuffer.from(content, 'utf8') : UniversalBuffer.from(content))
          const oid = await hashObject({ type: 'blob', content: contentBuffer })
          log(`    Hash computed: ${oid}`)
          workdirOids.set(filepath, oid)
          log(`  [${processedCount}/${allRelevantPaths.length}] Workdir OID for ${filepath}: ${oid}`)
        } else {
          log(`  [${processedCount}/${allRelevantPaths.length}] ${filepath} is a directory, skipping`)
        }
      } catch (err) {
        // File doesn't exist in workdir, that's okay
        log(`  [${processedCount}/${allRelevantPaths.length}] ${filepath} not found in workdir: ${(err as Error).message}`)
      }
      log(`  [${processedCount}/${allRelevantPaths.length}] Completed ${filepath}`)
    }, 20)
    log(`Finished checking workdir OIDs, found ${workdirOids.size} files`)

    // 4. Determine which files to reset (the core logic)
    const operations: Array<{ op: 'update' | 'delete', path: string, oid?: string, mode?: string }> = []
    const newIndexEntries = new Map<string, { oid: string; mode: number; stats?: any }>()

    log('Processing HEAD files to restore workdir...')
    // Git's abortMerge behavior: 
    // - If unmerged: restore to HEAD
    // - If index differs from HEAD (merge modified it): restore to HEAD
    // - If index matches HEAD but workdir differs: preserve workdir (unstaged changes)
    // - If file not in index: preserve workdir (not part of merge)
    let filesToUpdate = 0
    let filesToKeep = 0
    for (const [filepath, headEntry] of headTreeEntries.entries()) {
      const indexEntry = indexEntries.get(filepath)
      const workdirOid = workdirOids.get(filepath)
      const isUnmerged = unmergedPaths.has(filepath)
      const indexOid = indexEntry?.oid

      // Determine if we should restore from HEAD
      // Git's abortMerge behavior (git reset --merge):
      // - If unmerged: ALWAYS restore to HEAD (conflict state)
      // - If index differs from HEAD (merge modified it): restore to HEAD
      // - If index matches HEAD but workdir differs: preserve workdir (unstaged changes)
      // - If file not in index: preserve workdir (not part of merge)
      const wasPartOfMerge = indexEntry !== undefined
      const indexMatchesHead = indexOid === headEntry.oid
      const fileIsMissing = !workdirOid
      
      // CRITICAL: Always restore unmerged files (they're in conflict state)
      // For other files, restore if:
      // 1. File was part of merge AND index differs from HEAD (merge modified it)
      // 2. File was part of merge AND file is missing from workdir (was deleted)
      // Preserve if:
      // 1. File was NOT part of merge (not in index) - preserve workdir
      // 2. File was part of merge BUT index matches HEAD AND workdir exists (unstaged changes) - preserve workdir
      const shouldRestore = isUnmerged || (wasPartOfMerge && (!indexMatchesHead || fileIsMissing))

      if (shouldRestore) {
        filesToUpdate++
        log(`  Will update: ${filepath} (part of merge: ${wasPartOfMerge}, unmerged: ${isUnmerged}, workdirOid: ${workdirOid}, headOid: ${headEntry.oid})`)
        operations.push({ op: 'update', path: filepath, oid: headEntry.oid, mode: headEntry.mode })
        // Stats will be read later during index update to avoid blocking here
        newIndexEntries.set(filepath, {
          oid: headEntry.oid,
          mode: parseInt(headEntry.mode, 8),
          stats: undefined, // Will be filled later
        })
      } else {
        // Preserve workdir - index matches HEAD and workdir differs (unstaged changes), or file not in index
        filesToKeep++
        if (indexEntry === undefined) {
          log(`  Will keep (not in index, preserving workdir): ${filepath}`)
        } else {
          log(`  Will keep (index matches HEAD, preserving workdir changes): ${filepath}`)
        }
        newIndexEntries.set(filepath, {
          oid: headEntry.oid,
          mode: parseInt(headEntry.mode, 8),
          stats: indexEntry?.stats, // Use existing stats if available, will be updated later if needed
        })
      }
    }

    log(`Files to update: ${filesToUpdate}, files to keep: ${filesToKeep}`)
    
    // Then handle files in index but not in HEAD (should be removed)
    log('Processing files in index but not in HEAD...')
    let filesToDelete = 0
    for (const [filepath, indexEntry] of indexEntries.entries()) {
      if (!headTreeEntries.has(filepath)) {
        log(`  Will delete: ${filepath}`)
        filesToDelete++
        operations.push({ op: 'delete', path: filepath })
        // Don't add to newIndexEntries (removes from index)
      }
    }
    log(`Files to delete: ${filesToDelete}`)

    // 5. Also handle files that exist in index but not in HEAD or workdir
    // These need to be removed
    for (const [filepath, indexEntry] of indexEntries.entries()) {
      if (!headTreeEntries.has(filepath) && !workdirOids.has(filepath)) {
        operations.push({ op: 'delete', path: filepath })
        // Don't add to newIndexEntries (removes from index)
      }
    }

    // 5.5. Handle files that exist in workdir but not in HEAD
    // CRITICAL: Only delete files that were part of the merge (in index but not in HEAD)
    // Files that exist in workdir but not in index were added after merge started and should be preserved
    // This matches git's behavior: "keeps those which are different between the index and working tree"
    log('Scanning workdir for files to delete...')
    async function listWorkdirFiles(relativePath: string = ''): Promise<string[]> {
      const files: string[] = []
      try {
        const entries = await worktreeBackend.readdir(relativePath || '.')
        if (!entries) return files
        for (const entry of entries) {
          // Skip .git directory
          if (entry === '.git') continue
          
          const entryPath = relativePath ? `${relativePath}/${entry}` : entry
          try {
            const stat = await worktreeBackend.stat(entryPath)
            if (stat && stat.isDirectory()) {
              // Recursively list files in subdirectory
              const subFiles = await listWorkdirFiles(entryPath)
              files.push(...subFiles)
            } else if (stat && !stat.isDirectory()) {
              // It's a file
              files.push(entryPath)
            }
          } catch {
            // Skip entries we can't stat
          }
        }
      } catch {
        // Directory doesn't exist or can't be read, return empty array
      }
      return files
    }
    
    try {
      const workdirFiles = await listWorkdirFiles()
      log(`Workdir files found: ${workdirFiles.length}`)
      
      // Only delete files that are in the index but not in HEAD
      // These are files that were added by the merge and should be removed
      // Files that exist in workdir but not in index were added after merge and should be kept
      let extraFilesToDelete = 0
      for (const filepath of workdirFiles || []) {
        if (!headTreeEntries.has(filepath) && indexEntries.has(filepath)) {
          // File is in index (part of merge) but not in HEAD - should be deleted
          // Only delete if it's not already in operations (to avoid duplicates)
          const alreadyInOps = operations.some(op => op.path === filepath && op.op === 'delete')
          if (!alreadyInOps) {
            log(`  Will delete file from merge: ${filepath}`)
            extraFilesToDelete++
            operations.push({ op: 'delete', path: filepath })
          }
        }
        // Files that exist in workdir but not in index and not in HEAD are preserved
        // (they were added after merge started)
      }
      log(`Extra files to delete: ${extraFilesToDelete}`)
    } catch (err) {
      log('Error scanning workdir:', err)
      // If listing fails, continue without deleting extra files
      // This is a best-effort cleanup
    }

    // 6. Execute operations on workdir
    // OPTIMIZATION: Process operations in parallel batches of 20
    log(`Executing ${operations.length} operations on workdir (parallel, concurrency: 20)...`)
    log(`  Operations: ${JSON.stringify(operations.map(op => ({ op: op.op, path: op.path })))}`)
    let opCount = 0
    await pMap(operations, async (op) => {
      opCount++
      log(`  [${opCount}/${operations.length}] Executing ${op.op} on ${op.path}...`)
      const relativePath = op.path // op.path is already relative to worktree root
      log(`    relativePath: ${relativePath}`)
      
      if (op.op === 'update') {
        log(`    Reading object ${op.oid}...`)
        // Use gitBackend.readObject instead of readObject with fs
        const result = await gitBackend.readObject(op.oid!, 'content', effectiveCache)
        const object = result.object
        log(`    Object read, size: ${object ? (object instanceof Uint8Array ? object.length : (object as any).length || 'unknown') : 0}`)
        const modeNum = parseInt(op.mode!, 8)
        log(`    Mode: ${op.mode} (${modeNum.toString(8)})`)
        
        // Ensure directory exists using worktreeBackend
        const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/'))
        if (dirPath) {
          try {
            log(`    Creating directory: ${dirPath}`)
            await worktreeBackend.mkdir(dirPath)
            log(`    Directory created`)
          } catch (err) {
            // Directory might already exist, that's okay
            log(`    Directory creation skipped (may already exist): ${(err as Error).message}`)
          }
        }

        const blobBuffer = UniversalBuffer.isBuffer(object) ? object : UniversalBuffer.from(object)
        log(`    Writing file...`)
        
        if (modeNum === 0o100755) {
          await worktreeBackend.write(relativePath, blobBuffer, { mode: 0o777 })
        } else if (modeNum === 0o120000) {
          // Symlink - convert blob to string target
          const target = blobBuffer.toString('utf8').trim()
          await worktreeBackend.writelink(relativePath, target)
        } else {
          await worktreeBackend.write(relativePath, blobBuffer)
        }
        log(`    File written successfully`)
      } else if (op.op === 'delete') {
        try {
          log(`    Deleting file...`)
          await worktreeBackend.remove(relativePath)
          log(`    File deleted successfully`)
        } catch (err) {
          // File might not exist in workdir, that's okay
          log(`    File deletion skipped (may not exist): ${(err as Error).message}`)
        }
      }
      log(`  [${opCount}/${operations.length}] Completed ${op.op} on ${op.path}`)
    }, 20)
    log(`Finished executing operations`)
    
    log('Operations executed')

    // 7. Update the index
    log('Updating index...')
    if (!repo.gitBackend) {
      throw new Error('gitBackend is required for abortMerge')
    }
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    let indexBuffer: UniversalBuffer
    try {
      indexBuffer = await repo.gitBackend.readIndex()
    } catch {
      indexBuffer = UniversalBuffer.alloc(0)
    }
    
    let finalIndex: GitIndex
    // Use gitBackend.getObjectFormat instead of detectObjectFormat with fs
    const objectFormat = await repo.gitBackend.getObjectFormat(repo.cache)
    if (indexBuffer.length === 0) {
      finalIndex = new GitIndex(null, undefined, 2)
    } else {
      finalIndex = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
    
    // Delete all existing entries
    const allIndexPaths = Array.from(finalIndex.entriesMap.keys())
    for (const filepath of allIndexPaths) {
      finalIndex.delete({ filepath })
    }
    
    // OPTIMIZATION: Parallel stat for index entries
    log('Stating files for index update (parallel, concurrency: 20)...')
    const entriesToInsert = Array.from(newIndexEntries.entries())
    
    await pMap(entriesToInsert, async ([filepath, entry]) => {
      if (!entry.stats) {
        try {
          entry.stats = await worktreeBackend.stat(filepath)
        } catch {
          // File might not exist if update failed, that's okay
        }
      }
    }, 20)
    
    // Insert into index (must be sequential for index object)
    for (const [filepath, entry] of entriesToInsert) {
      if (entry.stats) {
        finalIndex.insert({
          filepath,
          oid: entry.oid,
          stats: entry.stats,
          stage: 0,
        })
      }
    }

    log('Writing index...')
    await repo.writeIndexDirect(finalIndex)
    log('Index written')

    // 8. Clean up merge state files (for native git interoperability)
    // Use effectiveGitdir (already obtained from repo.getGitdir())
    log('Cleaning up merge state files...')
    await Promise.all([
      deleteMergeHead({ fs, gitdir: effectiveGitdir }),
      deleteMergeMode({ fs, gitdir: effectiveGitdir }),
      deleteMergeMsg({ fs, gitdir: effectiveGitdir }),
    ])
    log('abortMerge completed successfully')

  } catch (err) {
    log('abortMerge error:', err)
    ;(err as { caller?: string }).caller = 'git.abortMerge'
    throw err
  }
}

