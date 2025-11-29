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

  it('param:missing-author-fastForward', async () => {
        const { repo, fs, dir, gitdir } = await makeFixture('test-merge')

        const originalOid = await resolveRef({ repo, ref: 'main' })
        const desiredOid = await resolveRef({ repo, ref: 'newest' })

        // Fast-forward merge should not require author
        // Note: dryRun requires author, so we use noUpdateBranch instead
        const result = await merge({
        repo,
        ours: 'main',
        theirs: 'newest',
        fastForwardOnly: true,
        fastForward: true,
        noUpdateBranch: true, // Don't update branch to match original test behavior
        })

        assert.ok(result, 'Fast-forward merge should succeed without author')
        assert.strictEqual(result.fastForward, true)
        assert.strictEqual(result.oid, desiredOid)

        // Verify branch wasn't updated
        const currentOid = await resolveRef({ repo, ref: 'main' })
        assert.strictEqual(currentOid, originalOid)
        })

  it('param:missing-author-fastForward-with-author-and-dryRun', async () => {
        const { repo, fs, dir, gitdir } = await makeFixture('test-merge')

        const originalOid = await resolveRef({ repo, ref: 'main' })
        const desiredOid = await resolveRef({ repo, ref: 'newest' })

        // Fast-forward merge with author and dryRun should work
        const result = await merge({
        repo,
        ours: 'main',
        theirs: 'newest',
        fastForwardOnly: true,
        fastForward: true,
        dryRun: true, // dryRun requires author
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        })

        assert.ok(result, 'Fast-forward merge should succeed with author and dryRun')
        assert.strictEqual(result.fastForward, true)
        assert.strictEqual(result.oid, desiredOid)

        // Verify branch wasn't updated (dryRun doesn't update branch)
        const currentOid = await resolveRef({ repo, ref: 'main' })
        assert.strictEqual(currentOid, originalOid)
        })
})
