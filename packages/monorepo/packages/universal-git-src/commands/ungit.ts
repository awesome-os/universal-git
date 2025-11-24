import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { assertParameter } from '../utils/assertParameter.ts'
import { join } from '../utils/join.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { UniversalBuffer } from '../utils/UniversalBuffer.ts'
import { _init } from './init.ts'
import { _clone } from './clone.ts'
import { checkout } from './checkout.ts'
import { sparseCheckout } from './sparseCheckout.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'
import type {
  HttpClient,
  ProgressCallback,
  AuthCallback,
} from '../git/remote/GitRemoteHTTP.ts'
import type { TcpClient } from '../daemon/TcpClient.ts'
import type { SshClient } from '../ssh/SshClient.ts'

/**
 * Fast checkout of repository files without maintaining Git repository data.
 * 
 * Designed for test environments and production deployments where only the working tree files
 * are needed, not the full Git history. All Git operations are performed in-memory or in a
 * temporary directory, and only the working tree files are copied to the target directory.
 * 
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {HttpClient} [args.http] - HTTP client for remote operations
 * @param {TcpClient} [args.tcp] - TCP client for git:// protocol
 * @param {SshClient} [args.ssh] - SSH client for ssh:// protocol
 * @param {ProgressCallback} [args.onProgress] - optional progress event callback
 * @param {AuthCallback} [args.onAuth] - optional authentication callback
 * @param {string} args.dir - Target directory for files (required)
 * @param {string} args.url - Repository URL (required)
 * @param {string} [args.ref='HEAD'] - Branch/tag/commit to checkout
 * @param {string|string[]} [args.sparsePath] - Optional: subdirectory path(s) for sparse checkout
 * @param {boolean} [args.cone=true] - Use cone mode for sparse checkout
 * @param {number} [args.depth] - Optional: shallow clone depth
 * @param {boolean} [args.singleBranch=true] - Only fetch the specified ref
 * @param {string} [args.corsProxy] - Optional CORS proxy URL
 * @param {Record<string, string>} [args.headers] - Optional HTTP headers
 * @param {Record<string, unknown>} [args.cache] - Optional cache object
 * 
 * @returns {Promise<void>} Resolves when files are checked out to target directory
 * 
 * @example
 * // Basic usage: checkout entire repository
 * await ungit({
 *   fs,
 *   http,
 *   dir: '/path/to/target',
 *   url: 'https://github.com/user/repo.git',
 *   ref: 'main',
 * })
 * 
 * @example
 * // Sparse checkout: only specific subdirectory
 * await ungit({
 *   fs,
 *   http,
 *   dir: '/path/to/target',
 *   url: 'https://github.com/user/repo.git',
 *   ref: 'main',
 *   sparsePath: 'src/app',
 *   cone: true,
 * })
 * 
 * @example
 * // Multiple sparse paths
 * await ungit({
 *   fs,
 *   http,
 *   dir: '/path/to/target',
 *   url: 'https://github.com/user/repo.git',
 *   ref: 'main',
 *   sparsePath: ['src/app', 'docs'],
 *   cone: true,
 * })
 * 
 * @example
 * // Shallow clone for faster download
 * await ungit({
 *   fs,
 *   http,
 *   dir: '/path/to/target',
 *   url: 'https://github.com/user/repo.git',
 *   ref: 'main',
 *   depth: 1,
 *   singleBranch: true,
 * })
 */
export async function ungit({
  fs: _fs,
  http,
  tcp,
  ssh,
  onProgress,
  onAuth,
  dir,
  url,
  ref = 'HEAD',
  sparsePath,
  cone = true,
  depth,
  singleBranch = true,
  corsProxy,
  headers = {},
  cache = {},
  useWorkers = false,
  maxWorkers = 4,
  workerScript,
  transport,
}: {
  fs: FileSystemProvider
  http?: HttpClient
  tcp?: TcpClient
  ssh?: SshClient | Promise<SshClient>
  onProgress?: ProgressCallback
  onAuth?: AuthCallback
  dir: string
  url: string
  ref?: string
  sparsePath?: string | string[]
  cone?: boolean
  depth?: number
  singleBranch?: boolean
  corsProxy?: string
  headers?: Record<string, string>
  cache?: Record<string, unknown>
  useWorkers?: boolean
  maxWorkers?: number
  workerScript?: string
  transport?: unknown // Transport or TransportOptions
}): Promise<void> {
  try {
    // Validate required parameters
    if (!_fs) {
      throw new MissingParameterError('fs')
    }
    assertParameter('dir', dir)
    assertParameter('url', url)

    const fs = createFileSystem(_fs)

    // Get temporary directory for Git operations
    // Use os.tmpdir() if available, otherwise use a subdirectory of target
    let tmpDir: string
    try {
      // Try to use os.tmpdir() in Node.js environment
      if (typeof process !== 'undefined' && process.env) {
        // Dynamic import for Node.js os module
        const os = await import('os')
        tmpDir = join(os.tmpdir(), `ungit-${Date.now()}-${Math.random().toString(36).substring(7)}`)
      } else {
        throw new Error('os module not available')
      }
    } catch {
      // Fallback: use a subdirectory of target (will be cleaned up)
      tmpDir = join(dir, '.ungit-tmp')
    }

    const tmpGitdir = join(tmpDir, '.git')
    const tmpWorkdir = tmpDir

    // Resolve ssh if it's a Promise
    const resolvedSsh = ssh instanceof Promise ? await ssh : ssh

    try {
      // Step 1: Clone repository into temporary location
      // Note: We use a temporary filesystem directory for Git operations.
      // All Git data stays in the temporary directory and is cleaned up after files are copied.
      await _clone({
        fs,
        dir: tmpWorkdir,
        gitdir: tmpGitdir,
        url,
        ref,
        depth,
        singleBranch,
        noCheckout: true, // Don't checkout yet, we'll do it after sparse checkout setup
        corsProxy,
        headers,
        http,
        tcp,
        ssh: resolvedSsh,
        onProgress,
        onAuth,
        cache,
      })

      // Step 3: Configure sparse checkout if sparsePath is provided
      if (sparsePath) {
        // Initialize sparse checkout
        await sparseCheckout({
          fs,
          dir: tmpWorkdir,
          gitdir: tmpGitdir,
          init: true,
          cone,
          cache,
        })

        // Convert sparsePath to patterns
        const paths = Array.isArray(sparsePath) ? sparsePath : [sparsePath]
        const patterns = paths.map(path => {
          // Ensure path ends with / for cone mode
          return path.endsWith('/') ? path : `${path}/`
        })

        // Set sparse checkout patterns
        await sparseCheckout({
          fs,
          dir: tmpWorkdir,
          gitdir: tmpGitdir,
          set: patterns,
          cache,
        })
      }

      // Step 4: Checkout files to temporary workdir
      // Use multi-worker checkout if enabled and workerScript is provided
      // Multi-worker checkout works for both sparse and full checkouts
      if (useWorkers && workerScript) {
        try {
          const { MultiWorkerSparseCheckout } = await import('../workers/MultiWorkerSparseCheckout.ts')
          const { WorkerPool } = await import('../workers/WorkerPool.ts')
          const { createDefaultTransport, createTransport } = await import('../transport/index.ts')
          
          // Create transport
          let defaultTransport: any
          if (transport) {
            if (typeof transport === 'object' && transport !== null && 'getType' in transport) {
              defaultTransport = transport
            } else {
              defaultTransport = createTransport(transport as any)
            }
          } else {
            defaultTransport = createDefaultTransport('ungit-workers')
          }
          
          // Create worker pool
          const workerPool = new WorkerPool(maxWorkers, workerScript, defaultTransport)
          
          // Debug: Log multi-worker checkout start
          if (onProgress) {
            await onProgress({
              phase: `Starting multi-worker checkout with ${maxWorkers} workers`,
              loaded: 0,
              total: 0,
            })
          }
          
          // Use multi-worker checkout (works for both sparse and full checkout)
          const multiWorker = new MultiWorkerSparseCheckout(workerPool, defaultTransport)
          await multiWorker.execute({
            fs,
            dir: tmpWorkdir,
            gitdir: tmpGitdir,
            sparsePath: sparsePath, // undefined for full checkout
            ref,
            cache,
            onProgress,
            cone,
          })
          
          // Debug: Log multi-worker checkout complete
          if (onProgress) {
            await onProgress({
              phase: `Multi-worker checkout completed using ${maxWorkers} workers`,
              loaded: 1,
              total: 1,
            })
          }
          
          // Cleanup worker pool
          await workerPool.terminateAll()
          defaultTransport.close()
        } catch (workerError) {
          // Fallback to single-threaded checkout if multi-worker fails
          console.warn(`[ungit] Multi-worker checkout failed, falling back to single-threaded: ${(workerError as Error).message}`)
          if ((workerError as Error).stack) {
            console.warn(`[ungit] Stack trace:`, (workerError as Error).stack)
          }
          if (onProgress) {
            await onProgress({
              phase: 'Falling back to single-threaded checkout',
              loaded: 0,
              total: 0,
            })
          }
          await checkout({
            fs,
            dir: tmpWorkdir,
            gitdir: tmpGitdir,
            ref,
            force: true,
            cache,
            onProgress,
          })
        }
      } else {
        // Single-threaded checkout (default)
        if (onProgress && !useWorkers) {
          await onProgress({
            phase: 'Using single-threaded checkout (multi-worker disabled)',
            loaded: 0,
            total: 0,
          })
        }
        await checkout({
          fs,
          dir: tmpWorkdir,
          gitdir: tmpGitdir,
          ref,
          force: true, // Force checkout to overwrite any existing files
          cache,
          onProgress,
        })
      }

      // Step 5: Copy working tree files to target directory
      // If sparsePath is set and is a single path, check if we should copy contents directly
      // to avoid nested directories (e.g., src/src/ when target is already src/)
      if (sparsePath) {
        const paths = Array.isArray(sparsePath) ? sparsePath : [sparsePath]
        // If there's only one sparse path, try to copy its contents directly
        if (paths.length === 1) {
          // Normalize the sparse path (remove leading/trailing slashes)
          const normalizedSparsePath = paths[0].replace(/^\/+|\/+$/g, '')
          const sparseDir = join(tmpWorkdir, normalizedSparsePath)
          
          // Check if target directory name matches sparse path name (case-insensitive for Windows)
          // Normalize both paths to handle Windows/Unix path differences
          const normalizedTargetDir = dir.replace(/[/\\]+$/, '').replace(/\\/g, '/')
          const targetDirName = normalizedTargetDir.split('/').pop() || ''
          // For sparse path, get the last component (handle paths like 'src/subdir' -> 'subdir')
          const sparsePathParts = normalizedSparsePath.replace(/\\/g, '/').split('/').filter(p => p)
          const sparsePathName = sparsePathParts[sparsePathParts.length - 1] || ''
          const namesMatch = targetDirName && sparsePathName && 
            (targetDirName.toLowerCase() === sparsePathName.toLowerCase())
          
          // Try to copy contents directly if names match
          if (namesMatch) {
            try {
              // Wait a bit to ensure the directory exists after checkout
              // The checkout should have created the sparse directory
              let sparseDirExists = await fs.exists(sparseDir)
              if (!sparseDirExists) {
                // If it doesn't exist immediately, wait a moment and check again
                await new Promise(resolve => setTimeout(resolve, 100))
                sparseDirExists = await fs.exists(sparseDir)
              }
              
              if (sparseDirExists) {
                const stats = await fs.lstat(sparseDir)
                if (stats && stats.isDirectory()) {
                  // Copy contents of sparse directory directly to target
                  // This avoids creating nested directories (e.g., src/src/)
                  await copyWorktreeFiles(fs, sparseDir, dir, onProgress)
                  return // Success - exit early
                }
              }
            } catch (err) {
              // If direct copy fails, fall through to copy entire workdir
              // This can happen if the sparse directory doesn't exist or there's a permission issue
            }
          }
        }
        // Fallback: copy entire workdir structure
        // This preserves the original behavior or handles cases where direct copy isn't possible
        await copyWorktreeFiles(fs, tmpWorkdir, dir, onProgress)
      } else {
        // No sparse path: copy entire workdir
        await copyWorktreeFiles(fs, tmpWorkdir, dir, onProgress)
      }

    } finally {
      // Step 6: Clean up temporary directory
      try {
        await fs.rmdir(tmpDir, { recursive: true })
      } catch (err) {
        // Ignore cleanup errors - best effort
        // The temporary directory will be cleaned up by the OS eventually
      }
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.ungit'
    throw err
  }
}

/**
 * Copy working tree files from source to target directory
 * Excludes .git directory and other Git metadata
 */
async function copyWorktreeFiles(
  fs: ReturnType<typeof createFileSystem>,
  sourceDir: string,
  targetDir: string,
  onProgress?: ProgressCallback
): Promise<void> {
  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true })

  // Get all files in source directory (excluding .git)
  const entries = await fs.readdir(sourceDir)
  if (!entries) return

  let fileCount = 0
  const files: string[] = []

  // Collect all files recursively (including symlinks)
  async function collectFiles(dir: string, basePath: string = ''): Promise<void> {
    const entries = await fs.readdir(dir)
    if (!entries) return

    for (const entry of entries) {
      // Skip .git directory
      if (entry === '.git') continue

      const fullPath = join(dir, entry)
      const relativePath = basePath ? join(basePath, entry) : entry
      const stats = await fs.lstat(fullPath)

      if (stats && stats.isDirectory()) {
        // Recursively collect files in subdirectory
        await collectFiles(fullPath, relativePath)
      } else if (stats && stats.isFile()) {
        files.push(relativePath)
      } else if (stats && stats.isSymbolicLink()) {
        // Handle symlinks
        files.push(relativePath)
      }
    }
  }

  await collectFiles(sourceDir)

  // Copy files and symlinks
  for (const file of files) {
    const sourcePath = join(sourceDir, file)
    const targetPath = join(targetDir, file)

    // Ensure target directory exists
    const targetFileDir = targetPath.substring(0, targetPath.lastIndexOf('/') || targetPath.lastIndexOf('\\'))
    if (targetFileDir) {
      await fs.mkdir(targetFileDir, { recursive: true })
    }

    // Check if source is a symlink
    const sourceStats = await fs.lstat(sourcePath)
    if (sourceStats && sourceStats.isSymbolicLink()) {
      try {
        // Read the symlink target
        const linkTarget = await fs.readlink(sourcePath)
        if (linkTarget !== null) {
          // Always try to remove existing target first (handles parallel operations and retries)
          // This prevents EEXIST errors when the symlink already exists
          try {
            const targetExists = await fs.exists(targetPath)
            if (targetExists) {
              // Try to remove whatever exists at the target path
              try {
                const targetStats = await fs.lstat(targetPath)
                if (targetStats) {
                  if (targetStats.isDirectory()) {
                    await fs.rmdir(targetPath, { recursive: true })
                  } else {
                    // File or symlink - try unlink
                    await fs.unlink(targetPath)
                  }
                }
              } catch (statErr) {
                // If lstat fails, try unlink anyway (might work for symlinks)
                try {
                  await fs.unlink(targetPath)
                } catch {
                  // Ignore - will try to create symlink anyway
                }
              }
            }
          } catch (removeErr) {
            // If removal fails, try unlink as last resort
            try {
              await fs.unlink(targetPath)
            } catch {
              // Ignore - will try to create symlink anyway
            }
          }
          
          // Create the symlink (may still fail on Windows without admin rights or due to race conditions)
          // Convert linkTarget to string if it's a UniversalBuffer
          const linkTargetStr = typeof linkTarget === 'string'
            ? linkTarget
            : linkTarget instanceof Uint8Array
              ? UniversalBuffer.from(linkTarget).toString('utf8')
              : String(linkTarget)
          
          try {
            await fs.symlink(linkTargetStr, targetPath)
            fileCount++
          } catch (symlinkErr: any) {
            // If symlink creation fails (e.g., EEXIST, Windows permissions),
            // handle it gracefully
            if (symlinkErr.code === 'EEXIST') {
              // Symlink already exists - could be from parallel operation or previous attempt
              // Try to verify it's the same symlink, otherwise remove and retry
              try {
                const existingTarget = await fs.readlink(targetPath)
                // Compare targets (handle both string and buffer types)
                const existingTargetStr = typeof existingTarget === 'string' 
                  ? existingTarget 
                  : existingTarget?.toString() || ''
                
                if (existingTargetStr === linkTargetStr || 
                    existingTargetStr.replace(/\\/g, '/') === linkTargetStr.replace(/\\/g, '/')) {
                  // Same symlink already exists - that's fine, count it as success
                  fileCount++
                } else {
                  // Different symlink - remove and retry once
                  try {
                    await fs.unlink(targetPath)
                    await fs.symlink(linkTargetStr, targetPath)
                    fileCount++
                  } catch (retryErr) {
                    // Retry failed - will fall through to file copy fallback
                    throw symlinkErr
                  }
                }
              } catch (verifyErr) {
                // Can't verify/update - try one more time with force removal
                try {
                  // Force remove and retry
                  await fs.unlink(targetPath).catch(() => {}) // Ignore errors
                  await fs.symlink(linkTargetStr, targetPath)
                  fileCount++
                } catch {
                  // Still failed - will fall through to file copy fallback
                  throw symlinkErr
                }
              }
            } else {
              // Other error (e.g., Windows permissions) - fall through to file copy
              throw symlinkErr
            }
          }
        }
      } catch (err) {
        // If symlink creation fails (e.g., on Windows without admin rights, or EEXIST),
        // try to copy the target file instead
        try {
          const linkTarget = await fs.readlink(sourcePath)
          if (linkTarget !== null) {
            // Resolve the symlink target relative to the source directory
            // Convert UniversalBuffer to string
            const linkTargetStr = UniversalBuffer.isBuffer(linkTarget)
              ? linkTarget.toString('utf8')
              : String(linkTarget)
            let resolvedPath: string
            // Handle both absolute and relative symlink targets
            if (linkTargetStr.startsWith('/') || (process.platform === 'win32' && /^[A-Z]:/i.test(linkTargetStr))) {
              resolvedPath = linkTargetStr
            } else {
              // Relative path: resolve relative to the source file's directory
              const sourceFileDir = sourcePath.substring(0, sourcePath.lastIndexOf('/') || sourcePath.lastIndexOf('\\'))
              resolvedPath = join(sourceFileDir, linkTargetStr)
            }
            
            // Check if resolved path exists and is a file
            const resolvedExists = await fs.exists(resolvedPath)
            if (resolvedExists) {
              const resolvedStats = await fs.lstat(resolvedPath)
              if (resolvedStats && resolvedStats.isFile()) {
                const content = await fs.read(resolvedPath)
                if (content !== null) {
                  await fs.write(targetPath, content)
                  fileCount++
                }
              }
            }
          }
        } catch (copyErr) {
          // Ignore symlink errors - skip this file
          // This can happen if symlink target doesn't exist or can't be resolved
        }
      }
    } else {
      // Regular file: read and write
      const content = await fs.read(sourcePath)
      if (content !== null) {
        await fs.write(targetPath, content)
        fileCount++
      }
    }

    // Report progress
    if (onProgress) {
      await onProgress({
        phase: 'copying',
        loaded: fileCount,
        total: files.length,
      })
    }
  }
}

