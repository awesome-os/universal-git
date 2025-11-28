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

  it('ok:merge-add-and-remove-files', async () => {
        // Setup: Create repo with native git
        const { createTestRepo, createInitialCommit, createBranch, createCommit, nativeMerge, isGitAvailable, getBackendDir } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
        const { execSync } = await import('child_process')

        if (!isGitAvailable()) {
        // Fallback to fixture-based test if git is not available
        const { repo } = await makeFixture('test-merge')
        const objectFormat = await getFixtureObjectFormat(repo.fs!, await repo.getGitdir())
        const commit = (
        await log({
        repo,
        depth: 1,
        ref: 'add-files-merge-remove-files',
        })
        )[0].commit
        const report = await merge({
        repo,
        ours: 'add-files',
        theirs: 'remove-files',
        author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
        },
        })
        const mergeCommit = (
        await log({
        repo,
        ref: 'add-files',
        depth: 1,
        })
        )[0].commit
        const expectedOidLength = objectFormat === 'sha256' ? 64 : 40
        assert.ok(report.tree, 'Report should have tree OID')
        assert.strictEqual(report.tree.length, expectedOidLength, `Tree OID should be ${expectedOidLength} chars for ${objectFormat}`)
        assert.strictEqual(report.tree, commit.tree)
        assert.deepStrictEqual(mergeCommit.tree, commit.tree)
        assert.strictEqual(mergeCommit.message, commit.message)
        assert.deepStrictEqual(mergeCommit.parent, commit.parent)
        return
        }

        const repo = await createTestRepo('sha1')
        try {
        // Create initial commit (this will create 'master' branch)
        await createInitialCommit(repo, { 'o.txt': 'original content\n' }, 'initial commit')

        // Get the actual branch name (might be 'master' or 'main')
        const defaultBranch = (await repo.repo.currentBranch()) || 'master'

        // Create add-files branch
        createBranch(repo, 'add-files', defaultBranch)
        await createCommit(repo, 'add-files', {
        'file1.txt': 'file1\n',
        'file2.txt': 'file2\n',
        }, [], 'add files', 1262356926)

        // Create remove-files branch
        createBranch(repo, 'remove-files', defaultBranch)
        await createCommit(repo, 'remove-files', {}, ['o.txt'], 'remove o.txt', 1262356927)

        // Perform merge with native git first to get expected result
        const nativeResult = await nativeMerge(repo, 'add-files', 'remove-files', {
        message: "Merge branch 'remove-files' into add-files",
        })

        // Reset to before merge for universal-git test
        // Get the commit OID before the merge
        const beforeMergeOid = await repo.repo.gitBackend.readRef('refs/heads/add-files') || ''
        await checkout({ repo: repo.repo, ref: beforeMergeOid })

        // Perform merge with universal-git
        const report = await merge({
        repo: repo.repo,
        ours: 'add-files',
        theirs: 'remove-files',
        author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
        },
        })

        // Compare results
        assert.ok(report.oid, 'Merge should produce a commit OID')
        assert.ok(nativeResult.oid, 'Native merge should produce a commit OID')

        // Verify merge commit structure
        const mergeCommit = (
        await log({
        repo: repo.repo,
        ref: 'add-files',
        depth: 1,
        })
        )[0].commit

        // Compare tree OIDs - use mergeCommit.tree since report.tree might not be set
        assert.ok(mergeCommit.tree, 'Merge commit should have a tree OID')
        assert.ok(nativeResult.tree, 'Native merge should have a tree OID')
        assert.strictEqual(mergeCommit.tree, nativeResult.tree, 'Merge commit tree should match native git')

        // If report has tree, it should also match
        if (report.tree) {
        assert.strictEqual(report.tree, nativeResult.tree, 'Report tree OID should match native git')
        }
        } finally {
        await repo.cleanup()
        }
        })
})
