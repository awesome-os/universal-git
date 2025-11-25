/**
 * Native Git Test Helper
 * 
 * Provides functions to create test repositories using native git CLI
 * and compare results with universal-git for feature parity verification.
 */

import { execSync } from 'child_process'
import { join, sep } from 'path'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
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
 * Create a temporary test repository using native git
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

  try {
    // Initialize git repository
    const initArgs = objectFormat === 'sha256'
      ? `git init --object-format=sha256 "${repoPath}"`
      : `git init "${repoPath}"`
    execSync(initArgs, { stdio: 'pipe' })

    // Set git config
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' })
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' })
    
    // Disable automatic packing to ensure all objects are loose and accessible
    // This ensures universal-git can read all objects without needing packfile support
    execSync('git config gc.auto 0', { cwd: repoPath, stdio: 'pipe' })
    execSync('git config gc.autopacklimit 0', { cwd: repoPath, stdio: 'pipe' })

    // Create FileSystem wrapper for universal-git
    const _fs = await import('fs')
    const fs = new FileSystem(_fs)
    const gitdir = join(repoPath, '.git')

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

    // Create Repository instance for convenience
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({
      fs: fs as FileSystemProvider,
      dir: repoPath,
      gitdir,
      cache: {},
      autoDetectConfig: true,
      systemConfigPath,
      globalConfigPath,
    })

    return {
      path: repoPath,
      gitdir,
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
  for (const [filepath, content] of Object.entries(files)) {
    const fullPath = join(repo.path, filepath)
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep))
    if (dir && dir !== repo.path && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(fullPath, content)
  }

  execSync('git add -A', { cwd: repo.path, stdio: 'pipe' })
  execSync(`git commit -m "${message}"`, {
    cwd: repo.path,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: '1262356920 +0000', GIT_COMMITTER_DATE: '1262356920 +0000' },
  })

  // Get the default branch name (could be 'main' or 'master')
  const defaultBranch = execSync('git branch --show-current', { 
    cwd: repo.path, 
    encoding: 'utf-8' 
  }).trim() || 'master'
  
  // Rename to 'master' if it's 'main' for consistency with tests
  if (defaultBranch === 'main') {
    execSync('git branch -m master', { cwd: repo.path, stdio: 'pipe' })
  }

  return execSync('git rev-parse HEAD', { cwd: repo.path, encoding: 'utf-8' }).trim()
}

/**
 * Create a branch from a commit
 * @param repo - Test repository
 * @param branchName - Name of the branch
 * @param fromRef - Reference to create branch from (commit, branch, or tag)
 */
export function createBranch(repo: TestRepo, branchName: string, fromRef: string): void {
  execSync(`git branch "${branchName}" "${fromRef}"`, { cwd: repo.path, stdio: 'pipe' })
}

/**
 * Create a commit on a branch
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
  // Checkout branch
  execSync(`git checkout "${branchName}"`, { cwd: repo.path, stdio: 'pipe' })

  // Add/modify files
  for (const [filepath, content] of Object.entries(files)) {
    const fullPath = join(repo.path, filepath)
    const dir = fullPath.substring(0, fullPath.lastIndexOf(sep))
    if (dir && dir !== repo.path && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(fullPath, content)
  }

  // Delete files
  for (const filepath of deletedFiles) {
    const fullPath = join(repo.path, filepath)
    if (existsSync(fullPath)) {
      execSync(`git rm "${filepath}"`, { cwd: repo.path, stdio: 'pipe' })
    }
  }

  // Stage all changes
  execSync('git add -A', { cwd: repo.path, stdio: 'pipe' })

  // Create commit
  const gitDate = `${Math.floor(timestamp)} +0000`
  execSync(`git commit -m "${message}"`, {
    cwd: repo.path,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: gitDate, GIT_COMMITTER_DATE: gitDate },
  })

  return execSync('git rev-parse HEAD', { cwd: repo.path, encoding: 'utf-8' }).trim()
}

/**
 * Ensure all objects are unpacked and accessible
 * This is important because native git might pack objects, but universal-git needs them accessible
 */
function ensureObjectsUnpacked(repo: TestRepo): void {
  try {
    // Unpack any packfiles to ensure all objects are loose and accessible
    // This ensures universal-git can read all objects
    execSync('git unpack-objects < /dev/null 2>/dev/null || true', { 
      cwd: repo.path, 
      stdio: 'pipe',
      shell: true 
    })
  } catch {
    // If unpack fails (no packfiles), that's fine - objects are already loose
  }
  
  // Alternative: ensure packfiles are indexed and accessible
  // Run git gc --no-prune to ensure packfiles are properly indexed
  try {
    execSync('git gc --no-prune --quiet', { cwd: repo.path, stdio: 'pipe' })
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
  // Checkout our branch
  execSync(`git checkout "${ours}"`, { cwd: repo.path, stdio: 'pipe' })
  
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
    // Attempt merge
    execSync(`git merge ${mergeArgs.join(' ')} "${theirs}"`, {
      cwd: repo.path,
      stdio: 'pipe',
    })

    // Merge succeeded
    const oid = execSync('git rev-parse HEAD', { cwd: repo.path, encoding: 'utf-8' }).trim()
    const tree = execSync('git rev-parse "HEAD^{tree}"', { cwd: repo.path, encoding: 'utf-8' }).trim()
    const commitMessage = execSync('git log -1 --format=%s', { cwd: repo.path, encoding: 'utf-8' }).trim()
    const parents = execSync('git log -1 --format=%P', { cwd: repo.path, encoding: 'utf-8' })
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    return {
      oid,
      tree,
      message: commitMessage,
      parent: parents,
      hasConflicts: false,
    }
  } catch (error: any) {
    // Check if merge failed due to conflicts
    const statusOutput = execSync('git status --porcelain', {
      cwd: repo.path,
      encoding: 'utf-8',
    })

    // Check for unmerged files (conflicts)
    const unmergedFiles = execSync('git diff --name-only --diff-filter=U', {
      cwd: repo.path,
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    if (unmergedFiles.length > 0) {
      hasConflicts = true
      conflictFiles.push(...unmergedFiles)

      if (options.abortOnConflict !== false) {
        // Abort the merge
        execSync('git merge --abort', { cwd: repo.path, stdio: 'pipe' })
      } else {
        // Merge is in progress with conflicts
        // Get the merge commit OID (if it exists)
        try {
          const mergeHead = execSync('git rev-parse MERGE_HEAD', {
            cwd: repo.path,
            encoding: 'utf-8',
          }).trim()
          const ourOid = execSync('git rev-parse HEAD', { cwd: repo.path, encoding: 'utf-8' }).trim()
          const tree = execSync('git write-tree', { cwd: repo.path, encoding: 'utf-8' }).trim()

          return {
            oid: ourOid, // Current HEAD (merge not completed)
            tree,
            hasConflicts: true,
            conflictFiles,
          }
        } catch {
          // Merge head doesn't exist, return current state
          const oid = execSync('git rev-parse HEAD', { cwd: repo.path, encoding: 'utf-8' }).trim()
          const tree = execSync('git write-tree', { cwd: repo.path, encoding: 'utf-8' }).trim()

          return {
            oid,
            tree,
            hasConflicts: true,
            conflictFiles,
          }
        }
      }
    }

    // Re-throw if it's not a conflict error
    throw error
  }

  // This should not be reached, but TypeScript needs it
  throw new Error('Merge failed unexpectedly')
}

/**
 * Get the tree OID for a commit
 * @param repo - Test repository
 * @param ref - Commit reference (branch, tag, or OID)
 * @returns Tree OID
 */
export function getTreeOid(repo: TestRepo, ref: string): string {
  return execSync(`git rev-parse "${ref}^{tree}"`, { cwd: repo.path, encoding: 'utf-8' }).trim()
}

/**
 * Get the commit OID for a reference
 * @param repo - Test repository
 * @param ref - Reference (branch, tag, or OID)
 * @returns Commit OID
 */
export function getCommitOid(repo: TestRepo, ref: string): string {
  return execSync(`git rev-parse "${ref}"`, { cwd: repo.path, encoding: 'utf-8' }).trim()
}

/**
 * Read conflict markers from a file
 * @param repo - Test repository
 * @param filepath - Path to the file
 * @returns File content with conflict markers
 */
export function getConflictMarkers(repo: TestRepo, filepath: string): string {
  const fullPath = join(repo.path, filepath)
  return readFileSync(fullPath, 'utf-8')
}

/**
 * Check if a merge is in progress
 * @param repo - Test repository
 * @returns True if merge is in progress
 */
export function isMergeInProgress(repo: TestRepo): boolean {
  try {
    execSync('git rev-parse --verify MERGE_HEAD', { cwd: repo.path, stdio: 'pipe' })
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
        cwd: repo.path,
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
  try {
    const output = execSync('git config --list --local', {
      cwd: repo.path,
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

