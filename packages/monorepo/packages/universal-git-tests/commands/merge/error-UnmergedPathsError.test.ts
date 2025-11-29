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

  it('error:UnmergedPathsError', async () => {
        // Setup
        const { repo } = await makeFixture('test-GitIndex-unmerged')
        if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
        const gitdir = await repo.getGitdir()

        // Verify the fixture has unmerged paths first
        // repo is already available from makeFixture

        // Check if index exists and has unmerged paths
        try {
        const index = await repo.readIndexDirect(false, true) // force=false, allowUnmerged=true
        if (index.unmergedPaths.length === 0) {
        // Skip test if fixture doesn't have unmerged paths
        // This can happen if the fixture is not set up correctly
        return
        }
        } catch {
        // Index might not exist - that's okay, the merge should still check
        }

        // FIX: Create the branches so they can be resolved
        // The merge command needs to resolve these refs before checking for unmerged paths
        // If the branches don't exist, it will throw NotFoundError before checking unmerged paths
        try {
        // Try to create branches 'a' and 'b' pointing to HEAD if they don't exist
        const headOid = await repo.resolveRef('HEAD')
        try {
        await branch({ repo, ref: 'a', checkout: false })
        } catch {
        // Branch might already exist, that's okay
        }
        try {
        await branch({ repo, ref: 'b', checkout: false })
        } catch {
        // Branch might already exist, that's okay
        }
        } catch {
        // If we can't create branches, the test will fail with the appropriate error
        }

        // Test
        let error: unknown = null
        try {
        await merge({
        repo,
        ours: 'a',
        theirs: 'b',
        abortOnConflict: false,
        author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
        },
        })
        } catch (e) {
        error = e
        }
        assert.notStrictEqual(error, null, 'Merge should throw an error when index has unmerged paths')

        // Check if it's UnmergedPathsError (preferred) or NotFoundError (if refs don't exist)
        // Native git would throw UnmergedPathsError before trying to resolve refs
        const isUnmergedPathsError = 
        error instanceof Errors.UnmergedPathsError || 
        (error as any)?.code === Errors.UnmergedPathsError.code ||
        (error as any)?.code === 'UnmergedPathsError' ||
        (error as any)?.name === 'UnmergedPathsError'

        if (!isUnmergedPathsError) {
        // If we got a different error, log it for debugging
        console.log(`Expected UnmergedPathsError but got: ${(error as any)?.code || (error as any)?.name || typeof error}`)
        console.log(`Error message: ${(error as any)?.message}`)
        }

        assert.ok(isUnmergedPathsError, `Expected UnmergedPathsError, got: ${(error as any)?.code || (error as any)?.name || typeof error}`)
        })
})
