/**
 * Multi-Worker Sparse Checkout Coordinator
 * 
 * Parallelizes sparse checkout operations using multiple workers.
 * Splits work by subdirectories and distributes across worker pool.
 */

import type { FileSystemProvider } from '../models/FileSystem.ts'
import type { ProgressCallback } from '../git/remote/GitRemoteHTTP.ts'
import { createProgressEvent } from '../utils/progressHelpers.ts'
import { WorkerPool } from './WorkerPool.ts'
import type { Transport } from '../transport/index.ts'
import { Repository } from '../core-utils/Repository.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import type { RawFileSystemProvider } from '../models/FileSystem.ts'
import { join } from '../core-utils/GitPath.ts'
import { parse as parseTree } from '../core-utils/parsers/Tree.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import { SparseCheckoutManager } from '../core-utils/filesystem/SparseCheckoutManager.ts'
import { readCommit } from '../commands/readCommit.ts'
import { readObject } from '../git/objects/readObject.ts'
import type { CheckoutSubdirectoriesResult } from './Proxies.ts'

export interface MultiWorkerSparseCheckoutOptions {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  sparsePath?: string | string[] // Optional - if not provided, performs full checkout
  ref: string
  cache?: Record<string, unknown>
  onProgress?: ProgressCallback
  cone?: boolean
}

export interface SubdirectoryTask {
  path: string
  treeOid: string
  files: Array<{ path: string; oid: string; mode: string }>
}

/**
 * Multi-worker sparse checkout coordinator
 * Splits work across multiple workers for parallel execution
 */
export class MultiWorkerSparseCheckout {
  private workerPool: WorkerPool
  private transport: Transport
  
  constructor(workerPool: WorkerPool, transport: Transport) {
    this.workerPool = workerPool
    this.transport = transport
  }
  
  /**
   * Execute sparse checkout with multiple workers
   */
  async execute(options: MultiWorkerSparseCheckoutOptions): Promise<void> {
    const { fs: originalFs, dir, gitdir, sparsePath, ref, cache = {}, onProgress, cone = true } = options
    
    // Debug: Log start
    const debugLog = (message: string) => {
      console.log(`[MultiWorkerSparseCheckout] ${message}`)
      if (onProgress) {
        try {
          const result = onProgress(createProgressEvent(message, 0, 0))
          // Only call .catch() if result is a Promise
          if (result && typeof result.catch === 'function') {
            result.catch(() => {}) // Ignore errors in progress callback
          }
        } catch {
          // Ignore errors in progress callback
        }
      }
    }
    
    const maxWorkers = this.workerPool.getMaxWorkers()
    debugLog(`Starting multi-worker checkout with ${maxWorkers} workers`)
    
    // Step 1: Setup repository
    // Extract raw FileSystemProvider from FileSystem instance if needed
    // FileSystem instances have _original_unwrapped_fs property
    let rawFileSystemProvider: RawFileSystemProvider
    if (originalFs && typeof originalFs === 'object' && '_original_unwrapped_fs' in originalFs) {
      // It's a FileSystem instance, extract the raw client
      rawFileSystemProvider = (originalFs as any)._original_unwrapped_fs || originalFs
    } else {
      // It's already a raw FileSystemProvider
      rawFileSystemProvider = originalFs as unknown as RawFileSystemProvider
    }
    
    // normalizedFs is the FileSystem wrapper used locally
    const normalizedFs = createFileSystem(rawFileSystemProvider)
    const repo = await Repository.open({ 
      fs: normalizedFs, 
      dir, 
      gitdir, 
      cache,
      autoDetectConfig: true 
    })
    
    // Resolve ref to commit
    const commitOid = await repo.resolveRef(ref)
    const commit = await readCommit({ 
      repo,
      fs: normalizedFs, 
      dir, 
      gitdir, 
      oid: commitOid,
      cache 
    })
    
    debugLog(`Resolved commit: ${commitOid}`)
    
    // Step 2: Determine if this is sparse or full checkout
    const isSparseCheckout = !!sparsePath
    let sparsePatterns: string[] = []
    let allTasks: SubdirectoryTask[] = []
    
    if (isSparseCheckout) {
      // Sparse checkout mode
      const sparsePaths = Array.isArray(sparsePath) ? sparsePath : [sparsePath]
      debugLog(`Sparse checkout mode - paths: ${sparsePaths.join(', ')}`)
      
      // Load sparse checkout patterns if they exist
      try {
        let patterns: string[] = []
        if (repo.gitBackend && repo.worktreeBackend) {
             patterns = await repo.gitBackend.sparseCheckoutList(repo.worktreeBackend)
        } else if (repo.gitBackend) {
             // Try to use a temp worktree backend if possible or just skip?
             // But MultiWorkerSparseCheckout has dir.
             // We can assume repo has worktreeBackend if opened with dir?
             // Repository.open creates worktreeBackend if dir provided.
             if (repo.worktreeBackend) {
                patterns = await repo.gitBackend.sparseCheckoutList(repo.worktreeBackend)
             }
        }
        
        if (patterns.length > 0) {
          sparsePatterns.push(...patterns)
          debugLog(`Loaded ${patterns.length} sparse patterns from config`)
        }
      } catch {
        // No sparse patterns file, use sparsePath directly
      }
      
      // If no patterns loaded, create from sparsePaths
      if (sparsePatterns.length === 0) {
        sparsePatterns.push(...sparsePaths.map(sp => sp.endsWith('/') ? sp : `${sp}/`))
        debugLog(`Using sparse paths as patterns: ${sparsePatterns.join(', ')}`)
      }
      
      // Discover subdirectories and files for each sparse path
      debugLog('Discovering subdirectories and files for sparse checkout...')
      for (const sp of sparsePaths) {
        const tasks = await this.discoverSubdirectories(repo, commit.commit.tree, sp, sparsePatterns, cone, normalizedFs, dir, gitdir, cache)
        allTasks.push(...tasks)
        debugLog(`Found ${tasks.length} subdirectories for ${sp} (${tasks.reduce((sum, t) => sum + t.files.length, 0)} files)`)
      }
    } else {
      // Full checkout mode - discover all subdirectories
      debugLog('Full checkout mode - discovering all subdirectories...')
      allTasks = await this.discoverSubdirectories(repo, commit.commit.tree, '', [], false, normalizedFs, dir, gitdir, cache) // Empty sparse path = full checkout
      debugLog(`Found ${allTasks.length} subdirectories (${allTasks.reduce((sum, t) => sum + t.files.length, 0)} files)`)
    }
    
    if (allTasks.length === 0) {
      debugLog('No files to checkout')
      return
    }
    
    const totalFiles = allTasks.reduce((sum, task) => sum + task.files.length, 0)
    debugLog(`Total: ${allTasks.length} subdirectories, ${totalFiles} files to process`)
    
    // Step 3: Distribute tasks across workers
    debugLog(`Distributing ${allTasks.length} tasks across ${maxWorkers} workers`)
    const workerTasks = this.distributeTasks(allTasks, maxWorkers)
    debugLog(`Distributed tasks across ${workerTasks.length} workers: ${workerTasks.map((t, i) => `W${i+1}: ${t.length} subdirs`).join(', ')}`)
    
    // Step 5: Process tasks in parallel
    let totalProcessed = 0
    const allErrors: Array<{ path: string; error: string }> = []
    
    debugLog(`Starting parallel processing with ${workerTasks.length} workers...`)
    const startTime = Date.now()
    
    const checkoutPromises = workerTasks.map(async (tasks, workerIndex) => {
      const workerId = `worker-${workerIndex}`
      debugLog(`Worker ${workerId}: Acquiring worker from pool...`)
      const worker = await this.workerPool.acquire()
      debugLog(`Worker ${workerId}: Acquired, processing ${tasks.length} subdirectories (${tasks.reduce((sum, t) => sum + t.files.length, 0)} files)`)
      
      try {
        // Get worker API
        debugLog(`Worker ${workerId}: Getting worker API...`)
        const workerAPI = await worker.getAPI()
        debugLog(`Worker ${workerId}: Got worker API, calling checkoutSubdirectories with ${tasks.length} tasks...`)
        const workerStartTime = Date.now()
        
        // Call worker method with timeout to detect hangs
        const result = await Promise.race([
          workerAPI.checkoutSubdirectories({
            // fs is not passed - workers use their own Node.js fs module
            // cache is not passed - workers use their own cache (cache may contain non-serializable values)
            dir,
            gitdir,
            tasks,
            cache: {}, // Pass empty cache - workers will populate their own
            workerId,
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Worker call timeout after 60 seconds')), 60000)
          )
        ])
        const workerDuration = Date.now() - workerStartTime
        
        debugLog(`Worker ${workerId}: Completed in ${workerDuration}ms (${result.processedFiles} files, ${result.processedDirectories} dirs)`)
        
        // Aggregate progress
        if (onProgress && result.processedFiles) {
          totalProcessed += result.processedFiles
          await onProgress(createProgressEvent(
            `Processed ${totalProcessed}/${totalFiles} files (${workerTasks.length} workers)`,
            totalProcessed,
            totalFiles
          ))
        }
        
        // Collect errors
        if (result.errors) {
          allErrors.push(...result.errors)
          debugLog(`Worker ${workerId}: ${result.errors.length} errors encountered`)
        }
        
        return result
      } catch (error) {
        // Collect worker errors
        const errorMsg = (error as Error).message
        const errorStack = (error as Error).stack
        debugLog(`Worker ${workerId}: ERROR - ${errorMsg}`)
        if (errorStack) {
          debugLog(`Worker ${workerId}: Stack - ${errorStack}`)
        }
        allErrors.push({
          path: workerId,
          error: errorMsg,
        })
        // Don't throw - collect error and continue with other workers
        return {
          processedFiles: 0,
          processedDirectories: 0,
          errors: [{ path: workerId, error: errorMsg }],
        }
      } finally {
        debugLog(`Worker ${workerId}: Releasing worker back to pool`)
        this.workerPool.release(worker)
      }
    })
    
    // Step 6: Wait for all workers to complete
    debugLog(`Waiting for ${checkoutPromises.length} workers to complete...`)
    const results = await Promise.allSettled(checkoutPromises)
    debugLog(`All ${results.length} workers finished (${results.filter(r => r.status === 'fulfilled').length} succeeded, ${results.filter(r => r.status === 'rejected').length} failed)`)
    
    // Extract results and handle rejections
    const fulfilledResults = results
      .filter((r): r is PromiseFulfilledResult<CheckoutSubdirectoriesResult> => r.status === 'fulfilled')
      .map(r => r.value)
    
    // Handle rejected promises
    const rejectedResults = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => {
        const errorMsg = r.reason?.message || String(r.reason)
        debugLog(`Worker failed: ${errorMsg}`)
        allErrors.push({ path: 'unknown', error: errorMsg })
        return {
          processedFiles: 0,
          processedDirectories: 0,
          errors: [{ path: 'unknown', error: errorMsg }],
        }
      })
    
    const allResults = [...fulfilledResults, ...rejectedResults]
    
    const totalDuration = Date.now() - startTime
    debugLog(`All workers completed in ${totalDuration}ms`)
    
    // Step 7: Merge index entries from all workers
    debugLog('Merging index entries from all workers...')
    const allIndexEntries: Array<{
      filepath: string
      oid: string
      stats: unknown
      stage: number
    }> = []
    
    for (const result of allResults) {
      if ('indexEntries' in result && result.indexEntries) {
        allIndexEntries.push(...result.indexEntries)
      }
    }
    
    debugLog(`Merging ${allIndexEntries.length} index entries`)
    
    // Step 8: Write merged index
    if (allIndexEntries.length > 0) {
      const { GitIndex } = await import('../git/index/GitIndex.ts')
      const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
      
      let indexBuffer: UniversalBuffer
      if (repo.gitBackend) {
        try {
          indexBuffer = await repo.gitBackend.readIndex()
        } catch {
          indexBuffer = UniversalBuffer.alloc(0)
        }
      } else {
        throw new Error('gitBackend is required')
      }
      
      let gitIndex: GitIndex
      if (indexBuffer.length === 0) {
        gitIndex = new GitIndex()
      } else {
        const objectFormat = await detectObjectFormat(fs, gitdir, repo.cache, repo.gitBackend)
        gitIndex = await GitIndex.fromBuffer(indexBuffer, objectFormat)
      }
      
      for (const entry of allIndexEntries) {
        gitIndex.insert({
          filepath: entry.filepath,
          oid: entry.oid,
          stats: entry.stats as any,
          stage: entry.stage,
        })
      }
      await repo.writeIndexDirect(gitIndex)
      debugLog(`Index written with ${allIndexEntries.length} entries`)
    }
    
    // Step 9: Report errors if any
    if (allErrors.length > 0) {
      const errorMessages = allErrors.map(e => `${e.path}: ${e.error}`).join('; ')
      debugLog(`Completed with ${allErrors.length} errors`)
      throw new Error(`Multi-worker checkout completed with errors: ${errorMessages}`)
    }
    
    debugLog(`Multi-worker checkout completed successfully (${totalFiles} files processed by ${workerTasks.length} workers)`)
  }
  
  /**
   * Discover subdirectories within sparse path (or all subdirectories for full checkout)
   * Returns list of subdirectory tasks with their files
   */
  private async discoverSubdirectories(
    repo: Repository,
    rootTreeOid: string,
    sparsePath: string,
    sparsePatterns: string[],
    coneMode: boolean,
    fs: ReturnType<typeof createFileSystem>,
    dir: string,
    gitdir: string,
    cache: Record<string, unknown>
  ): Promise<SubdirectoryTask[]> {
    const tasks: SubdirectoryTask[] = []
    const normalizedSparsePath = sparsePath ? sparsePath.replace(/^\/+|\/+$/g, '') : ''
    
    // Walk the tree to find all subdirectories and files
    await this.walkTreeForSubdirs(
      repo,
      rootTreeOid,
      normalizedSparsePath,
      sparsePatterns,
      tasks,
      '',
      coneMode,
      fs,
      dir,
      gitdir,
      cache
    )
    
    return tasks
  }
  
  /**
   * Walk tree to discover subdirectories and files
   */
  private async walkTreeForSubdirs(
    repo: Repository,
    treeOid: string,
    sparsePath: string,
    sparsePatterns: string[],
    tasks: SubdirectoryTask[],
    currentPath: string = '',
    coneMode: boolean,
    fs: ReturnType<typeof createFileSystem>,
    dir: string,
    gitdir: string,
    cache: Record<string, unknown>
  ): Promise<void> {
    const { object: treeObject } = await readObject({ fs, gitdir, oid: treeOid, cache })
    const entries = parseTree(treeObject as UniversalBuffer)
    
    const currentTask: SubdirectoryTask = {
      path: currentPath || sparsePath || '',
      treeOid,
      files: [],
    }
    
    // Determine if we should filter by sparse patterns
    const shouldFilter = sparsePatterns.length > 0
    
    for (const entry of entries) {
      const entryPath = currentPath ? `${currentPath}/${entry.path}` : entry.path
      
      // Check if this entry matches sparse patterns (if filtering)
      if (shouldFilter) {
        const matchesSparse = SparseCheckoutManager.match({
          filepath: entryPath,
          patterns: sparsePatterns,
          coneMode,
        })
        
        if (!matchesSparse) {
          continue
        }
      }
      
      if (entry.type === 'tree') {
        // Recursively walk subdirectories
        await this.walkTreeForSubdirs(
          repo,
          entry.oid,
          sparsePath,
          sparsePatterns,
          tasks,
          entryPath,
          coneMode,
          fs,
          dir,
          gitdir,
          cache
        )
      } else if (entry.type === 'blob') {
        // Add file to current task
        currentTask.files.push({
          path: entryPath,
          oid: entry.oid,
          mode: entry.mode,
        })
      }
    }
    
    // Add task if it has files
    if (currentTask.files.length > 0) {
      tasks.push(currentTask)
    }
  }
  
  
  /**
   * Distribute tasks across workers
   * Uses round-robin distribution
   */
  private distributeTasks(
    tasks: SubdirectoryTask[],
    numWorkers: number
  ): SubdirectoryTask[][] {
    const workerTasks: SubdirectoryTask[][] = Array(numWorkers)
      .fill(null)
      .map(() => [])
    
    // Round-robin distribution
    tasks.forEach((task, index) => {
      workerTasks[index % numWorkers].push(task)
    })
    
    return workerTasks.filter(taskList => taskList.length > 0)
  }
}

