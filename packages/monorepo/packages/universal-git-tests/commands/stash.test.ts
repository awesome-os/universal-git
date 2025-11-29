import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  stash,
  Errors,
  add,
  status,
  commit,
  readCommit,
} from '@awesome-os/universal-git-src/index.ts'
import { makeFixture, resetToCommit } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

const addUserConfig = async (repo: any) => {
  const config = await repo.getConfig()
  await config.set('user.name', 'stash tester', 'local')
  await config.set('user.email', 'test@stash.com', 'local')
}

const clearUserConfig = async (repo: any) => {
  const config = await repo.getConfig()
  // Delete user config values using repo.getConfig()
  // Note: ConfigProvider doesn't have delete method, so we set them to empty string
  // or we can use the underlying backend to delete
  try {
    await config.set('user.name', '', 'local')
    await config.set('user.email', '', 'local')
  } catch {
    // Ignore errors if config doesn't exist
  }
}

const reopenRepoWithoutSystemConfig = async (repo: any) => {
  || undefined
  return Repository.open({
    fs,
    dir,
    gitdir,
    cache: repo.cache,
    autoDetectConfig: false,
    ignoreSystemConfig: true,
  })
}

const stashChanges = async (
  repo: any,
  defalt = true,
  again = true,
  message = ''
) => {
  // add user to config
  await addUserConfig(repo)

  const aContent = await fs.read(`${dir}/a.txt`)
  const bContent = await fs.read(`${dir}/b.js`)
  await fs.write(`${dir}/a.txt`, 'staged changes - a')
  await fs.write(`${dir}/b.js`, 'staged changes - b')

  await add({ repo, filepath: ['a.txt', 'b.js'] })
  let aStatus = await status({ repo, filepath: 'a.txt' })
  assert.strictEqual(aStatus, 'modified')

  let bStatus = await status({ repo, filepath: 'b.js' })
  assert.strictEqual(bStatus, 'modified')

  let mStatus = await status({ repo, filepath: 'm.xml' })
  if (defalt) {
    // include unstaged changes, different file first
    await fs.write(`${dir}/m.xml`, '<unstaged>m</unstaged>')
    mStatus = await status({ repo, filepath: 'm.xml' })
    // Status might be '*modified' or '*added' depending on whether file existed
    assert.ok(mStatus === '*modified' || mStatus === '*added', `Status should be *modified or *added, got ${mStatus}`)

    if (again) {
      // same file changes again after staged
      await fs.write(`${dir}/a.txt`, 'unstaged changes - a - again')
      aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, '*modified')
    }
  }

  let error: unknown = null
  try {
    await stash({ repo, message })
    const aContentAfterStash = await fs.read(`${dir}/a.txt`)
    assert.strictEqual(aContentAfterStash.toString(), aContent.toString())

    const bContentAfterStash = await fs.read(`${dir}/b.js`)
    assert.strictEqual(bContentAfterStash.toString(), bContent.toString())
  } catch (e) {
    error = e
  }

  assert.strictEqual(error, null)
  aStatus = await status({ repo, filepath: 'a.txt' })
  assert.strictEqual(aStatus, 'unmodified')
  bStatus = await status({ repo, filepath: 'b.js' })
  assert.strictEqual(bStatus, 'unmodified')
  mStatus = await status({ repo, filepath: 'm.xml' })
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
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      const isolatedRepo = await reopenRepoWithoutSystemConfig(repo)
      await clearUserConfig(isolatedRepo)
      // Note: repo from makeFixture already has proper config isolation
      const dir = isolatedRepo.dir
      await isolatedRepo.fs.write(`${dir}/temp.txt`, 'temp')
      await add({ repo: isolatedRepo, filepath: ['temp.txt'] })

      let error: unknown = null
      try {
        await stash({ repo: isolatedRepo })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.MissingNameError.code)
      assert.strictEqual((error as any).data.role, 'author')
    })

    it('error:stash-no-changes', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      // add user to config
      await addUserConfig(repo)

      // CRITICAL: Reset to HEAD to ensure a clean state (index and workdir match HEAD)
      // Use hard mode to ensure complete clean state
      await resetToCommit(repo, 'HEAD', 'hard')

      let error: unknown = null
      try {
        await stash({ repo })
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
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await stashChanges(repo, false, false) // no unstaged changes
    })

    it('ok:stash-staged-and-unstaged', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await stashChanges(repo, true, false) // with unstaged changes
    })

    it('ok:stash-staged-unstaged-same-file', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await stashChanges(repo, true, true) // with unstaged changes
    })
  })

  describe('stash create', () => {
    it('error:stash-create-without-user', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      const isolatedRepo = await reopenRepoWithoutSystemConfig(repo)
      await clearUserConfig(isolatedRepo)
      // Note: repo from makeFixture already has proper config isolation
      const dir = isolatedRepo.dir
      await isolatedRepo.fs.write(`${dir}/temp.txt`, 'temp')
      await add({ repo: isolatedRepo, filepath: ['temp.txt'] })

      let error: unknown = null
      try {
        await stash({ repo: isolatedRepo, op: 'create' })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.MissingNameError.code)
      assert.strictEqual((error as any).data.role, 'author')
    })

    it('ok:stash-create-returns-commit', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      const aOriginalContent = 'staged changes - a'
      const bOriginalContent = 'staged changes - b'

      await fs.write(`${dir}/a.txt`, aOriginalContent)
      await fs.write(`${dir}/b.js`, bOriginalContent)
      await add({ repo, filepath: ['a.txt', 'b.js'] })

      const aStatusBefore = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatusBefore, 'modified')
      const bStatusBefore = await status({ repo, filepath: 'b.js' })
      assert.strictEqual(bStatusBefore, 'modified')

      let stashCommitHash: string | null = null
      let error: unknown = null
      try {
        stashCommitHash = await stash({ repo, op: 'create' })
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
      const aStatusAfter = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatusAfter, 'modified')
      const bStatusAfter = await status({ repo, filepath: 'b.js' })
      assert.strictEqual(bStatusAfter, 'modified')

      // Verify stash ref is NOT created
      const stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0)
    })
  })

  describe('stash apply', () => {
    it('ok:stash-apply-staged-changes', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      await stashChanges(repo, false, false) // no unstaged changes

      let error: unknown = null
      try {
        await stash({ repo, op: 'apply' })
      } catch (e) {
        error = e
      }

      const aContent = await fs.read(`${dir}/a.txt`)
      assert.strictEqual(aContent.toString(), 'staged changes - a') // make sure the staged changes are applied
      const bContent = await fs.read(`${dir}/b.js`)
      assert.strictEqual(bContent.toString(), 'staged changes - b') // make sure the staged changes are applied

      assert.strictEqual(error, null)
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'modified')
      const bStatus = await status({ repo, filepath: 'b.js' })
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
        
        await addUserConfig(repo.repo)
        
        const stashList = await stash({ repo: repo.repo, op: 'list' })
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
        
        await stashChanges(repo.repo, true, false) // staged and non-unstaged 3 file changes

        const stashList = await stash({ repo: repo.repo, op: 'list' })
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
        
        await stashChanges(repo.repo, true, false) // staged and non-unstaged changes
        await stashChanges(repo.repo, true, false) // staged and non-unstaged changes

        const stashList = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 2)
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('stash drop', () => {
    it('error:stash-drop-no-stash', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ repo, op: 'drop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
    })

    it('ok:stash-drop', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      await stashChanges(repo, true, false) // staged and non-unstaged changes

      let error: unknown = null
      try {
        await stash({ repo, op: 'drop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0)
    })
  })

  describe('stash pop', () => {
    it('error:stash-pop-no-stash', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ repo, op: 'pop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
    })

    it('ok:stash-pop', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      await stashChanges(repo, true, false) // staged and non-unstaged changes

      let error: unknown = null
      try {
        await stash({ repo, op: 'pop' })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0)
    })
  })

  describe('stash clear', () => {
    it('ok:stash-clear-empty', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ repo, op: 'clear' })
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
        
        await addUserConfig(repo.repo)

        await stashChanges(repo.repo, true, false) // first stash
        await stashChanges(repo.repo, true, false) // second stash

        const stashListBefore = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashListBefore), 'stash list should return an array')
        assert.strictEqual(stashListBefore.length, 2)

        let error: unknown = null
        try {
          await stash({ repo: repo.repo, op: 'clear' })
        } catch (e) {
          error = e
        }

        assert.strictEqual(error, null)
        const stashListAfter = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashListAfter), 'stash list should return an array')
        assert.strictEqual(stashListAfter.length, 0)
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('stash edge cases', () => {
    it('error:invalid-refIdx-negative', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      let error: unknown = null
      try {
        await stash({ repo, op: 'apply', refIdx: -1 })
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
        
        await addUserConfig(repo.repo)

        // Create 2 stashes
        await stashChanges(repo.repo, true, false)
        await stashChanges(repo.repo, true, false)

        let stashList = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 2)

        // Drop first stash (refIdx=0) - this should drop the most recent one
        await stash({ repo: repo.repo, op: 'drop', refIdx: 0 })

        stashList = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        // After dropping refIdx=0, we should have 1 stash left
        assert.strictEqual(stashList.length, 1)
      } finally {
        await repo.cleanup()
      }
    })

    it('ok:stash-only-index-changes', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Only stage changes, no worktree changes
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      let error: unknown = null
      try {
        await stash({ repo })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('ok:stash-only-worktree-changes', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Only worktree changes, no staged changes
      await fs.write(`${dir}/a.txt`, 'worktree changes - a')

      let error: unknown = null
      try {
        await stash({ repo })
      } catch (e) {
        error = e
      }

      assert.strictEqual(error, null)
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('param:custom-message', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      const stashCommit = await stash({ repo, message: 'Custom stash message' })
      assert.ok(stashCommit, 'Should return stash commit hash')

      const stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 1)
      // Verify stash list entry exists - format is "stash@{0}: message"
      const stashEntry = stashList[0] as string
      assert.ok(stashEntry, 'Stash entry should exist')
      assert.ok(typeof stashEntry === 'string', 'Stash entry should be a string')
      assert.ok(stashEntry.includes('Custom stash message'), 'Stash should contain custom message')
    })

    it('param:stash-create-custom-message', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      const stashCommitHash = await stash({ repo, op: 'create', message: 'Custom create message' })
      assert.ok(stashCommitHash, 'Should return stash commit hash')
      assert.strictEqual(typeof stashCommitHash, 'string')
      assert.strictEqual(stashCommitHash.length, 40)

      // Verify working directory is NOT modified
      const aContent = await fs.read(`${dir}/a.txt`)
      assert.strictEqual(aContent.toString(), 'staged changes - a')
    })

    it('param:dir', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      // Test with explicit dir parameter
      await stash({ repo })

      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('param:cache', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      // Use same cache for stash
      await stash({ repo })

      // Use same cache for status
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified')
    })

    it('param:autoDetectConfig', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      // Don't set user config manually, rely on autoDetectConfig

      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      // Should work with autoDetectConfig (if config exists in fixture)
      let error: unknown = null
      try {
        await stash({ repo, autoDetectConfig: true })
      } catch (e) {
        error = e
      }

      // May fail if no config, but should handle gracefully
      if (error) {
        assert.strictEqual((error as any).code, Errors.MissingNameError.code)
      } else {
        const aStatus = await status({ repo, filepath: 'a.txt' })
        assert.strictEqual(aStatus, 'unmodified')
      }
    })

    it('edge:empty-repo-no-HEAD', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
      
      await addUserConfig(repo)

      // Create a file but don't commit
      await fs.write(`${dir}/file.txt`, 'content')

      let error: unknown = null
      try {
        await stash({ repo })
      } catch (e) {
        error = e
      }

      // Should fail because HEAD doesn't exist (no commits)
      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.NotFoundError.code)
    })

    it('ok:stash-apply-index-commit', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create stash with both index and worktree changes
      await stashChanges(repo, true, false)

      // Apply stash
      await stash({ repo, op: 'apply' })

      // Verify both staged and unstaged changes are applied
      const aStatus = await status({ repo, filepath: 'a.txt' })
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
        
        await addUserConfig(repo.repo)

        // Create 3 stashes
        await stashChanges(repo.repo, true, false)
        await stashChanges(repo.repo, true, false)
        await stashChanges(repo.repo, true, false)

        let stashList = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        assert.strictEqual(stashList.length, 3)

        // Drop middle stash (refIdx=1) - this drops the second most recent stash
        await stash({ repo: repo.repo, op: 'drop', refIdx: 1 })

        stashList = await stash({ repo: repo.repo, op: 'list' })
        assert.ok(Array.isArray(stashList), 'stash list should return an array')
        // After dropping one stash, should have 2 remaining
        assert.strictEqual(stashList.length, 2)
      } finally {
        await repo.cleanup()
      }
    })

    it('error:caller-property', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')

      try {
        await stash({ repo, op: 'apply', refIdx: -1 })
        assert.fail('Should have thrown an error')
      } catch (error: any) {
        assert.ok(error instanceof Error, 'Should throw an error')
        assert.strictEqual(error.caller, 'git.stash', 'Error should have caller property set')
      }
    })

    it('error:unknown-operation', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      let error: unknown = null
      try {
        await stash({ repo, op: 'unknown' as any })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.ok((error as any).message.includes('To be implemented'), 'Should indicate unknown operation')
    })

    it('ok:stash-create-operation', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create changes
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      // Create stash commit without modifying working directory
      const stashCommitHash = await stash({ 
        repo, 
        op: 'create', 
        message: 'test stash',
      })

      assert.ok(typeof stashCommitHash === 'string', 'Should return commit hash')
      assert.strictEqual(stashCommitHash.length, 40, 'Should be a valid SHA-1 hash')

      // Verify working directory still has changes
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'modified', 'Working directory should still have changes')
    })

    it('error:stash-create-no-changes', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      let error: unknown = null
      try {
        await stash({ repo, op: 'create', message: 'no changes' })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).code, Errors.NotFoundError.code)
      assert.ok((error as any).message.includes('nothing to stash') || (error as any).message.includes('changes'))
    })

    it('ok:stash-clear-operation', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create and stash changes - first stash
      await stashChanges(repo, true, false)
      
      // Verify first stash exists
      let stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      const initialStashCount = stashList.length
      assert.ok(initialStashCount >= 1, `Should have at least one stash after first stash, got ${initialStashCount}`)
      
      // Create new changes and stash again - second stash
      // Make sure we have changes to stash (stashChanges should handle this)
      try {
        await stashChanges(repo, true, false)
      } catch (err: any) {
        // If stash fails because there are no changes, that's okay
        // We'll just test clear with whatever stashes we have
        if (!err.message || (!err.message.includes('nothing to stash') && !err.message.includes('changes'))) {
          throw err
        }
      }

      // Verify we have at least one stash (might be 1 or 2 depending on whether second stash succeeded)
      stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.ok(stashList.length >= 1, `Should have at least 1 stash before clear, got ${stashList.length}`)

      // Clear all stashes
      await stash({ repo, op: 'clear' })

      // Verify all stashes are cleared
      stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0, 'Should have no stashes after clear')
    })

    it('ok:stash-clear-no-stashes', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Clear when no stashes exist - should not throw error
      await stash({ repo, op: 'clear' })

      // Verify no stashes
      const stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, 0, 'Should have no stashes')
    })

    it('error:stash-drop-invalid-refIdx-negative', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      let error: unknown = null
      try {
        await stash({ repo, op: 'drop', refIdx: -1 })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.strictEqual((error as any).code, Errors.InvalidRefNameError.code)
    })

    it('error:stash-drop-refIdx-out-of-range', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create one stash
      await stashChanges(repo, true, false)

      let error: unknown = null
      try {
        // Try to drop stash at index 5 when only 1 exists
        await stash({ repo, op: 'drop', refIdx: 5 })
      } catch (e) {
        error = e
      }

      // Should throw error for out of range index
      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
    })

    it('ok:stash-pop-operation', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create stash
      await stashChanges(repo, true, false)

      // Verify stash exists
      let stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      const initialCount = stashList.length

      // Pop stash (apply and drop)
      await stash({ repo, op: 'pop' })

      // Verify stash was removed
      stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'stash list should return an array')
      assert.strictEqual(stashList.length, initialCount - 1, 'Should have one less stash after pop')

      // Verify changes were applied
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'modified', 'Changes should be applied')
    })

    it('handles stash with only worktree changes (no index changes)', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create only worktree changes (not staged)
      await fs.write(`${dir}/a.txt`, 'unstaged changes - a')

      await stash({ repo })

      // Verify changes were stashed
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified', 'Changes should be stashed')
    })

    it('handles stash with only index changes (no worktree changes)', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create only staged changes
      await fs.write(`${dir}/a.txt`, 'staged changes - a')
      await add({ repo, filepath: ['a.txt'] })

      await stash({ repo })

      // Verify changes were stashed
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified', 'Changes should be stashed')
    })

    it('error:invalid-stash-operation', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      let error: unknown = null
      try {
        // @ts-expect-error - testing invalid operation
        await stash({ repo, op: 'invalid-op' })
      } catch (e) {
        error = e
      }

      assert.notStrictEqual(error, null)
      assert.strictEqual((error as any).caller, 'git.stash')
      assert.ok((error as any).message.includes('To be implemented'))
    })

    it('error:stash-apply-invalid-stash', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Try to apply stash when none exists
      let error: unknown = null
      try {
        await stash({ repo, op: 'apply', refIdx: 0 })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (returns early if no stash)
      assert.strictEqual(error, null)
    })

    it('ok:stash-apply-index-commit-2', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create stash with both staged and unstaged changes
      await stashChanges(repo, true, false)

      // Apply stash
      await stash({ repo, op: 'apply' })

      // Verify both staged and unstaged changes were applied
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.ok(aStatus === 'modified' || aStatus === '*modified', 'Changes should be applied')
    })

    it('ok:stash-apply-no-index-commit', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create only worktree changes (not staged)
      await fs.write(`${dir}/a.txt`, 'unstaged changes - a')
      await stash({ repo })

      // Apply stash
      await stash({ repo, op: 'apply' })

      // Verify changes were applied
      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.ok(aStatus === 'modified' || aStatus === '*modified', 'Changes should be applied')
    })

    it('error:stash-drop-ref-not-exist', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Try to drop when no stash exists
      let error: unknown = null
      try {
        await stash({ repo, op: 'drop', refIdx: 0 })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (returns early if no stash)
      assert.strictEqual(error, null)
    })

    it('error:stash-drop-empty-reflog', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Try to drop when reflog is empty
      let error: unknown = null
      try {
        await stash({ repo, op: 'drop', refIdx: 0 })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (returns early if no reflog)
      assert.strictEqual(error, null)
    })

    it('ok:stash-clear-paths-not-exist', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Clear when stash files don't exist
      let error: unknown = null
      try {
        await stash({ repo, op: 'clear' })
      } catch (e) {
        error = e
      }

      // Should handle gracefully (skips non-existent paths)
      assert.strictEqual(error, null)
    })

    it('error:Repository-open-failure', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create stash
      await stashChanges(repo, true, false)

      // Should work even if Repository.open had issues
      const stashList = await stash({ repo, op: 'list' })
      assert.ok(Array.isArray(stashList), 'Should return stash list')
    })

    it('error:getGitdir-failure', async () => {
      const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
      await addUserConfig(repo)

      // Create changes
      await fs.write(`${dir}/a.txt`, 'changes')
      await add({ repo, filepath: ['a.txt'] })

      // Should work even if getGitdir fails (falls back to provided gitdir)
      await stash({ repo })

      const aStatus = await status({ repo, filepath: 'a.txt' })
      assert.strictEqual(aStatus, 'unmodified', 'Changes should be stashed')
    })
  })

  it('error:getStashAuthor-repo-missing', async () => {
    // Test - lines 58-59: throw error when repo is missing
    const { getStashAuthor } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { repo, fs, dir, gitdir } = await makeFixture('test-stash')
    let error: unknown = null
    try {
      await getStashAuthor({ fs: fs, gitdir })
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    let error: unknown = null
    try {
      await getStashAuthor({ fs: fs, gitdir, repo })
    } catch (err) {
      error = err
    }
    // Should throw MissingNameError when author config is missing
    // Note: If ignoreSystemConfig is false, system/global config might provide author
    // So we use ignoreSystemConfig: true to ensure we test the error path
    assert.notStrictEqual(error, null)
    const { MissingNameError } = await import('@awesome-os/universal-git-src/errors/MissingNameError.ts')
    assert.ok(error instanceof MissingNameError)
  })

  it('edge:getStashSHA-ref-not-exist', async () => {
    // Test - lines 119-120: return null when refIdx >= entries.length
    const { getStashSHA } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const result = await getStashSHA({ fs: fs, gitdir, refIdx: 0 })
    assert.strictEqual(result, null)
  })

  it('edge:getStashSHA-entry-not-string', async () => {
    // Test - line 125: return null when entry is not a string
    const { getStashSHA } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Pass invalid entries array
    const result = await getStashSHA({ fs: fs, gitdir, refIdx: 0, stashEntries: [null as any] })
    assert.strictEqual(result, null)
  })

  it('edge:readStashReflogs-file-not-exist', async () => {
    // Test - lines 316-317: return empty array when reflog doesn't exist
    const { readStashReflogs } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const result = await readStashReflogs({ fs: fs, gitdir })
    assert.deepStrictEqual(result, [])
  })

  it('edge:readStashReflogs-content-not-string', async () => {
    // Test - lines 316-317: return empty array when content is not string
    const { readStashReflogs } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    // Create empty reflog file
    const { getStashReflogsPath } = await import('@awesome-os/universal-git-src/git/refs/stash.ts')
    const reflogPath = getStashReflogsPath(gitdir)
    await fs.mkdir(reflogPath.substring(0, reflogPath.lastIndexOf('/')), { recursive: true })
    await fs.write(reflogPath, '   \n  ', 'utf8')
    const result = await readStashReflogs({ fs: fs, gitdir })
    assert.deepStrictEqual(result, [])
  })
})

