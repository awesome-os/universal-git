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
          ugitConfig[key] = await getConfig({ fs: fs, gitdir: repo.gitdir, path: key })
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

  it('behavior:dryRun-delete-files', async () => {
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
        ref: 'delete-first-half-merge-delete-second-half',
        })
        )[0]
        const originalCommit = (
        await log({
        repo,
        ref: 'delete-first-half',
        depth: 1,
        })
        )[0]
        const report = await merge({
        repo,
        ours: 'delete-first-half',
        theirs: 'delete-second-half',
        author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
        },
        dryRun: true,
        })
        assert.strictEqual(report.tree, commit.commit.tree)
        const notMergeCommit = (
        await log({
        repo,
        ref: 'delete-first-half',
        depth: 1,
        })
        )[0]
        assert.strictEqual(notMergeCommit.oid, originalCommit.oid)
        if (!report.oid) throw new Error('type error')
        assert.strictEqual(
        await fs!.exists(
        `${gitdir}/objects/${report.oid.slice(0, 2)}/${report.oid.slice(2)}`
        ),
        false
        )
        return
        }

        const repo = await createTestRepo('sha1')
        try {
        // Create initial commit (empty repo - create a dummy file)
        await createInitialCommit(repo, { '.gitkeep': '' }, 'initial commit')
        const defaultBranch = (await repo.repo.currentBranch()) || 'master'

        // Create delete-first-half branch with files 1-10, then delete 1-5
        createBranch(repo, 'delete-first-half', defaultBranch)
        const files1: Record<string, string> = {}
        for (let i = 1; i <= 10; i++) {
        files1[`file${i}.txt`] = `content ${i}\n`
        }
        await createCommit(repo, 'delete-first-half', files1, [], 'add files 1-10', 1262356928)
        const filesToDelete1 = Array.from({ length: 5 }, (_, i) => `file${i + 1}.txt`)
        await createCommit(repo, 'delete-first-half', {}, filesToDelete1, 'delete first half', 1262356929)

        // Create delete-second-half branch with files 1-10, then delete 6-10
        createBranch(repo, 'delete-second-half', defaultBranch)
        const files2: Record<string, string> = {}
        for (let i = 1; i <= 10; i++) {
        files2[`file${i}.txt`] = `content ${i}\n`
        }
        await createCommit(repo, 'delete-second-half', files2, [], 'add files 1-10', 1262356930)
        const filesToDelete2 = Array.from({ length: 5 }, (_, i) => `file${i + 6}.txt`)
        await createCommit(repo, 'delete-second-half', {}, filesToDelete2, 'delete second half', 1262356931)

        // Get original commit OID
        const originalCommitOid = await repo.repo.gitBackend.readRef('refs/heads/delete-first-half') || ''

        // Perform merge with native git to get expected tree
        const nativeResult = await nativeMerge(repo, 'delete-first-half', 'delete-second-half', {
        message: "Merge branch 'delete-second-half' into delete-first-half",
        })

        // Reset to before merge
        await checkout({ repo: repo.repo, ref: originalCommitOid })

        // Read and compare config before merge
        await verifyAndLogConfig(repo, 'before merge (dryRun)')

        // Perform merge with universal-git (dryRun)
        const report = await merge({
        repo: repo.repo,
        ours: 'delete-first-half',
        theirs: 'delete-second-half',
        author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
        },
        dryRun: true,
        })

        // Compare tree OIDs
        assert.ok(report.tree, 'Report should have tree OID')
        assert.ok(nativeResult.tree, 'Native merge should have tree OID')

        // Debug: show what's in each tree if they don't match
        if (report.tree !== nativeResult.tree) {
        console.log(`\nTree OID mismatch:`)
        console.log(`  Universal-git: ${report.tree}`)
        console.log(`  Native git:     ${nativeResult.tree}`)

        // Show files in native git tree
        const headOid = await repo.repo.gitBackend.readRef('HEAD') || ''
        const headCommit = await repo.repo.gitBackend.readObject(headOid, 'content', repo.repo.cache)
        const TreeParserModule = await import('@awesome-os/universal-git-src/core-utils/parsers/Tree.ts')
        const parseTree = TreeParserModule.parse
        const parseCommit = (await import('@awesome-os/universal-git-src/core-utils/parsers/Commit.ts')).parse
        const commit = parseCommit(headCommit.object as UniversalBuffer)
        const nativeTree = parseTree((await repo.repo.gitBackend.readObject(commit.tree, 'content', repo.repo.cache)).object as UniversalBuffer)
        console.log(`\nNative git merged tree contents:`)
        for (const entry of nativeTree) {
        console.log(`${Number(entry.mode).toString(8).padStart(6, '0')} ${entry.type} ${entry.oid}\t${entry.path}`)
        }

        // Show files in universal-git tree
        const isoTreeResult = await repo.repo.gitBackend.readObject(report.tree, 'content', repo.repo.cache)
        const isoTree = parseTree(isoTreeResult.object as UniversalBuffer)
        console.log(`\nUniversal-git merged tree contents:`)
        for (const entry of isoTree) {
        console.log(`${Number(entry.mode).toString(8).padStart(6, '0')} ${entry.type} ${entry.oid}\t${entry.path}`)
        }
        }

        assert.strictEqual(report.tree, nativeResult.tree, 'Tree OIDs should match native git')

        // Verify branch hasn't been moved (dryRun)
        const currentOid = await repo.repo.gitBackend.readRef('refs/heads/delete-first-half') || ''
        assert.strictEqual(currentOid, originalCommitOid, 'Branch should not move in dryRun')

        // Verify no commit object was created (dryRun)
        if (report.oid) {
        const exists = await repo.repo.gitBackend.hasLooseObject(report.oid)
        assert.strictEqual(exists, false, 'Commit object should not exist in dryRun')
        }
        } finally {
        await repo.cleanup()
        }
        })
})
