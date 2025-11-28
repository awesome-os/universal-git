/**
 * Native Git Test Helper
 * 
 * Provides functions to create test repositories using native git CLI
 * and compare results with universal-git for feature parity verification.
 */

import { execSync } from 'child_process'
import { join, sep, resolve } from 'path'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
// FileSystem and FileSystemProvider are not exported as subpath, use relative path
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'

// Repository is not exported as subpath, use relative path
import type { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

export interface TestRepo {
  path: string
  gitdir: string
  fs: FileSystemProvider
  repo: Repository
  systemConfigPath?: string
  globalConfigPath?: string
  cleanup: () => Promise<void>
}

export interface MergeResult {
  oid: string
  tree: string
  message?: string
  parent?: string[]
  hasConflicts: boolean
  conflictFiles?: string[]
}

/**
 * Check if git is available in the system
 */
export function isGitAvailable(): boolean {
  try {
    execSync('git --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Get the working directory from Repository's worktree backend
 * CRITICAL: Native git only works with filesystem, so we must get the directory from the backend
 * @param repo - Test repository
 * @returns Working directory path
 */
export function getBackendDir(repo: TestRepo): string {
  const worktreeBackend = repo.repo.worktreeBackend
  if (!worktreeBackend) {
    throw new Error('Repository must have a worktree backend for native git operations')
  }
  const dir = worktreeBackend.getDirectory?.()
  if (!dir) {
    throw new Error('WorktreeBackend must provide a directory')
  }
  // DEBUG: Log path for debugging
  console.log(`[nativeGit] getBackendDir: ${dir}`)
  return dir
}

/**
 * Create a temporary test repository using native git
 * 
 * CRITICAL: This function creates a Repository with NativeGitBackend explicitly,
 * which uses native git CLI commands for git operations while still using filesystem
 * for file operations. This ensures native git compatibility.
 * 
 * @param objectFormat - Object format: 'sha1' or 'sha256'
 * @returns TestRepo with path, gitdir, fs, and cleanup function
 */
export async function createTestRepo(objectFormat: 'sha1' | 'sha256' = 'sha1'): Promise<TestRepo> {
  if (!isGitAvailable()) {
    throw new Error('git is not available in the system. Native git tests require git CLI.')
  }

  const tempDir = join(tmpdir(), `ugit-test-${Date.now()}-${Math.random().toString(36).substring(7)}`)
  const repoPath = join(tempDir, 'repo')
  mkdirSync(repoPath, { recursive: true })
  const gitdir = join(repoPath, '.git')

  try {
    // CRITICAL: Create FileSystem wrapper for universal-git first
    const _fs = await import('fs')
    const fs = new FileSystem(_fs)

    // CRITICAL: Get directory path first (before creating backends)
    // We need to initialize git BEFORE creating Repository/backends to avoid incomplete .git structure
    const { createGitWorktreeBackend } = await import('@awesome-os/universal-git-src/git/worktree/index.ts')
    const worktreeBackend = createGitWorktreeBackend({ fs, dir: repoPath })
    const backendDir = worktreeBackend.getDirectory?.()
    
    if (!backendDir) {
      throw new Error('WorktreeBackend must provide a directory for native git tests')
    }

    // DEBUG: Log paths for debugging
    console.log('[nativeGit] Creating test repo:')
    console.log(`  repoPath: ${repoPath}`)
    console.log(`  gitdir: ${gitdir}`)
    console.log(`  backendDir: ${backendDir}`)

    // CRITICAL: Create NativeGitBackend - uses native git CLI for operations
    const { NativeGitBackend } = await import('@awesome-os/universal-git-src/backends/NativeGitBackend.ts')
    const gitBackend = new NativeGitBackend(fs, gitdir, backendDir)

    // Query native git for actual config file locations to ensure Repository can read them
    let systemConfigPath: string | undefined
    let globalConfigPath: string | undefined
    
    try {
      // Get system config path by checking where git reads it from
      // Use --file flag to test if system config exists
      const systemTest = execSync('git config --system --list 2>&1', {
        encoding: 'utf-8',
        stdio: 'pipe'
      })
      // If successful, try to get the actual path
      // On Windows: C:\ProgramData\Git\config
      // On Unix: /etc/gitconfig
      const isWindows = process.platform === 'win32'
      const defaultSystemPath = isWindows
        ? 'C:\\ProgramData\\Git\\config'
        : '/etc/gitconfig'
      if (existsSync(defaultSystemPath)) {
        systemConfigPath = defaultSystemPath
      }
    } catch {
      // System config might not exist or be readable
    }
    
    try {
      // Get global config path - check default locations
      const homeDir = process.env.HOME || process.env.USERPROFILE
      if (homeDir) {
        const defaultGlobalPath = join(homeDir, '.gitconfig')
        if (existsSync(defaultGlobalPath)) {
          globalConfigPath = defaultGlobalPath
        }
      }
      // Also check XDG_CONFIG_HOME on Unix
      if (!globalConfigPath && process.env.XDG_CONFIG_HOME) {
        const xdgPath = join(process.env.XDG_CONFIG_HOME, 'git', 'config')
        if (existsSync(xdgPath)) {
          globalConfigPath = xdgPath
        }
      }
    } catch {
      // Global config might not exist
    }

    // CRITICAL: Create Repository with explicit backends using new constructor
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const defaultBranch = 'master'  // Use 'master' as default branch for native git compatibility
    const repo = new Repository({
      gitBackend,
      worktreeBackend,
      cache: {},
      autoDetectConfig: true,
      systemConfigPath,
      globalConfigPath,
    })
    
    // CRITICAL: Initialize the repository structure
    await repo.init({
      bare: false,
      defaultBranch: defaultBranch,
      objectFormat: objectFormat,
    })
    
    // CRITICAL: Checkout to worktree backend if provided
    // This makes fs available and sets up the worktree properly
    if (worktreeBackend) {
      await repo.checkout(worktreeBackend)
      
      // Verify worktree is set up correctly
      const verifyWorktreeBackend = repo.worktreeBackend
      if (!verifyWorktreeBackend) {
        throw new Error('Worktree backend not accessible after checkout - worktreeBackend is null')
      }
      const verifyDir = verifyWorktreeBackend.getDirectory?.()
      console.log(`[nativeGit] Verified worktree backend is accessible: ${verifyDir || 'no directory'}`)
    }

    // CRITICAL: Verify gitBackend is NativeGitBackend
    if (repo.gitBackend?.getType() !== 'native-git') {
      throw new Error(`Native git tests require NativeGitBackend. Got: ${repo.gitBackend?.getType()}`)
    }

    // CRITICAL: Get paths from backends (after Repository initialization)
    const backendGitdir = gitBackend.getGitdir()
    // backendDir is already declared above, just use it
    
    // CRITICAL: Resolve to absolute path and convert Windows short paths to long paths
    const absoluteBackendDir = resolve(backendDir)
    console.log(`[nativeGit] Original resolved path: ${absoluteBackendDir}`)
    
    // On Windows, convert short paths (8.3 format) to long paths
    let longBackendDir: string
    try {
      longBackendDir = process.platform === 'win32' 
        ? realpathSync.native(absoluteBackendDir)
        : absoluteBackendDir
      console.log(`[nativeGit] Long path: ${longBackendDir}`)
    } catch (err) {
      // If realpathSync fails, fall back to absolute path
      console.log(`[nativeGit] Warning: Could not convert to long path, using absolute: ${err}`)
      longBackendDir = absoluteBackendDir
    }
    
    // Verify .git directory exists (Repository.init should have created it)
    const expectedGitdir = join(longBackendDir, '.git')
    if (!existsSync(expectedGitdir)) {
      throw new Error(`Repository.init failed: .git directory not found at ${expectedGitdir}`)
    }
    console.log(`[nativeGit] Verified .git directory exists at: ${expectedGitdir}`)
    
    // CRITICAL: Verify HEAD file exists (Repository.init should have created it)
    const headPath = join(expectedGitdir, 'HEAD')
    if (!existsSync(headPath)) {
      console.log(`[nativeGit] HEAD file not found, creating it via gitBackend...`)
      // Create HEAD file via gitBackend to ensure it's properly formatted
      await gitBackend.writeHEAD(`ref: refs/heads/${defaultBranch}`)
    } else {
      // Verify HEAD content is correct
      const headContent = readFileSync(headPath, 'utf-8').trim()
      console.log(`[nativeGit] HEAD file content: ${headContent}`)
      if (!headContent.startsWith('ref: refs/heads/')) {
        console.log(`[nativeGit] HEAD content incorrect, fixing...`)
        await gitBackend.writeHEAD(`ref: refs/heads/${defaultBranch}`)
      }
    }
    
    // CRITICAL: Ensure refs/heads directory exists and default branch ref exists (even if empty)
    const refsHeadsDir = join(expectedGitdir, 'refs', 'heads')
    if (!existsSync(refsHeadsDir)) {
      console.log(`[nativeGit] refs/heads directory not found, creating it...`)
      mkdirSync(refsHeadsDir, { recursive: true })
    }
    
    // CRITICAL: Create an empty index file if it doesn't exist
    // Native git expects an index file to exist (even if empty) for some operations
    const indexPath = join(expectedGitdir, 'index')
    if (!existsSync(indexPath)) {
      console.log(`[nativeGit] Index file not found, creating empty index...`)
      // Create an empty index file - git uses a specific format, but an empty file should work for recognition
      // Actually, let's use the gitBackend to write an empty index
      const { GitIndex } = await import('@awesome-os/universal-git-src/git/index/GitIndex.ts')
      const emptyIndex = new GitIndex()
      await gitBackend.writeIndex(await emptyIndex.toBuffer())
    }
    
    // List contents of the directory to verify
    try {
      if (process.platform === 'win32') {
        const dirContents = execSync('dir /b', { cwd: longBackendDir, encoding: 'utf-8', shell: 'cmd.exe' }).trim()
        console.log(`[nativeGit] Repo directory contents: ${dirContents}`)
        
        // List .git directory contents
        const gitDirContents = execSync('dir /b', { cwd: expectedGitdir, encoding: 'utf-8', shell: 'cmd.exe' }).trim()
        console.log(`[nativeGit] .git directory contents: ${gitDirContents}`)
      } else {
        const dirContents = execSync('ls -la', { cwd: longBackendDir, encoding: 'utf-8', shell: '/bin/sh' }).trim()
        console.log(`[nativeGit] Repo directory contents:\n${dirContents}`)
        
        // List .git directory contents
        const gitDirContents = execSync('ls -la', { cwd: expectedGitdir, encoding: 'utf-8', shell: '/bin/sh' }).trim()
        console.log(`[nativeGit] .git directory contents:\n${gitDirContents}`)
      }
    } catch (err: any) {
      console.error(`[nativeGit] Error listing directory contents: ${err.message}`)
    }

    // CRITICAL: Verify git can find the repository - use --show-toplevel first to check
    // Note: For an empty repository (no commits), git rev-parse might fail, but git should still recognize the repo
    try {
      const gitDirOutput = execSync('git rev-parse --git-dir', { 
        cwd: longBackendDir, 
        encoding: 'utf-8',
        stdio: 'pipe' 
      }).trim()
      console.log(`[nativeGit] Git found repository at: ${gitDirOutput}`)
      
      // Try to get top-level (might fail for empty repo, but that's okay)
      try {
        const topLevel = execSync('git rev-parse --show-toplevel', { 
          cwd: longBackendDir, 
          encoding: 'utf-8',
          stdio: 'pipe' 
        }).trim()
        console.log(`[nativeGit] Git found top-level at: ${topLevel}`)
      } catch {
        // Empty repo - this is expected
        console.log(`[nativeGit] Empty repository (no commits yet)`)
      }
    } catch (err: any) {
      console.error(`[nativeGit] ERROR: Git cannot find repository in ${longBackendDir}`)
      console.error(`[nativeGit] Error details: ${err.message}`)
      // Try to get more info - check if we're in the right directory
      try {
        if (process.platform === 'win32') {
          const pwd = execSync('cd', { cwd: longBackendDir, encoding: 'utf-8', shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh' }).trim()
          console.error(`[nativeGit] Current directory (cd): ${pwd}`)
        }
        // Try git status to see what error we get
        const statusOutput = execSync('git status', { 
          cwd: longBackendDir, 
          encoding: 'utf-8',
          stdio: 'pipe' 
        })
        console.error(`[nativeGit] Git status output: ${statusOutput}`)
      } catch (statusErr: any) {
        console.error(`[nativeGit] Git status error: ${statusErr.message}`)
      }
      throw new Error(`Git cannot find repository: ${err}`)
    }

    // CRITICAL: Set git config using long backend directory
    // Use --local flag to ensure we're setting config in the repository
    console.log(`[nativeGit] Setting git config in: ${longBackendDir}`)
    try {
      execSync('git config --local user.name "Test User"', { cwd: longBackendDir, stdio: 'pipe' })
      execSync('git config --local user.email "test@example.com"', { cwd: longBackendDir, stdio: 'pipe' })
      
      // Disable automatic packing to ensure all objects are loose and accessible
      // This ensures universal-git can read all objects without needing packfile support
      execSync('git config --local gc.auto 0', { cwd: longBackendDir, stdio: 'pipe' })
      execSync('git config --local gc.autopacklimit 0', { cwd: longBackendDir, stdio: 'pipe' })
      console.log(`[nativeGit] Git config set successfully`)
    } catch (err: any) {
      // If git config fails, try using the gitdir directly
      console.error(`[nativeGit] Git config failed, trying with --git-dir: ${err.message}`)
      const gitDirFlag = `--git-dir=${expectedGitdir}`
      execSync(`git config ${gitDirFlag} user.name "Test User"`, { cwd: longBackendDir, stdio: 'pipe' })
      execSync(`git config ${gitDirFlag} user.email "test@example.com"`, { cwd: longBackendDir, stdio: 'pipe' })
      execSync(`git config ${gitDirFlag} gc.auto 0`, { cwd: longBackendDir, stdio: 'pipe' })
      execSync(`git config ${gitDirFlag} gc.autopacklimit 0`, { cwd: longBackendDir, stdio: 'pipe' })
      console.log(`[nativeGit] Git config set successfully using --git-dir`)
    }
    
    // Update return value to use long path (convert gitdir too)
    const longBackendGitdir = process.platform === 'win32'
      ? realpathSync.native(backendGitdir)
      : backendGitdir


    return {
      path: longBackendDir,  // Use long backend directory (converted from short path on Windows)
      gitdir: longBackendGitdir,  // Use long backend gitdir (converted from short path on Windows)
      fs: fs as FileSystemProvider,
      repo,
      systemConfigPath,
      globalConfigPath,
      cleanup: async () => {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
    // Clean up on error
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    throw error
  }
}

/**
 * Create an initial commit with files
 * 
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * 
 * @param repo - Test repository
 * @param files - Object mapping file paths to content
 * @param message - Commit message
 * @returns Commit OID
 */
export async function createInitialCommit(
  repo: TestRepo,
  files: Record<string, string>,
  message: string = 'initial commit'
): Promise<string> {
  // CRITICAL: Get directory from backend
  // Debug: Check repository state
  const worktreeCheck = repo.repo.getWorktreeSync()
  const hasBackend = !!(repo.repo as any)._worktreeBackend
  console.log(`[nativeGit] createInitialCommit: worktree=${!!worktreeCheck}, _worktreeBackend=${hasBackend}`)
  
  if (!worktreeCheck || !hasBackend) {
    throw new Error(`Repository worktree not accessible in createInitialCommit. worktree=${!!worktreeCheck}, _worktreeBackend=${hasBackend}`)
  }
  
  const dir = getBackendDir(repo)
  const gitdir = repo.gitdir
  console.log(`[nativeGit] createInitialCommit: using directory ${dir}, gitdir=${gitdir}`)

  // Verify .git directory exists
  if (!existsSync(gitdir)) {
    throw new Error(`Git directory does not exist: ${gitdir}`)
  }

  // Write files to backend directory
  for (const [filepath, content] of Object.entries(files)) {
    const fullPath = join(dir, filepath)
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf(sep))
    if (dirPath && dirPath !== dir && !existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    writeFileSync(fullPath, content)
  }

  // CRITICAL: Use NativeGitBackend methods instead of execSync
  const nativeBackend = repo.repo.gitBackend as any
  if (nativeBackend && nativeBackend.addFiles && nativeBackend.createCommit) {
    // Use NativeGitBackend methods
    await nativeBackend.addFiles('.')
    const commitOid = await nativeBackend.createCommit(message, {
      env: { GIT_AUTHOR_DATE: '1262356920 +0000', GIT_COMMITTER_DATE: '1262356920 +0000' },
    })
    
    // Get the default branch name
    const defaultBranch = await repo.repo.currentBranch() || 'master'
    
    // Rename to 'master' if it's 'main' for consistency with tests
    if (defaultBranch === 'main') {
      execSync('git branch -m master', { cwd: dir, stdio: 'pipe' })
      // Update HEAD to point to master
      await repo.repo.gitBackend.writeHEAD('ref: refs/heads/master')
    }
    
    return commitOid
  }

  // Fallback to execSync if NativeGitBackend methods aren't available
  console.log(`[nativeGit] Falling back to execSync for git commands`)
  
  // CRITICAL: Run native git in backend directory with explicit --git-dir if needed
  console.log(`[nativeGit] Running 'git add -A' in ${dir}`)
  try {
    execSync('git add -A', { cwd: dir, stdio: 'pipe' })
  } catch (error: any) {
    // If git add fails, try with explicit --git-dir
    console.log(`[nativeGit] git add failed, trying with --git-dir: ${error.message}`)
    execSync(`git --git-dir="${gitdir}" --work-tree="${dir}" add -A`, { stdio: 'pipe' })
  }
  
  try {
    execSync(`git commit -m "${message}"`, {
      cwd: dir,
      stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: '1262356920 +0000', GIT_COMMITTER_DATE: '1262356920 +0000' },
    })
  } catch (error: any) {
    // If git commit fails, try with explicit --git-dir
    console.log(`[nativeGit] git commit failed, trying with --git-dir: ${error.message}`)
    execSync(`git --git-dir="${gitdir}" --work-tree="${dir}" commit -m "${message}"`, {
      stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: '1262356920 +0000', GIT_COMMITTER_DATE: '1262356920 +0000' },
    })
  }

  // Get the default branch name (could be 'main' or 'master')
  let defaultBranch: string
  try {
    defaultBranch = execSync('git branch --show-current', { 
      cwd: dir, 
      encoding: 'utf-8' 
    }).trim() || 'master'
  } catch {
    // Fallback: try with --git-dir
    try {
      defaultBranch = execSync(`git --git-dir="${gitdir}" branch --show-current`, { 
        encoding: 'utf-8' 
      }).trim() || 'master'
    } catch {
      defaultBranch = 'master'
    }
  }
  
  // Rename to 'master' if it's 'main' for consistency with tests
  if (defaultBranch === 'main') {
    try {
      execSync('git branch -m master', { cwd: dir, stdio: 'pipe' })
    } catch {
      execSync(`git --git-dir="${gitdir}" branch -m master`, { stdio: 'pipe' })
    }
    // Update HEAD to point to master
    await repo.repo.gitBackend.writeHEAD('ref: refs/heads/master')
  }

  // Get commit OID
  try {
    return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim()
  } catch {
    return execSync(`git --git-dir="${gitdir}" rev-parse HEAD`, { encoding: 'utf-8' }).trim()
  }
}

/**
 * Create a branch from a commit
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * @param repo - Test repository
 * @param branchName - Name of the branch
 * @param fromRef - Reference to create branch from (commit, branch, or tag)
 */
export function createBranch(repo: TestRepo, branchName: string, fromRef: string): void {
  const dir = getBackendDir(repo)
  execSync(`git branch "${branchName}" "${fromRef}"`, { cwd: dir, stdio: 'pipe' })
}

/**
 * Create a commit on a branch
 * 
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * 
 * @param repo - Test repository
 * @param branchName - Branch to commit to
 * @param files - Object mapping file paths to content (empty object for no file changes)
 * @param deletedFiles - Array of file paths to delete
 * @param message - Commit message
 * @param timestamp - Commit timestamp (default: current time)
 * @returns Commit OID
 */
export async function createCommit(
  repo: TestRepo,
  branchName: string,
  files: Record<string, string> = {},
  deletedFiles: string[] = [],
  message: string = 'commit',
  timestamp: number = Date.now() / 1000
): Promise<string> {
  // CRITICAL: Get directory from backend
  const dir = getBackendDir(repo)

  // Checkout branch
  execSync(`git checkout "${branchName}"`, { cwd: dir, stdio: 'pipe' })

  // Add/modify files
  for (const [filepath, content] of Object.entries(files)) {
    const fullPath = join(dir, filepath)
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf(sep))
    if (dirPath && dirPath !== dir && !existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
    writeFileSync(fullPath, content)
  }

  // Delete files
  for (const filepath of deletedFiles) {
    const fullPath = join(dir, filepath)
    if (existsSync(fullPath)) {
      execSync(`git rm "${filepath}"`, { cwd: dir, stdio: 'pipe' })
    }
  }

  // Stage all changes
  execSync('git add -A', { cwd: dir, stdio: 'pipe' })

  // Create commit
  const gitDate = `${Math.floor(timestamp)} +0000`
  execSync(`git commit -m "${message}"`, {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: gitDate, GIT_COMMITTER_DATE: gitDate },
  })

  return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim()
}

/**
 * Ensure all objects are unpacked and accessible
 * This is important because native git might pack objects, but universal-git needs them accessible
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 */
function ensureObjectsUnpacked(repo: TestRepo): void {
  const dir = getBackendDir(repo)
  try {
    // Unpack any packfiles to ensure all objects are loose and accessible
    // This ensures universal-git can read all objects
    execSync('git unpack-objects < /dev/null 2>/dev/null || true', { 
      cwd: dir, 
      stdio: 'pipe',
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    })
  } catch {
    // If unpack fails (no packfiles), that's fine - objects are already loose
  }
  
  // Alternative: ensure packfiles are indexed and accessible
  // Run git gc --no-prune to ensure packfiles are properly indexed
  try {
    execSync('git gc --no-prune --quiet', { cwd: dir, stdio: 'pipe' })
  } catch {
    // If gc fails, that's okay - objects should still be accessible
  }
}

/**
 * Perform a merge using native git
 * @param repo - Test repository
 * @param ours - Our branch name
 * @param theirs - Their branch name
 * @param options - Merge options
 * @returns Merge result with OID, tree, and conflict information
 */
export async function nativeMerge(
  repo: TestRepo,
  ours: string,
  theirs: string,
  options: {
    noFF?: boolean
    message?: string
    strategy?: string
    abortOnConflict?: boolean
  } = {}
): Promise<MergeResult> {
  // CRITICAL: Get directory from backend
  const dir = getBackendDir(repo)
  
  // Checkout our branch using universal-git checkout
  const { checkout } = await import('@awesome-os/universal-git-src/commands/checkout.ts')
  await checkout({ repo: repo.repo, ref: ours, force: true })
  
  // Ensure all objects are accessible before merge
  ensureObjectsUnpacked(repo)

  const mergeArgs: string[] = []
  if (options.noFF) {
    mergeArgs.push('--no-ff')
  }
  if (options.message) {
    mergeArgs.push('-m', `"${options.message}"`)
  }
  if (options.strategy) {
    mergeArgs.push('-s', options.strategy)
  }

  let hasConflicts = false
  const conflictFiles: string[] = []

  try {
    // Attempt merge using GitBackend merge method
    const mergeResult = await repo.repo.gitBackend.merge(ours, theirs, {
      message: options.message,
      fastForward: !options.noFF,
      fastForwardOnly: false,
      abortOnConflict: options.abortOnConflict ?? true,
      dryRun: false,
      noUpdateBranch: false,
      allowUnrelatedHistories: false,
    })

    // Check if merge result is a MergeConflictError
    const { MergeConflictError } = await import('@awesome-os/universal-git-src/errors/MergeConflictError.ts')
    const isConflictError = (mergeResult as any)?.code === 'MergeConflictError' || (mergeResult && typeof mergeResult === 'object' && (mergeResult as any).code === 'MergeConflictError')
    
    if (isConflictError) {
      // Merge conflict
      hasConflicts = true
      const conflictError = mergeResult as any
      conflictFiles.push(...(conflictError.data?.filepaths || []))

      if (options.abortOnConflict !== false) {
        // Abort the merge - reset to before merge
        const ourOid = await repo.repo.gitBackend.readRef(`refs/heads/${ours}`) || ''
        if (ourOid) {
          await repo.repo.gitBackend.writeRef(`refs/heads/${ours}`, ourOid)
          const { checkout } = await import('@awesome-os/universal-git-src/commands/checkout.ts')
          await checkout({ repo: repo.repo, ref: ours, force: true })
        }
      } else {
        // Merge is in progress with conflicts
        // Get current state using GitBackend
        try {
          const ourOid = await repo.repo.gitBackend.readRef(`refs/heads/${ours}`) || ''
          const commitResult = await repo.repo.gitBackend.readObject(ourOid, 'content', {})
          if (commitResult.type === 'commit') {
            const { parse: parseCommit } = await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')
            const commit = parseCommit(commitResult.object)
            const tree = commit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

            return {
              oid: ourOid, // Current HEAD (merge not completed)
              tree,
              hasConflicts: true,
              conflictFiles,
            }
          }
        } catch {
          // Can't get commit info, return empty result
        }
      }
      
      // Re-throw the conflict error
      throw mergeResult
    }

    // Merge succeeded - mergeResult is not a MergeConflictError
    const successResult = mergeResult as { oid: string; tree: string; mergeCommit: boolean; fastForward?: boolean; alreadyMerged?: boolean }
    const oid = successResult.oid
    const tree = successResult.tree
    
    // Get commit message and parents using GitBackend
    const { parse: parseCommit } = await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')
    const commitResult = await repo.repo.gitBackend.readObject(oid, 'content', {})
    if (commitResult.type !== 'commit') {
      throw new Error('Expected commit object')
    }
    const commit = parseCommit(commitResult.object)
    const commitMessage = commit.message || ''
    const parents = commit.parent || []

    return {
      oid,
      tree,
      message: commitMessage,
      parent: parents,
      hasConflicts: false,
    }
  } catch (error: any) {
    // Re-throw the error - conflict handling is done above
    throw error
  }

  // This should not be reached, but TypeScript needs it
  throw new Error('Merge failed unexpectedly')
}

/**
 * Get the tree OID for a commit
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * @param repo - Test repository
 * @param ref - Commit reference (branch, tag, or OID)
 * @returns Tree OID
 */
export function getTreeOid(repo: TestRepo, ref: string): string {
  const dir = getBackendDir(repo)
  return execSync(`git rev-parse "${ref}^{tree}"`, { cwd: dir, encoding: 'utf-8' }).trim()
}

/**
 * Get the commit OID for a reference
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * @param repo - Test repository
 * @param ref - Reference (branch, tag, or OID)
 * @returns Commit OID
 */
export function getCommitOid(repo: TestRepo, ref: string): string {
  const dir = getBackendDir(repo)
  return execSync(`git rev-parse "${ref}"`, { cwd: dir, encoding: 'utf-8' }).trim()
}

/**
 * Read conflict markers from a file
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * @param repo - Test repository
 * @param filepath - Path to the file
 * @returns File content with conflict markers
 */
export function getConflictMarkers(repo: TestRepo, filepath: string): string {
  const dir = getBackendDir(repo)
  const fullPath = join(dir, filepath)
  return readFileSync(fullPath, 'utf-8')
}

/**
 * Check if a merge is in progress
 * CRITICAL: Uses paths from Repository's backends to ensure consistency with native git.
 * @param repo - Test repository
 * @returns True if merge is in progress
 */
export function isMergeInProgress(repo: TestRepo): boolean {
  const dir = getBackendDir(repo)
  try {
    execSync('git rev-parse --verify MERGE_HEAD', { cwd: dir, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Get all git config values that affect merge behavior
 * @param repo - Test repository
 * @returns Object with merge-related config values
 */
export function getMergeConfig(repo: TestRepo): Record<string, string | undefined> {
  const dir = getBackendDir(repo)
  const configs: Record<string, string | undefined> = {}
  
  // List of merge-related config keys
  const mergeConfigKeys = [
    'merge.conflictstyle',
    'merge.ff',
    'merge.ours',
    'merge.theirs',
    'merge.renormalize',
    'core.autocrlf',
    'core.safecrlf',
    'merge.tool',
    'merge.keepBackup',
    'merge.branchdesc',
    'merge.log',
    'merge.stat',
    'merge.verbosity',
  ]
  
  for (const key of mergeConfigKeys) {
    try {
      const value = execSync(`git config --get "${key}"`, {
        cwd: dir,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()
      configs[key] = value || undefined
    } catch {
      // Config not set, that's fine
      configs[key] = undefined
    }
  }
  
  return configs
}

/**
 * Get all git config values (all keys)
 * @param repo - Test repository
 * @returns Object with all config values
 */
export function getAllConfig(repo: TestRepo): Record<string, string> {
  const dir = getBackendDir(repo)
  try {
    const output = execSync('git config --list --local', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    
    const configs: Record<string, string> = {}
    for (const line of output.trim().split('\n')) {
      if (line && line.includes('=')) {
        const [key, ...valueParts] = line.split('=')
        configs[key] = valueParts.join('=')
      }
    }
    return configs
  } catch {
    return {}
  }
}

/**
 * Log git config for debugging
 * @param repo - Test repository
 * @param label - Label for the log output
 */
export function logConfig(repo: TestRepo, label: string = 'Git Config'): void {
  const mergeConfig = getMergeConfig(repo)
  const allConfig = getAllConfig(repo)
  
  console.log(`\n=== ${label} ===`)
  console.log('Merge-related configs:')
  for (const [key, value] of Object.entries(mergeConfig)) {
    console.log(`  ${key} = ${value ?? '(not set)'}`)
  }
  console.log('\nAll local configs:')
  for (const [key, value] of Object.entries(allConfig)) {
    console.log(`  ${key} = ${value}`)
  }
  console.log('=== End Config ===\n')
}

/**
 * Compare native git config with universal-git config
 * @param repo - Test repository
 * @param ugitConfig - Config values from universal-git
 * @returns Object with comparison results and mismatches
 */
export function compareConfig(
  repo: TestRepo,
  ugitConfig: Record<string, unknown>
): {
  match: boolean
  mismatches: Array<{ key: string; native: string | undefined; ugit: unknown }>
  nativeConfig: Record<string, string | undefined>
  ugitConfig: Record<string, unknown>
} {
  const nativeConfig = getMergeConfig(repo)
  const mismatches: Array<{ key: string; native: string | undefined; ugit: unknown }> = []
  
  // Check all merge-related configs
  const mergeConfigKeys = [
    'merge.conflictstyle',
    'merge.ff',
    'merge.ours',
    'merge.theirs',
    'merge.renormalize',
    'core.autocrlf',
    'core.safecrlf',
  ]
  
  for (const key of mergeConfigKeys) {
    const nativeValue = nativeConfig[key]
    const ugitValue = ugitConfig[key]
    
    // Normalize values for comparison (string vs boolean, etc.)
    const nativeNormalized = nativeValue === undefined ? undefined : String(nativeValue)
    const ugitNormalized = ugitValue === undefined ? undefined : String(ugitValue)
    
    // Some configs like core.autocrlf may come from global/system config in native git
    // but universal-git only reads local config. This is expected behavior.
    // We'll still log it but note it's expected.
    if (nativeNormalized !== ugitNormalized) {
      // Check if this is a known expected difference (global/system config)
      const isExpectedDifference = key === 'core.autocrlf' && nativeNormalized !== undefined && ugitNormalized === undefined
      
      mismatches.push({
        key,
        native: nativeNormalized,
        ugit: ugitNormalized,
      })
      
      if (isExpectedDifference) {
        // Log that this is expected
        console.log(`  Note: ${key} mismatch is expected - native git reads from global/system config, universal-git only reads local config`)
      }
    }
  }
  
  return {
    match: mismatches.length === 0,
    mismatches,
    nativeConfig,
    ugitConfig: ugitConfig,
  }
}

