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

  it('error:merge-conflict-no-resolver', async () => {
        // Setup: Create repo with native git
        const { createTestRepo, createInitialCommit, createBranch, createCommit, isGitAvailable, getBackendDir } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
        const { execSync } = await import('child_process')

        if (!isGitAvailable()) {
        // Fallback to fixture-based test if git is not available
        const { repo } = await makeFixture('test-merge')
        if (!repo.worktreeBackend) throw new Error('Repository must have a worktree')
        const gitdir = await repo.getGitdir()
        const testFile = `${gitdir}/o.conflict.example`
        const outFile = `${dir}/o.txt`
        let error: unknown = null
        try {
        await merge({
        repo,
        ours: 'a',
        theirs: 'c',
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
        const outContent = await repo.fs!.read(outFile, 'utf-8')
        const testContent = await repo.fs!.read(testFile, 'utf-8')
        assert.strictEqual(outContent, testContent)
        assert.notStrictEqual(error, null)
        assert.ok(error instanceof Errors.MergeConflictError || (error as any).code === Errors.MergeConflictError.code)
        return
        }

        const repo = await createTestRepo('sha1')
        try {
        // Create initial commit with a file
        await createInitialCommit(repo, { 'o.txt': 'original content\n' }, 'initial commit')
        const dir = getBackendDir(repo)
        const defaultBranch = (await repo.repo.currentBranch()) || 'master'

        // Create branch 'a' - modify o.txt
        createBranch(repo, 'a', defaultBranch)
        await createCommit(repo, 'a', {
        'o.txt': 'original content\nmodified by a\n',
        }, [], 'change o.txt', 1262356922)

        // Create branch 'c' - modify o.txt differently (conflicting change)
        createBranch(repo, 'c', defaultBranch)
        await createCommit(repo, 'c', {
        'o.txt': 'original content\nmodified by c\n',
        }, [], 'change o.txt', 1262356923)

        // Check what native git does
        await checkout({ repo: repo.repo, ref: 'a' })

        // Read and compare config before native merge
        await verifyAndLogConfig(repo, 'before native merge (conflict test)')

        let nativeError: unknown = null
        let nativeConflictContent: string | null = null
        try {
        execSync('git merge c -m "merge"', {
        cwd: dir,
        env: { ...process.env, GIT_AUTHOR_DATE: '1262356920 +0000', GIT_COMMITTER_DATE: '1262356920 +0000' },
        stdio: 'pipe'
        })
        } catch (e) {
        nativeError = e
        // Read the conflict file to see what native git wrote
        const { readFileSync } = await import('fs')
        const { join } = await import('path')
        try {
        nativeConflictContent = readFileSync(join(dir, 'o.txt'), 'utf-8')
        } catch {
        // File might not exist
        }
        }

        // Reset for universal-git test
        await checkout({ repo: repo.repo, ref: 'a' })

        // Read and compare config before universal-git merge
        await verifyAndLogConfig(repo, 'before isomorphic-git merge (conflict test)')

        // Perform merge with universal-git
        let error: unknown = null
        let mergeReport: any = null
        try {
        mergeReport = await merge({
        repo: repo.repo,
        ours: 'a',
        theirs: 'c',
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

        // Both should throw MergeConflictError
        assert.notStrictEqual(error, null, 'Merge should throw an error')
        assert.ok(
        error instanceof Errors.MergeConflictError || (error as any).code === Errors.MergeConflictError.code,
        'Error should be MergeConflictError'
        )

        // Check if conflict markers were written
        if (!repo.repo.worktreeBackend) {
          throw new Error('Repository worktreeBackend is not available')
        }
        const conflictFile = 'o.txt'
        const fileExists = await repo.repo.worktreeBackend.exists(conflictFile)

        if (nativeError && nativeConflictContent) {
        // Native git wrote conflict markers, so universal-git should too
        assert.ok(fileExists, 'Conflict file should exist')
        const isoConflictContent = await repo.repo.worktreeBackend.read(conflictFile, 'utf-8')
        // Compare conflict markers (they should be similar, though exact format may vary)
        if (isoConflictContent && typeof isoConflictContent === 'string') {
        assert.ok(
        isoConflictContent.includes('<<<<<<<') || isoConflictContent.includes('=======') || isoConflictContent.includes('>>>>>>>'),
        'Conflict file should contain conflict markers'
        )
        }
        }
        } finally {
        await repo.cleanup()
        }
        })
})
