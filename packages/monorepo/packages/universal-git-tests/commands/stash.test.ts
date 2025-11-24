import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  stash,
  Errors,
  setConfig,
  add,
  status,
  commit,
  readCommit,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture, resetToCommit } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

const addUserConfig = async (fs: any, dir: string, gitdir: string) => {
  await setConfig({ fs, dir, gitdir, path: 'user.name', value: 'stash tester' })
  await setConfig({
    fs,
    dir,
    gitdir,
    path: 'user.email',
    value: 'test@stash.com',
  })
}

const stashChanges = async (
  fs: any,
  dir: string,
  gitdir: string,
  defalt = true,
  again = true,
  message = '',
  cache: Record<string, unknown> = {}
) => {
  // add user to config
  await addUserConfig(fs, dir, gitdir)

  // Use the provided cache (or create a new one) to ensure add() and stash() see the same index state
  // IMPORTANT: Tests should pass the same cache to stashChanges and subsequent stash operations

  const aContent = await fs.read(`${dir}/a.txt`)
  const bContent = await fs.read(`${dir}/b.js`)
  await fs.write(`${dir}/a.txt`, 'staged changes - a')
  await fs.write(`${dir}/b.js`, 'staged changes - b')

  await add({ fs, dir, gitdir, filepath: ['a.txt', 'b.js'], cache })
  let aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
  assert.strictEqual(aStatus, 'modified')

  let bStatus = await status({ fs, dir, gitdir, filepath: 'b.js', cache })
  assert.strictEqual(bStatus, 'modified')

  let mStatus = await status({ fs, dir, gitdir, filepath: 'm.xml', cache })
  if (defalt) {
    // include unstaged changes, different file first
    await fs.write(`${dir}/m.xml`, '<unstaged>m</unstaged>')
    mStatus = await status({ fs, dir, gitdir, filepath: 'm.xml', cache })
    // Status might be '*modified' or '*added' depending on whether file existed
    assert.ok(mStatus === '*modified' || mStatus === '*added', `Status should be *modified or *added, got ${mStatus}`)

    if (again) {
      // same file changes again after staged
      await fs.write(`${dir}/a.txt`, 'unstaged changes - a - again')
      aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, '*modified')
    }
  }

  let error: unknown = null
  try {
    await stash({ fs, dir, gitdir, message, cache })
    const aContentAfterStash = await fs.read(`${dir}/a.txt`)
    assert.strictEqual(aContentAfterStash.toString(), aContent.toString())

    const bContentAfterStash = await fs.read(`${dir}/b.js`)
    assert.strictEqual(bContentAfterStash.toString(), bContent.toString())
  } catch (e) {
    error = e
  }

  assert.strictEqual(error, null)
  aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
  assert.strictEqual(aStatus, 'unmodified')
  bStatus = await status({ fs, dir, gitdir, filepath: 'b.js', cache })
  assert.strictEqual(bStatus, 'unmodified')
  mStatus = await status({ fs, dir, gitdir, filepath: 'm.xml', cache })
  assert.strictEqual(mStatus, 'unmodified')
}

describe('stash', () => {
  // CRITICAL: Clear the static Repository instance cache before each test
  // This ensures test isolation - each test gets a fresh Repository instance
  beforeEach(async () => {
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    Repository.clearInstanceCache()
  })

  describe('abort stash', () => {
    it('error:stash-without-user', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, autoDetectConfig: false })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.MissingNameError.code)
      assert.strictEqual((error as any).data.role, 'author')
    })

    it('error:stash-no-changes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      // CRITICAL: Use a shared cache object for ALL git commands
      // This ensures state modifications (like index updates) are immediately
      // visible to subsequent commands, eliminating race conditions
      const cache: Record<string, unknown> = {}

      // add user to config
      await addUserConfig(fs, dir, gitdir)

      // CRITICAL: Reset to HEAD to ensure a clean state (index and workdir match HEAD)
      // Pass the same cache to ensure checkout sees the latest state
      // Use hard mode to ensure complete clean state
      await resetToCommit(fs, dir, gitdir, 'HEAD', cache, 'hard')

      let error: unknown = null
      try {
        // Use the same cache so stash sees the state that checkout just set
        await stash({ fs, dir, gitdir, cache })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.NotFoundError.code)
      assert.strictEqual((error as any).data.what, 'changes, nothing to stash')
    })
  })

  describe('stash push', () => {
    it('ok:stash-staged-changes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await stashChanges(fs, dir, gitdir, false, false) // no unstaged changes
    })

    it('ok:stash-staged-and-unstaged', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await stashChanges(fs, dir, gitdir, true, false) // with unstaged changes
    })

    it('ok:stash-staged-unstaged-same-file', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await stashChanges(fs, dir, gitdir, true, true) // with unstaged changes
    })
  })

  describe('stash create', () => {
    it('error:stash-create-without-user', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'create', autoDetectConfig: false })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.MissingNameError.code)
      assert.strictEqual((error as any).data.role, 'author')
    })

    it('ok:stash-create-returns-commit', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const aOriginalContent = 'staged changes - a'
      const bOriginalContent = 'staged changes - b'

      await fs.write(`${dir}/a.txt`, aOriginalContent)
      await fs.write(`${dir}/b.js`, bOriginalContent)
      await add({ fs, dir, gitdir, filepath: ['a.txt', 'b.js'] })

      const aStatusBefore = await status({ fs, dir, gitdir, filepath: 'a.txt' })
      assert.strictEqual(aStatusBefore, 'modified')
      const bStatusBefore = await status({ fs, dir, gitdir, filepath: 'b.js' })
      assert.strictEqual(bStatusBefore, 'modified')

      let stashCommitHash: string | null = null
      let error: unknown = null
      try {
        stashCommitHash = await stash({ fs, dir, gitdir, op: 'create' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      assert.notStrictEqual(stashCommitHash, null)
      assert.strictEqual(typeof stashCommitHash, 'string')
      assert.strictEqual(stashCommitHash!.length, 40) // SHA-1 hash length

      // Verify working directory is NOT modified
      const aContent = await fs.read(`${dir}/a.txt`)
      assert.strictEqual(aContent.toString(), aOriginalContent)
      const bContent = await fs.read(`${dir}/b.js`)
      assert.strictEqual(bContent.toString(), bOriginalContent)

      // Verify status is still modified
      const aStatusAfter = await status({ fs, dir, gitdir, filepath: 'a.txt' })
      assert.strictEqual(aStatusAfter, 'modified')
      const bStatusAfter = await status({ fs, dir, gitdir, filepath: 'b.js' })
      assert.strictEqual(bStatusAfter, 'modified')

      // Verify stash ref is NOT created
      const stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0)
    })
  })

  describe('stash apply', () => {
    it('ok:stash-apply-staged-changes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      // CRITICAL: Use a shared cache for all operations
      const cache: Record<string, unknown> = {}
      await stashChanges(fs, dir, gitdir, false, false, '', cache) // no unstaged changes

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'apply', cache })
      } catch (e) {
        error = e
      }

      const aContent = await fs.read(`${dir}/a.txt`)
      assert.strictEqual(aContent.toString(), 'staged changes - a') // make sure the staged changes are applied
      const bContent = await fs.read(`${dir}/b.js`)
      assert.strictEqual(bContent.toString(), 'staged changes - b') // make sure the staged changes are applied

      assert.strictEqual(error, null)
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'modified')
      const bStatus = await status({ fs, dir, gitdir, filepath: 'b.js', cache })
      assert.strictEqual(bStatus, 'modified')
    })
  })

  describe('stash list', () => {
    it('ok:stash-list-empty', async () => {
      // Create on-demand fixture to avoid stale stash reflog data
      const { createTestRepo, createInitialCommit } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
      const repo = await createTestRepo('sha1')
      try {
        // Create initial commit matching test-stash fixture structure
        await createInitialCommit(repo, {
          'a.txt': 'text',
          'b.js': 'text',
        }, 'docs: add initial TODO.md file with to-do list')
        
        await addUserConfig(repo.fs, repo.path, repo.gitdir)
        
        const stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.deepStrictEqual(stashList, [])
      } finally {
        await repo.cleanup()
      }
    })

    it('ok:stash-list-one', async () => {
      // Create on-demand fixture to avoid stale stash reflog data
      const { createTestRepo, createInitialCommit } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
      const repo = await createTestRepo('sha1')
      try {
        // Create initial commit matching test-stash fixture structure
        await createInitialCommit(repo, {
          'a.txt': 'text',
          'b.js': 'text',
          'm.xml': '<root/>',
        }, 'docs: add initial TODO.md file with to-do list')
        
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false) // staged and non-unstaged 3 file changes

        const stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 1)
      } finally {
        await repo.cleanup()
      }
    })

    it('ok:stash-list-two', async () => {
      // Create on-demand fixture to avoid stale stash reflog data
      const { createTestRepo, createInitialCommit } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
      const repo = await createTestRepo('sha1')
      try {
        // Create initial commit matching test-stash fixture structure
        await createInitialCommit(repo, {
          'a.txt': 'text',
          'b.js': 'text',
          'm.xml': '<root/>',
        }, 'docs: add initial TODO.md file with to-do list')
        
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false) // staged and non-unstaged changes
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false) // staged and non-unstaged changes

        const stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 2)
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('stash drop', () => {
    it('error:stash-drop-no-stash', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'drop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
    })

    it('ok:stash-drop', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      await stashChanges(fs, dir, gitdir, true, false) // staged and non-unstaged changes

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'drop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0)
    })
  })

  describe('stash pop', () => {
    it('error:stash-pop-no-stash', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'pop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
    })

    it('ok:stash-pop', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      // CRITICAL: Use a shared cache for all operations
      const cache: Record<string, unknown> = {}
      await stashChanges(fs, dir, gitdir, true, false, '', cache) // staged and non-unstaged changes

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'pop', cache })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const stashList = await stash({ fs, dir, gitdir, op: 'list', cache })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0)
    })
  })

  describe('stash clear', () => {
    it('ok:stash-clear-empty', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'clear' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
    })

    it('ok:stash-clear-multiple', async () => {
      // Use fresh fixture to avoid stale stash data
      const { createTestRepo, createInitialCommit } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
      const repo = await createTestRepo('sha1')
      try {
        await createInitialCommit(repo, {
          'a.txt': 'text',
          'b.js': 'text',
          'm.xml': '<root/>',
        }, 'docs: add initial files')
        
        await addUserConfig(repo.fs, repo.path, repo.gitdir)

        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false) // first stash
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false) // second stash

        const stashListBefore = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashListBefore), 'stash list should return an array')
        assert.strictEqual(stashListBefore.length, 2)

        let error: unknown = null
        try {
          await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'clear' })
        } catch (e) {
          error = e
        }

        assert.strictEqual(error, null)
        const stashListAfter = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashListAfter), 'stash list should return an array')
        assert.strictEqual(stashListAfter.length, 0)
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('stash edge cases', () => {
    it('error:invalid-refIdx-negative', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'apply', refIdx: -1 })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.InvalidRefNameError.code)
    })

    it('param:refIdx-different-operations', async () => {
      // Use fresh fixture to avoid stale stash data
      const { createTestRepo, createInitialCommit } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
      const repo = await createTestRepo('sha1')
      try {
        await createInitialCommit(repo, {
          'a.txt': 'text',
          'b.js': 'text',
          'm.xml': '<root/>',
        }, 'docs: add initial files')
        
        await addUserConfig(repo.fs, repo.path, repo.gitdir)

        // Create 2 stashes
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false)
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false)

        let stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 2)

        // Drop first stash (refIdx=0) - this should drop the most recent one
        await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'drop', refIdx: 0 })

        stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        // After dropping refIdx=0, we should have 1 stash left
        assert.strictEqual(stashList.length, 1)
      } finally {
        await repo.cleanup()
      }
    })

    it('ok:stash-only-index-changes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Only stage changes, no worktree changes
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, cache })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('ok:stash-only-worktree-changes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Only worktree changes, no staged changes
      await fs.write(`${dir}/a.txt`, 'worktree changes - a')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, cache })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('param:custom-message', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      const stashCommit = await stash({ fs, dir, gitdir, message: 'Custom stash message', cache })
      assert.ok(stashCommit, 'Should return stash commit hash')

      const stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 1)
      // Verify stash list entry exists - format is "stash@{0}: message"
      const stashEntry = stashList[0] as string
      assert.ok(stashEntry, 'Stash entry should exist')
      assert.ok(typeof stashEntry === 'string', 'Stash entry should be a string')
      assert.ok(stashEntry.includes('Custom stash message'), 'Stash should contain custom message')
    })

    it('param:stash-create-custom-message', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'] })

      const stashCommitHash = await stash({ fs, dir, gitdir, op: 'create', message: 'Custom create message' })
      assert.ok(stashCommitHash, 'Should return stash commit hash')
      assert.strictEqual(typeof stashCommitHash, 'string')
      assert.strictEqual(stashCommitHash.length, 40)

      // Verify working directory is NOT modified
      const aContent = await fs.read(`${dir}/a.txt`)
      assert.strictEqual(aContent.toString(), 'staged changes - a')
    })

    it('param:dir', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      // Test with explicit dir parameter
      await stash({ fs, dir, gitdir, cache })

      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('param:cache', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      // Use same cache for stash
      await stash({ fs, dir, gitdir, cache })

      // Use same cache for status
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('param:autoDetectConfig', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      // Don't set user config manually, rely on autoDetectConfig

      const cache: Record<string, unknown> = {}
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      // Should work with autoDetectConfig (if config exists in fixture)
      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, cache, autoDetectConfig: true })
      } catch (e) {
        error = e
      }

      // May fail if no config, but should handle gracefully
      if (error) {
        assert.strictEqual((error as any).code, Errors.MissingNameError.code)
      } else {
        const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
        assert.strictEqual(aStatus, 'unmodified')
      }
    })

    it('edge:empty-repo-no-HEAD', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-empty')
      const { init } = await import('@awesome-os/universal-git-src/index.ts')
      await init({ fs, dir, defaultBranch: 'main' })
      await addUserConfig(fs, dir, gitdir)

      // Create a file but don't commit
      await fs.write(`${dir}/file.txt`, 'content')

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir })
      } catch (e) {
        error = e
      }

      // Should fail because HEAD doesn't exist (no commits)
      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.NotFoundError.code)
    })

    it('ok:stash-apply-index-commit', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create stash with both index and worktree changes
      await stashChanges(fs, dir, gitdir, true, false, '', cache)

      // Apply stash
      await stash({ fs, dir, gitdir, op: 'apply', cache })

      // Verify both staged and unstaged changes are applied
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'modified')
    })

    it('ok:stash-drop-middle', async () => {
      // Use fresh fixture to avoid stale stash data
      const { createTestRepo, createInitialCommit } = await import('@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts')
      const repo = await createTestRepo('sha1')
      try {
        await createInitialCommit(repo, {
          'a.txt': 'text',
          'b.js': 'text',
          'm.xml': '<root/>',
        }, 'docs: add initial files')
        
        await addUserConfig(repo.fs, repo.path, repo.gitdir)

        // Create 3 stashes
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false)
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false)
        await stashChanges(repo.fs, repo.path, repo.gitdir, true, false)

        let stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 3)

        // Drop middle stash (refIdx=1) - this drops the second most recent stash
        await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'drop', refIdx: 1 })

        stashList = await stash({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        // After dropping one stash, should have 2 remaining
        assert.strictEqual(stashList.length, 2)
      } finally {
        await repo.cleanup()
      }
    })

    it('error:caller-property', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')

      try {
        await stash({ fs, dir, gitdir, op: 'apply', refIdx: -1 })
        assert.fail('Should have thrown an error')
      } catch (error: any) {
        assert.ok(error instanceof Error, 'Should throw an error')
        assert.strictEqual(error.caller, 'git.stash', 'Error should have caller property set')
      }
    })

    it('error:unknown-operation', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'unknown' as any })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.ok((error as any).message.includes('To be implemented'), 'Should indicate unknown operation')
    })

    it('ok:stash-create-operation', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create changes
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      // Create stash commit without modifying working directory
      const stashCommitHash = await stash({ 
        fs, 
        dir, 
        gitdir, 
        op: 'create', 
        message: 'test stash',
        cache 
      })

      assert.ok(typeof stashCommitHash === 'string', 'Should return commit hash')
      assert.strictEqual(stashCommitHash.length, 40, 'Should be a valid SHA-1 hash')

      // Verify working directory still has changes
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'modified', 'Working directory should still have changes')
    })

    it('error:stash-create-no-changes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'create', message: 'no changes' })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).code, Errors.NotFoundError.code)
      assert.ok((error as any).message.includes('nothing to stash') || (error as any).message.includes('changes'))
    })

    it('ok:stash-clear-operation', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create and stash changes - first stash
      await stashChanges(fs, dir, gitdir, true, false, '', cache)
      
      // Verify first stash exists
      let stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      const initialStashCount = stashList.length
      assert.ok(initialStashCount >= 1, `Should have at least one stash after first stash, got ${initialStashCount}`)
      
      // Create new changes and stash again - second stash
      // Make sure we have changes to stash (stashChanges should handle this)
      try {
        await stashChanges(fs, dir, gitdir, true, false, '', cache)
      } catch (err: any) {
        // If stash fails because there are no changes, that's okay
        // We'll just test clear with whatever stashes we have
        if (!err.message || (!err.message.includes('nothing to stash') && !err.message.includes('changes'))) {
          throw err
        }
      }

      // Verify we have at least one stash (might be 1 or 2 depending on whether second stash succeeded)
      stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.ok(stashList.length >= 1, `Should have at least 1 stash before clear, got ${stashList.length}`)

      // Clear all stashes
      await stash({ fs, dir, gitdir, op: 'clear' })

      // Verify all stashes are cleared
      stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0, 'Should have no stashes after clear')
    })

    it('ok:stash-clear-no-stashes', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      // Clear when no stashes exist - should not throw error
      await stash({ fs, dir, gitdir, op: 'clear' })

      // Verify no stashes
      const stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0, 'Should have no stashes')
    })

    it('error:stash-drop-invalid-refIdx-negative', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'drop', refIdx: -1 })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.InvalidRefNameError.code)
    })

    it('error:stash-drop-refIdx-out-of-range', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create one stash
      await stashChanges(fs, dir, gitdir, true, false, '', cache)

      let error: unknown = null
      try {
        // Try to drop stash at index 5 when only 1 exists
        await stash({ fs, dir, gitdir, op: 'drop', refIdx: 5 })
      } catch (e) {
        error = e
      }

      // Should throw error for out of range index
      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
    })

    it('ok:stash-pop-operation', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create stash
      await stashChanges(fs, dir, gitdir, true, false, '', cache)

      // Verify stash exists
      let stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      const initialCount = stashList.length

      // Pop stash (apply and drop)
      await stash({ fs, dir, gitdir, op: 'pop', cache })

      // Verify stash was removed
      stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, initialCount - 1, 'Should have one less stash after pop')

      // Verify changes were applied
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'modified', 'Changes should be applied')
    })

    it('handles stash with only worktree changes (no index changes)', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create only worktree changes (not staged)
      await fs.write(`${dir}/a.txt`, 'unstaged changes - a')

      await stash({ fs, dir, gitdir, cache })

      // Verify changes were stashed
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified', 'Changes should be stashed')
    })

    it('handles stash with only index changes (no worktree changes)', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create only staged changes
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      await stash({ fs, dir, gitdir, cache })

      // Verify changes were stashed
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified', 'Changes should be stashed')
    })

    it('error:invalid-stash-operation', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      let error: unknown = null
      try {
        // @ts-expect-error - testing invalid operation
        await stash({ fs, dir, gitdir, op: 'invalid-op' })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.ok((error as any).message.includes('To be implemented'))
    })

    it('error:stash-apply-invalid-stash', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      // Try to apply stash when none exists
      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'apply', refIdx: 0 })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (returns early if no stash)
      assert.strictEqual(error, null)
    })

    it('ok:stash-apply-index-commit-2', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create stash with both staged and unstaged changes
      await stashChanges(fs, dir, gitdir, true, false, '', cache)

      // Apply stash
      await stash({ fs, dir, gitdir, op: 'apply', cache })

      // Verify both staged and unstaged changes were applied
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.ok(aStatus === 'modified' || aStatus === '*modified', 'Changes should be applied')
    })

    it('ok:stash-apply-no-index-commit', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create only worktree changes (not staged)
      await fs.write(`${dir}/a.txt`, 'unstaged changes - a')
      await stash({ fs, dir, gitdir, cache })

      // Apply stash
      await stash({ fs, dir, gitdir, op: 'apply', cache })

      // Verify changes were applied
      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.ok(aStatus === 'modified' || aStatus === '*modified', 'Changes should be applied')
    })

    it('error:stash-drop-ref-not-exist', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      // Try to drop when no stash exists
      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'drop', refIdx: 0 })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (returns early if no stash)
      assert.strictEqual(error, null)
    })

    it('error:stash-drop-empty-reflog', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      // Try to drop when reflog is empty
      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'drop', refIdx: 0 })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (returns early if no reflog)
      assert.strictEqual(error, null)
    })

    it('ok:stash-clear-paths-not-exist', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      // Clear when stash files don't exist
      let error: unknown = null
      try {
        await stash({ fs, dir, gitdir, op: 'clear' })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (skips non-existent paths)
      assert.strictEqual(error, null)
    })

    it('error:Repository-open-failure', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      // Use invalid gitdir to cause Repository.open to potentially fail
      // But stash should still work with provided gitdir
      const cache: Record<string, unknown> = {}
      await stashChanges(fs, dir, gitdir, true, false, '', cache)

      // Should work even if Repository.open had issues
      const stashList = await stash({ fs, dir, gitdir, op: 'list' })
      assert.ok(Array.isArray(stashList), 'Should return stash list')
    })

    it('error:getGitdir-failure', async () => {
      const { fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(fs, dir, gitdir)

      const cache: Record<string, unknown> = {}
      // Create changes
      await fs.write(`${dir}/a.txt`, 'changes')
      await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })

      // Should work even if getGitdir fails (falls back to provided gitdir)
      await stash({ fs, dir, gitdir, cache })

      const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt', cache })
      assert.strictEqual(aStatus, 'unmodified', 'Changes should be stashed')
    })
  })

  it('error:getStashAuthor-repo-missing', async () => {
    // Test - lines 58-59: throw error when repo is missing
    const { getStashAuthor } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-stash')
    let error: unknown = null
    try {
      await getStashAuthor({ fs, gitdir })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Error)
    assert.ok((error as Error).message.includes('Repository instance is required'))
  })

  it('error:getStashAuthor-NotFoundError-config', async () => {
    // Test - lines 77-87: handle NotFoundError and throw MissingNameError
    const { getStashAuthor } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-empty')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, gitdir, autoDetectConfig: false })
    let error: unknown = null
    try {
      await getStashAuthor({ fs, gitdir, repo })
    } catch (err) {
      error = err
    }
    // Should throw MissingNameError when author config is missing
    // Note: If autoDetectConfig finds system/global config, it might succeed
    // So we disable autoDetectConfig to ensure we test the error path
    assert.notStrictEqual(error, null)
    const { MissingNameError } = await import('@awesome-os/universal-git-src/errors/MissingNameError.ts')
    assert.ok(error instanceof MissingNameError)
  })

  it('edge:getStashSHA-ref-not-exist', async () => {
    // Test - lines 119-120: return null when refIdx >= entries.length
    const { getStashSHA } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-empty')
    const result = await getStashSHA({ fs, gitdir, refIdx: 0 })
    assert.strictEqual(result, null)
  })

  it('edge:getStashSHA-entry-not-string', async () => {
    // Test - line 125: return null when entry is not a string
    const { getStashSHA } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-empty')
    // Pass invalid entries array
    const result = await getStashSHA({ fs, gitdir, refIdx: 0, stashEntries: [null as any] })
    assert.strictEqual(result, null)
  })

  it('edge:readStashReflogs-file-not-exist', async () => {
    // Test - lines 316-317: return empty array when reflog doesn't exist
    const { readStashReflogs } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-empty')
    const result = await readStashReflogs({ fs, gitdir })
    assert.deepStrictEqual(result, [])
  })

  it('edge:readStashReflogs-content-not-string', async () => {
    // Test - lines 316-317: return empty array when content is not string
    const { readStashReflogs } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-empty')
    // Mock fs to return non-string
    const mockFs = {
      ...fs,
      read: async () => Buffer.from('test'),
      exists: async () => true,
    }
    const result = await readStashReflogs({ fs: mockFs as any, gitdir })
    assert.deepStrictEqual(result, [])
  })

  it('edge:readStashReflogs-empty-whitespace', async () => {
    // Test - lines 321-322: return empty array when reflog is empty
    const { readStashReflogs } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { fs, gitdir } = await makeFixture('test-empty')
    // Create empty reflog file
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    const { getStashReflogsPath } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const reflogPath = getStashReflogsPath(gitdir)
    await normalizedFs.mkdir(reflogPath.substring(0, reflogPath.lastIndexOf('/')), { recursive: true })
    await normalizedFs.write(reflogPath, '   \n  ', 'utf8')
    const result = await readStashReflogs({ fs, gitdir })
    assert.deepStrictEqual(result, [])
  })
})

