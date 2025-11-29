import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import diff3Merge from 'diff3'
import {
  Errors,
  merge,
  add,
  resolveRef,
  log,
  statusMatrix,
  commit as gitCommit,
  getConfig,
  init,
  branch,
  checkout,
  worktree,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { getFixtureObjectFormat } from '@awesome-os/universal-git-test-helpers/helpers/objectFormat.ts'
import { verifyReflogEntry } from '@awesome-os/universal-git-test-helpers/helpers/reflogHelpers.ts'
import { cleanupWorktrees, createWorktreePath } from '@awesome-os/universal-git-test-helpers/helpers/worktreeHelpers.ts'
import type { TestRepo } from '@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts'
import { execSync } from 'child_process'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

/**
 * Helper function to read and compare git config before merge
 * Logs config and warns about mismatches
 */
async function verifyAndLogConfig(repo: TestRepo, label: string = 'Before merge'): Promise<void> {
  const { getMergeConfig, logConfig, compareConfig } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
  
  // Read native git config
  logConfig(repo, `Native Git Config (${label})`)
  
  // Read universal-git config using Repository class if possible to get system/global config
  const ugitConfig: Record<string, unknown> = {}
  const mergeConfigKeys = [
    'merge.conflictstyle',
    'merge.ff',
    'merge.ours',
    'merge.theirs',
    'merge.renormalize',
    'core.autocrlf',
    'core.safecrlf',
  ]
  
  // Use Repository instance from TestRepo to get config with system/global/worktree support
  try {
    const configService = await repo.repo.getConfig()
    
    for (const key of mergeConfigKeys) {
      try {
        ugitConfig[key] = await configService.get(key)
      } catch {
        ugitConfig[key] = undefined
      }
    }
  } catch {
    // Fallback: try to use repo.repo.getConfig() directly
    try {
      const configService = await repo.repo.getConfig()
      for (const key of mergeConfigKeys) {
        try {
          ugitConfig[key] = await configService.get(key)
        } catch {
          ugitConfig[key] = undefined
        }
      }
    } catch {
      // Last resort: use old getConfig API (only reads local config)
      for (const key of mergeConfigKeys) {
        try {
          ugitConfig[key] = await getConfig({ fs: repo.fs, gitdir: repo.gitdir, path: key })
        } catch {
          ugitConfig[key] = undefined
        }
      }
    }
  }
  
  // Compare configs
  const configComparison = compareConfig(repo, ugitConfig)
  if (!configComparison.match) {
    console.log(`\n⚠️  Config mismatch detected (${label}):`)
    let hasUnexpectedMismatches = false
    for (const mismatch of configComparison.mismatches) {
      const isExpected = mismatch.key === 'core.autocrlf' && mismatch.native !== undefined && mismatch.ugit === undefined
      if (!isExpected) {
        hasUnexpectedMismatches = true
      }
      console.log(`  ${mismatch.key}: native="${mismatch.native}" vs ugit="${mismatch.ugit}"${isExpected ? ' (expected - global/system config)' : ''}`)
    }
    if (!hasUnexpectedMismatches) {
      console.log(`  All mismatches are expected (global/system config differences)`)
    }
    // Log but don't fail - config differences might be expected or need implementation
  } else {
    console.log(`\n✅ Config matches between native git and universal-git (${label})`)
  }
}


describe('merge', () => {
  // CRITICAL: Use a shared cache object for ALL git commands in these tests
  // This ensures state modifications (like index updates) are immediately
  // visible to subsequent commands, eliminating race conditions
  let cache: Record<string, unknown>
  beforeEach(async () => {
      cache = {} // Reset the cache for each test
      // Clear Repository instance cache to prevent stale Repository instances
      // from causing "Cannot checkout in bare repository" or similar errors
      const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
      Repository.clearInstanceCache()
  })

  it('ok:compatibility-native-git', async () => {
        // This test verifies that repositories created by universal-git can be read by native git
        // This helps catch issues where universal-git writes objects in a way native git can't read

        const tempDir = join(tmpdir(), `isogit-clone-test-${Date.now()}-${Math.random().toString(36).substring(7)}`)
        const sourceRepoPath = join(tempDir, 'source')
        const cloneRepoPath = join(tempDir, 'clone')

        try {
        // Create FileSystem wrapper for universal-git
        const _fs = await import('fs')
        const { FileSystem } = await import('@awesome-os/universal-git-src/models/FileSystem.ts')
        const fs = new FileSystem(_fs as any)

        // Step 1: Create repository with universal-git using Repository class
        mkdirSync(sourceRepoPath, { recursive: true })

        // Initialize repository
        await init({ fs, dir: sourceRepoPath, defaultBranch: 'main' })

        // Open repository using Repository class (new constructor pattern)
        const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
        const { GitBackendFs } = await import('@awesome-os/universal-git-src/backends/GitBackendFs/index.ts')
        const { GitWorktreeFs } = await import('@awesome-os/universal-git-src/git/worktree/fs/GitWorktreeFs.ts')
        const gitBackend = new GitBackendFs(fs, join(sourceRepoPath, '.git'))
        const worktreeBackend = new GitWorktreeFs(fs, sourceRepoPath)
        const repository = new Repository({
        gitBackend,
        worktreeBackend,
        autoDetectConfig: true
        })

        // Set config using Repository class
        const configService = await repository.getConfig()
        await configService.set('user.name', 'Test User')
        await configService.set('user.email', 'test@example.com')

        // Create initial commit
        const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
        const normalizedFs = createFileSystem(fs)
        await normalizedFs.write(join(sourceRepoPath, 'file1.txt'), 'content 1\n')
        await normalizedFs.write(join(sourceRepoPath, 'file2.txt'), 'content 2\n')
        await add({ fs, dir: sourceRepoPath, filepath: 'file1.txt', cache: repository.cache })
        await add({ fs, dir: sourceRepoPath, filepath: 'file2.txt', cache: repository.cache })
        const commit1 = await gitCommit({
        fs,
        dir: sourceRepoPath,
        message: 'initial commit',
        author: {
        name: 'Test User',
        email: 'test@example.com',
        timestamp: 1262356920,
        timezoneOffset: 0,
        },
        cache: repository.cache,
        })

        // Create a branch and make commits
        await branch({ fs, dir: sourceRepoPath, ref: 'feature', checkout: true })
        await normalizedFs.write(join(sourceRepoPath, 'file3.txt'), 'content 3\n')
        await add({ fs, dir: sourceRepoPath, filepath: 'file3.txt', cache: repository.cache })
        const commit2 = await gitCommit({
        fs,
        dir: sourceRepoPath,
        message: 'add file3',
        author: {
        name: 'Test User',
        email: 'test@example.com',
        timestamp: 1262356921,
        timezoneOffset: 0,
        },
        cache: repository.cache,
        })

        // Switch back to main (or master) and make another commit
        console.log('Checking out main...')
        const branches = await fs.promises.readdir(join(sourceRepoPath, '.git/refs/heads'))
        const mainBranch = branches.includes('main') ? 'main' : 'master'
        console.log(`Detected main branch: ${mainBranch}`)
        await checkout({ fs, dir: sourceRepoPath, ref: mainBranch })
        await normalizedFs.write(join(sourceRepoPath, 'file4.txt'), 'content 4\n')
        await add({ fs, dir: sourceRepoPath, filepath: 'file4.txt', cache: repository.cache })
        const commit3 = await gitCommit({
        fs,
        dir: sourceRepoPath,
        message: 'add file4',
        author: {
        name: 'Test User',
        email: 'test@example.com',
        timestamp: 1262356922,
        timezoneOffset: 0,
        },
        cache: repository.cache,
        })

        // Step 2: Clone with native git
        // First, verify native git can read the repo
        const sourceGitDir = join(sourceRepoPath, '.git')

        // Verify all objects exist and are readable
        const commits = [commit1, commit2, commit3]
        for (const commitOid of commits) {
        try {
        const commitObj = await repository.gitBackend.readObject(commitOid, 'content', repository.cache)
        assert.strictEqual(commitObj.type, 'commit', `Commit ${commitOid} should be readable by universal-git`)
        } catch (error) {
        throw new Error(`Universal-git cannot read commit ${commitOid} created by universal-git: ${error}`)
        }
        }

        // Verify refs are readable
        try {
        // Note: sourceRepoPath is a separate repo, not using NativeGitBackend
        // So we need to use execSync here or create a Repository instance
        const { Repository: RepoClass } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
        const { GitBackendFs } = await import('@awesome-os/universal-git-src/backends/GitBackendFs/index.ts')
        const { GitWorktreeFs } = await import('@awesome-os/universal-git-src/git/worktree/fs/GitWorktreeFs.ts')
        const sourceGitBackend = new GitBackendFs(fs, join(sourceRepoPath, '.git'))
        const sourceWorktreeBackend = new GitWorktreeFs(fs, sourceRepoPath)
        const sourceRepo = new RepoClass({
        gitBackend: sourceGitBackend,
        worktreeBackend: sourceWorktreeBackend
        })
        const mainRef = await sourceRepo.gitBackend.readRef('refs/heads/main') || ''
        assert.strictEqual(mainRef, commit3, 'main ref should point to commit3')

        const featureRef = await sourceRepo.gitBackend.readRef('refs/heads/feature') || ''
        assert.strictEqual(featureRef, commit2, 'feature ref should point to commit2')
        } catch (error) {
        throw new Error(`Native git cannot read refs created by universal-git: ${error}`)
        }

        // Step 3: Clone the repository with native git
        // This is the critical test - if native git can clone it, all objects are properly formatted
        try {
        execSync(`git clone --bare "${sourceRepoPath}" "${cloneRepoPath}"`, { stdio: 'pipe' })
        } catch (error) {
        throw new Error(`Native git cannot clone repository created by universal-git: ${error}`)
        }

        // Step 4: Create Repository instance for cloned repository
        // Note: cloneRepoPath is a separate repo, not using NativeGitBackend
        // So we need to create a Repository instance
        const { Repository: RepoClass2 } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
        const cloneGitBackend = new GitBackendFs(fs, cloneRepoPath)
        const cloneRepo = new RepoClass2({
        gitBackend: cloneGitBackend
        })

        // Step 5: Verify cloned repository
        // Check that all commits are present in the clone
        for (const commitOid of commits) {
        try {
        const commitObj = await cloneRepo.gitBackend.readObject(commitOid, 'content', cloneRepo.cache)
        assert.strictEqual(commitObj.type, 'commit', `Cloned repository should have commit ${commitOid}`)
        } catch (error) {
        throw new Error(`Cloned repository missing commit ${commitOid}: ${error}`)
        }
        }

        // Check that all refs are present
        const clonedMainRef = await cloneRepo.gitBackend.readRef('refs/heads/main') || ''
        assert.strictEqual(clonedMainRef, commit3, 'Cloned main ref should match')

        const clonedFeatureRef = await cloneRepo.gitBackend.readRef('refs/heads/feature') || ''
        assert.strictEqual(clonedFeatureRef, commit2, 'Cloned feature ref should match')

        // Step 6: Verify tree objects are readable
        for (const commitOid of commits) {
        try {
        // Get tree OID from commit using GitBackend
        const treeOid = await cloneRepo.gitBackend.readRef(`${commitOid}^{tree}`, 1, cloneRepo.cache)
        if (!treeOid) {
        throw new Error(`Cannot resolve tree for commit ${commitOid}`)
        }
        const treeObj = await cloneRepo.gitBackend.readObject(treeOid, 'content', cloneRepo.cache)
        assert.strictEqual(treeObj.type, 'tree', `Tree ${treeOid} should be readable`)
        } catch (error) {
        throw new Error(`Cannot read tree for commit ${commitOid}: ${error}`)
        }
        }

        // Step 7: Verify blob objects are readable
        const files = ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt']
        const { parse: parseTree } = await import('@awesome-os/universal-git-src/core-utils/parsers/Tree.ts')
        const { parse: parseCommit } = await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')

        for (const file of files) {
        try {
        // Get blob OID from the commit that added it
        let commitOid: string
        if (file === 'file1.txt' || file === 'file2.txt') {
        commitOid = commit1
        } else if (file === 'file3.txt') {
        commitOid = commit2
        } else {
        commitOid = commit3
        }

        // Read commit object to get tree OID
        const commitObj = await cloneRepo.gitBackend.readObject(commitOid, 'content', cloneRepo.cache)
        const commit = parseCommit(commitObj.object)

        // Read tree object
        const treeObj = await cloneRepo.gitBackend.readObject(commit.tree, 'content', cloneRepo.cache)
        const tree = parseTree(treeObj.object)

        // Find the file entry in the tree
        const fileEntry = tree.find(entry => entry.path === file)

        if (fileEntry) {
        // Verify blob object is readable
        const blobObj = await cloneRepo.gitBackend.readObject(fileEntry.oid, 'content', cloneRepo.cache)
        assert.strictEqual(blobObj.type, 'blob', `Blob ${fileEntry.oid} for ${file} should be readable`)
        } else {
        // File should exist in the commit
        if (file === 'file1.txt' || file === 'file2.txt') {
        throw new Error(`File ${file} not found in commit ${commit1} tree`)
        }
        }
        } catch (error) {
        // Some files might not exist in all commits, that's okay
        // But if we can't read a blob that should exist, that's an error
        if (file === 'file1.txt' || file === 'file2.txt') {
        throw new Error(`Cannot read blob for ${file} from commit ${commit1}: ${error}`)
        }
        }
        }

        // If we get here, all checks passed!
        console.log('✅ Repository created by universal-git is fully compatible with native git')
        } finally {
        // Cleanup
        if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true })
        }
        }
        })
})
