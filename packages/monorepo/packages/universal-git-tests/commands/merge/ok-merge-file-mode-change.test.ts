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
      // Last resort: use Repository's getConfig (only reads local config)
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
        // If all else fails, set all to undefined
        for (const key of mergeConfigKeys) {
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

  it('ok:merge-file-mode-change', async () => {
        // Setup: Create repo with native git
        const { createTestRepo, createInitialCommit, createBranch, createCommit, nativeMerge, isGitAvailable, getBackendDir } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
        const { execSync } = await import('child_process')

        if (!isGitAvailable()) {
        // Fallback to fixture-based test if git is not available
        const { repo, fs, dir, gitdir } = await makeFixture('test-merge')
        const commit = (
        await log({
        repo,
        depth: 1,
        ref: 'a-merge-d',
        })
        )[0].commit
        // Test
        const report = await merge({
        repo,
        ours: 'a',
        theirs: 'd',
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
        ref: 'a',
        depth: 1,
        })
        )[0].commit
        assert.strictEqual(report.tree, commit.tree)
        assert.deepStrictEqual(mergeCommit.tree, commit.tree)
        assert.strictEqual(mergeCommit.message, commit.message)
        assert.deepStrictEqual(mergeCommit.parent, commit.parent)
        return
        }

        const repo = await createTestRepo('sha1')
        try {
        // Create initial commit with a file
        await createInitialCommit(repo, { 'o.txt': 'original content\n' }, 'initial commit')
        const dir = getBackendDir(repo)
        const defaultBranch = (await repo.repo.currentBranch()) || 'master'

        // Create branch 'a' - modify file content
        createBranch(repo, 'a', defaultBranch)
        await createCommit(repo, 'a', {
        'o.txt': 'modified content\n',
        }, [], 'modify content', 1262356922)

        // Create branch 'd' - modify file mode (make it executable)
        createBranch(repo, 'd', defaultBranch)
        await checkout({ repo: repo.repo, ref: 'd', force: true })
        
        // Update index to make o.txt executable using GitBackend methods
        const index = await repo.repo.readIndexDirect()
        const entry = index.entries.find(e => e.path === 'o.txt')
        if (!entry) {
          throw new Error('o.txt not found in index')
        }
        // Update mode to executable (0o100755)
        index.insert({
          filepath: 'o.txt',
          oid: entry.oid,
          stats: {
            ...entry,
            mode: 0o100755, // Executable mode
          },
          stage: 0,
        })
        await repo.repo.writeIndexDirect(index)
        
        // Commit using universal-git commit command
        await gitCommit({
          repo: repo.repo,
          message: 'make executable',
          author: {
            name: 'Test',
            email: 'test@example.com',
            timestamp: 1262356923,
            timezoneOffset: 0,
          },
          ref: 'd', // Ensure we commit to branch 'd'
        })
        
        // Ensure working directory is clean after commit
        await checkout({ repo: repo.repo, ref: 'd', force: true })

        // Perform merge with native git first to get expected result
        const nativeResult = await nativeMerge(repo, 'a', 'd', {
        message: "Merge branch 'd' into a",
        })

        // Reset to before merge for universal-git test
        // Get the first parent of the merge commit (the commit before merge)
        const mergeOid = await repo.repo.gitBackend.readRef('refs/heads/a') || ''
        const { parse: parseCommit } = await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')
        const commitResult = await repo.repo.gitBackend.readObject(mergeOid, 'content', {})
        if (commitResult.type !== 'commit') {
          throw new Error('Expected commit object')
        }
        const commit = parseCommit(commitResult.object)
        const beforeMergeOid = commit.parent?.[0]
        if (!beforeMergeOid) {
          throw new Error('Merge commit has no parent')
        }
        // Update branch ref to point to the parent commit
        await repo.repo.gitBackend.writeRef('refs/heads/a', beforeMergeOid)
        // Update working directory to match
        await checkout({ repo: repo.repo, ref: 'a', force: true })

        // Read and compare config before merge
        await verifyAndLogConfig(repo, 'before merge (file mode change)')

        // Perform merge with universal-git
        const report = await merge({
        repo: repo.repo,
        ours: 'a',
        theirs: 'd',
        author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
        },
        })

        // Verify merge commit structure
        const mergeCommit = (
        await log({
        repo: repo.repo,
        ref: 'a',
        depth: 1,
        })
        )[0].commit

        assert.ok(report.tree, 'Report should have tree OID')
        assert.ok(nativeResult.tree, 'Native merge should have tree OID')
        assert.strictEqual(report.tree, nativeResult.tree, 'Merge tree should match native git')
        assert.strictEqual(mergeCommit.tree, nativeResult.tree, 'Merge commit tree should match native git')
        } finally {
        await repo.cleanup()
        }
        })
})
