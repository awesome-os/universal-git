import type { GitWorkerAPI, RepositoryOptions, GitBackendOptions, GitWorktreeBackendOptions, ProxiedRepository, ProxiedGitBackend, ProxiedGitWorktreeBackend } from './Proxies.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import type { GitWorktreeBackend } from '../git/worktree/GitWorktreeBackend.ts'
import { Repository } from '../core-utils/Repository.ts'
import { GitBackendFs } from '../backends/GitBackendFs/index.ts'
import { GitWorktreeFs } from '../git/worktree/fs/GitWorktreeFs.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import type { FileSystemProvider, RawFileSystemProvider } from '../models/FileSystem.ts'
import { readObject } from '../git/objects/readObject.ts'
import { join } from '../utils/join.ts'
import * as Comlink from 'comlink'
import * as nodeFs from 'fs' // Import Node.js fs module at top level (same pattern as examples)

/**
 * Implementation of Repository and backend factories in worker thread
 * Creates instances that can be proxied back to main thread
 */
export class GitWorkerImpl implements GitWorkerAPI {
  /**
   * Creates a Repository instance in the worker thread
   * The Repository will execute all operations in the worker thread
   * This is the recommended approach - proxy the entire Repository
   */
  async createRepository(options: RepositoryOptions): Promise<ProxiedRepository> {
    // Note: fs cannot be serialized directly, so we'll need to handle this differently
    // For now, we'll require fs to be passed as a proxy or handle it via Comlink
    if (!options.fs) {
      throw new Error('Filesystem required for Repository')
    }
    
    // In worker context, fs should already be a FileSystem instance or we need to create it
    // This is a simplified version - in practice, fs would be proxied via Comlink
    const fs = options.fs as unknown as FileSystemProvider
    
    // Create Repository instance
    const repo = await Repository.open({
      fs,
      dir: options.dir || undefined,
      gitdir: options.gitdir || undefined,
      cache: options.cache || {},
    })
    
    // Explicitly proxy the repository via Comlink (Comlink will handle this automatically, but we make it explicit for TypeScript)
    return Comlink.proxy(repo) as unknown as ProxiedRepository
  }
  
  /**
   * Creates a GitBackend instance in the worker thread
   * The backend will execute all operations in the worker thread
   * Use this for backend-level proxying
   */
  async createGitBackend(options: GitBackendOptions): Promise<ProxiedGitBackend> {
    // Normalize filesystem if provided
    let fs: FileSystemProvider | undefined
    if (options.fs) {
      fs = createFileSystem(options.fs as unknown as RawFileSystemProvider)
    }
    
    // Create backend using factory (maintains consistency with main thread)
    // Create GitBackendFs directly (new Repository(new GitBackend, new WorktreeBackend) pattern)
    // For now, only filesystem backend is supported in workers
    if (options.type && options.type !== 'filesystem') {
      throw new Error(`Backend type '${options.type}' is not supported in worker threads. Only 'filesystem' is supported.`)
    }
    if (!options.gitdir) {
      throw new Error('gitdir is required for GitBackendFs')
    }
    const backend = new GitBackendFs(fs, options.gitdir)
    
    // Explicitly proxy the backend via Comlink (Comlink will handle this automatically, but we make it explicit for TypeScript)
    return Comlink.proxy(backend) as unknown as ProxiedGitBackend
  }
  
  /**
   * Creates a GitWorktreeBackend instance in the worker thread
   * The backend will execute all operations in the worker thread
   * Use this for backend-level proxying
   */
  async createGitWorktreeBackend(
    options: GitWorktreeBackendOptions
  ): Promise<ProxiedGitWorktreeBackend> {
    // Normalize filesystem if provided
    let fs: FileSystemProvider | undefined
    if (options.fs) {
      fs = createFileSystem(options.fs as unknown as RawFileSystemProvider)
    }
    
    // Create worktree backend
    if (!fs) {
      throw new Error('Filesystem required for GitWorktreeBackend')
    }
    
    const backend = new GitWorktreeFs(fs, options.dir)
    
    // Explicitly proxy the backend via Comlink (Comlink will handle this automatically, but we make it explicit for TypeScript)
    return Comlink.proxy(backend) as unknown as ProxiedGitWorktreeBackend
  }
  
  async ping(): Promise<'pong'> {
    return 'pong'
  }
  
  /**
   * Checkout subdirectories in worker thread
   * Used for multi-worker sparse checkout
   */
  async checkoutSubdirectories(
    options: import('./Proxies.ts').CheckoutSubdirectoriesOptions
  ): Promise<import('./Proxies.ts').CheckoutSubdirectoriesResult> {
    console.log('[Worker] checkoutSubdirectories called')
    const { dir, gitdir, tasks, cache = {}, workerId } = options
    
    try {
      console.log(`[Worker ${workerId}] Starting checkoutSubdirectories: ${tasks.length} tasks, ${tasks.reduce((sum, t) => sum + t.files.length, 0)} files`)
      
      // Workers use their own Node.js fs module (can't serialize fs from main thread)
      // Use the top-level imported fs module and createFileSystem helper (same pattern as examples)
      console.log(`[Worker ${workerId}] Creating FileSystem wrapper using createFileSystem helper...`)
      const normalizedFs = createFileSystem(nodeFs as unknown as RawFileSystemProvider)
      
      // Open repository in worker
      console.log(`[Worker ${workerId}] Opening repository (dir: ${dir}, gitdir: ${gitdir})...`)
      const repo = await Repository.open({
        fs: normalizedFs,
        dir,
        gitdir,
        cache,
        autoDetectConfig: true,
      })
      console.log(`[Worker ${workerId}] Repository opened, starting to process ${tasks.length} tasks...`)
      
      let processedFiles = 0
      let processedDirectories = 0
      const errors: Array<{ path: string; error: string }> = []
      const indexEntries: Array<{
        filepath: string
        oid: string
        stats: unknown
        stage: number
      }> = []
    
    // Process each task assigned to this worker
    for (const task of tasks) {
      try {
        // Ensure directory exists
        const taskDir = join(dir, task.path)
        await normalizedFs.mkdir(taskDir, { recursive: true })
        
        // Process files in this subdirectory
        for (const file of task.files) {
          try {
            // Read object using readObject command (Repository doesn't have readObject method)
            const { object } = await readObject({ 
              fs: normalizedFs, 
              gitdir, 
              oid: file.oid, 
              cache 
            })
            
            // Write to workdir
            const filePath = join(dir, file.path)
            const fileDir = filePath.substring(0, filePath.lastIndexOf('/') || filePath.lastIndexOf('\\'))
            if (fileDir) {
              await normalizedFs.mkdir(fileDir, { recursive: true })
            }
            
            // Parse mode
            const modeNum = parseInt(file.mode, 8)
            
            // Write file based on mode
            if (modeNum === 0o100644 || modeNum === 0o100755) {
              // Regular file
              await normalizedFs.write(filePath, object, { mode: modeNum === 0o100755 ? 0o777 : undefined })
            } else if (modeNum === 0o120000) {
              // Symlink - handle existing symlinks
              try {
                const exists = await normalizedFs.exists(filePath)
                if (exists) {
                  await normalizedFs.unlink(filePath)
                }
                await normalizedFs.writelink(filePath, object)
              } catch (symlinkErr: any) {
                if (symlinkErr.code === 'EEXIST') {
                  // Try to verify if it's the same symlink
                  try {
                    const existingTarget = await normalizedFs.readlink(filePath)
                    const expectedTarget = object.toString('utf8')
                    const existingTargetStr = typeof existingTarget === 'string' 
                      ? existingTarget 
                      : existingTarget?.toString() || ''
                    
                    if (existingTargetStr !== expectedTarget && 
                        existingTargetStr.replace(/\\/g, '/') !== expectedTarget.replace(/\\/g, '/')) {
                      // Different symlink - remove and retry
                      await normalizedFs.unlink(filePath)
                      await normalizedFs.writelink(filePath, object)
                    }
                  } catch {
                    // Ignore - symlink might already be correct
                  }
                } else {
                  throw symlinkErr
                }
              }
            }
            
            // Collect index entry (will be merged in main thread)
            const stats = await normalizedFs.lstat(filePath)
            if (stats) {
              indexEntries.push({
                filepath: file.path,
                oid: file.oid,
                stats,
                stage: 0,
              })
            }
            
            processedFiles++
          } catch (fileError) {
            errors.push({
              path: file.path,
              error: (fileError as Error).message,
            })
          }
        }
        
        processedDirectories++
      } catch (taskError) {
        errors.push({
          path: task.path,
          error: (taskError as Error).message,
        })
      }
    }
    
      console.log(`[Worker ${workerId}] Completed: ${processedFiles} files, ${processedDirectories} dirs`)
      
      return {
        processedFiles,
        processedDirectories,
        indexEntries: indexEntries.length > 0 ? indexEntries : undefined,
        errors: errors.length > 0 ? errors : undefined,
      }
    } catch (error) {
      console.error(`[Worker ${workerId}] Fatal error in checkoutSubdirectories:`, error)
      if ((error as Error).stack) {
        console.error(`[Worker ${workerId}] Stack:`, (error as Error).stack)
      }
      throw error
    }
  }
}

