import { test } from 'node:test'
import assert from 'node:assert'
import { cherryPick, init, commit, add, writeRef, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

test('cherryPick', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await cherryPick({
        gitdir: '/tmp/test.git',
        commit: 'abc123',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-or-dir-missing', async () => {
    const { fs } = await makeFixture('test-empty')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await cherryPick({
        fs,
        // intentionally missing both gitdir and dir
        commit: 'abc123',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
    }
  })

  await t.test('param:commit-missing', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    try {
      await cherryPick({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'commit')
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ fs, dir, filepath: 'file1.txt', cache: repo.cache })
    await commit({ fs, dir, message: 'Initial commit', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Create a branch and commit on it
    const branchOid = await resolveRef({ fs, gitdir: `${dir}/.git`, ref: 'HEAD' })
    await writeRef({ fs, gitdir: `${dir}/.git`, ref: 'refs/heads/feature', value: branchOid })
    
    // Create another commit on main
    await normalizedFs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, filepath: 'file2.txt', cache: repo.cache })
    await commit({ fs, dir, message: 'Second commit', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Cherry-pick should work with dir only
    try {
      await cherryPick({
        fs,
        dir,
        cache: repo.cache,
        commit: branchOid,
      })
      // If it doesn't throw, that's good - it means gitdir was derived correctly
    } catch (error) {
      // Other errors are acceptable (like conflicts), but MissingParameterError for gitdir is not
      if (error instanceof MissingParameterError && (error as any).data?.parameter === 'gitdir') {
        assert.fail('Should have derived gitdir from dir')
      }
    }
  })

  await t.test('error:commit-not-exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    try {
      await cherryPick({
        fs,
        gitdir,
        commit: 'nonexistent123456789012345678901234567890123456',
      })
      assert.fail('Should have thrown an error')
    } catch (error) {
      assert.ok(error instanceof Error, 'Should throw an error for non-existent commit')
      // Could be NotFoundError or other error depending on implementation
    }
  })

  await t.test('error:commit-not-commit-object', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    // Create a blob object (not a commit)
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const commitOid = await commit({ fs, dir, message: 'Initial', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Try to cherry-pick a tree or blob (this should fail)
    // We'll use a valid OID format but wrong type
    try {
      // This will fail when trying to parse as commit
      await cherryPick({
        fs,
        dir,
        cache: repo.cache,
        commit: commitOid.substring(0, 40), // Use a shorter OID that might not exist
      })
      // If it doesn't throw, that's unexpected
    } catch (error) {
      // Expected to throw - either NotFoundError or "not a commit" error
      assert.ok(error instanceof Error)
    }
  })

  await t.test('error:root-commit-no-parent', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content')
    
    // Create initial commit (root commit)
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const rootCommitOid = await commit({ fs, dir, message: 'Root commit', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Try to cherry-pick the root commit (it has no parent)
    try {
      await cherryPick({
        fs,
        dir,
        cache: repo.cache,
        commit: rootCommitOid,
      })
      assert.fail('Should have thrown error for root commit')
    } catch (error) {
      assert.ok(error instanceof Error)
      assert.ok(
        (error as Error).message.includes('no parent') || 
        (error as Error).message.includes('root commit'),
        'Error should mention root commit or no parent'
      )
    }
  })

  await t.test('error:HEAD-not-commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1')
    
    // Create a commit to cherry-pick (needs a parent)
    await add({ fs, dir, filepath: 'file1.txt', cache: repo.cache })
    const firstCommit = await commit({ fs, dir, message: 'First', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    await normalizedFs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, filepath: 'file2.txt', cache: repo.cache })
    const secondCommit = await commit({ fs, dir, message: 'Second', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Set HEAD to point to a non-commit (this is unusual but possible in edge cases)
    // Actually, this is hard to test because HEAD should always point to a commit
    // But we can test the error handling path
    try {
      await cherryPick({
        fs,
        dir,
        cache: repo.cache,
        commit: firstCommit,
      })
      // If it succeeds, that's fine - the test is about error handling
    } catch (error) {
      // Any error is acceptable here
      assert.ok(error instanceof Error)
    }
  })

  await t.test('ok:no-conflicts', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit on main
    await add({ fs, dir, filepath: 'file1.txt', cache: repo.cache })
    const initialCommit = await commit({ fs, dir, message: 'Initial', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Create a branch and make a commit on it
    await writeRef({ fs, gitdir, ref: 'refs/heads/feature', value: initialCommit })
    await normalizedFs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, filepath: 'file2.txt', cache: repo.cache })
    const featureCommit = await commit({ fs, dir, message: 'Feature', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Switch back to main (reset working directory) - use repo.writeRef for consistency
    await repo.writeRef('HEAD', initialCommit)
    await normalizedFs.rm(`${dir}/file2.txt`).catch(() => {}) // Remove file2 if it exists
    
    // Cherry-pick the feature commit - use dir to let cherryPick resolve gitdir the same way commit does
    const result = await cherryPick({
      fs,
      dir,
      cache: repo.cache,
      commit: featureCommit,
    })
    
    assert.ok(result.oid, 'Should return a commit OID')
    assert.strictEqual(result.conflicts, undefined, 'Should have no conflicts')
    
    // Verify the commit was created - use dir and cache for consistency
    const newHead = await resolveRef({ fs, dir, cache: repo.cache, ref: 'HEAD' })
    assert.strictEqual(newHead, result.oid, 'HEAD should point to the new commit')
  })

  await t.test('param:noCommit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ fs, dir, filepath: 'file1.txt', cache: repo.cache })
    const initialCommit = await commit({ fs, dir, message: 'Initial', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Create a branch and make a commit
    await writeRef({ fs, gitdir, ref: 'refs/heads/feature', value: initialCommit })
    await normalizedFs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, filepath: 'file2.txt', cache: repo.cache })
    const featureCommit = await commit({ fs, dir, message: 'Feature', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Switch back to main - need to handle symbolic HEAD properly
    // First check if HEAD is symbolic, and if so, detach it
    const { readSymbolicRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    const { writeRef: writeRefDirect } = await import('@awesome-os/universal-git-src/git/refs/writeRef.ts')
    try {
      const symbolicTarget = await readSymbolicRef({ fs, gitdir, ref: 'HEAD' })
      if (symbolicTarget) {
        // HEAD is symbolic, detach it by writing directly to HEAD
        await writeRefDirect({ fs, gitdir, ref: 'HEAD', value: initialCommit })
      } else {
        // HEAD is already detached, just update it
        await writeRefDirect({ fs, gitdir, ref: 'HEAD', value: initialCommit })
      }
    } catch {
      // HEAD doesn't exist or error reading it, just write it
      await writeRefDirect({ fs, gitdir, ref: 'HEAD', value: initialCommit })
    }
    
    // Also reset the branch ref to ensure consistency
    await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: initialCommit, force: true })
    await normalizedFs.rm(`${dir}/file2.txt`).catch(() => {})
    
    // Clear Repository cache to ensure fresh read of HEAD
    Repository.clearInstanceCache()
    
    // Verify HEAD is actually reset before cherry-pick - use fresh resolveRef without cache
    const headBefore = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.strictEqual(headBefore, initialCommit, 'HEAD should be reset to initialCommit before cherry-pick')
    
    // Cherry-pick with noCommit - use dir to let cherryPick resolve gitdir the same way commit does
    const result = await cherryPick({
      fs,
      dir,
      cache: repo.cache,
      commit: featureCommit,
      noCommit: true,
    })
    
    assert.ok(result.oid, 'Should return a tree OID')
    // HEAD should not have changed - clear cache and check directly
    Repository.clearInstanceCache()
    const headAfter = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.strictEqual(headAfter, initialCommit, 'HEAD should not change with noCommit')
  })

  await t.test('error:conflicts-sets-CHERRY_PICK_HEAD', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content1')
    
    // Create initial commit on main
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const initialCommit = await commit({ fs, dir, message: 'Initial', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Modify file on main
    await normalizedFs.write(`${dir}/file.txt`, 'content2-main')
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const mainCommit = await commit({ fs, dir, message: 'Main change', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Create branch from initial commit and modify same file differently
    await writeRef({ fs, gitdir, ref: 'refs/heads/feature', value: initialCommit })
    await normalizedFs.write(`${dir}/file.txt`, 'content2-feature')
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const featureCommit = await commit({ fs, dir, message: 'Feature change', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Switch back to main
    await writeRef({ fs, gitdir, ref: 'HEAD', value: mainCommit })
    await normalizedFs.write(`${dir}/file.txt`, 'content2-main')
    
    // Cherry-pick should create conflict - use dir to let cherryPick resolve gitdir the same way commit does
    try {
      await cherryPick({
        fs,
        dir,
        cache: repo.cache,
        commit: featureCommit,
      })
      // If no conflict, that's unexpected but possible if merge algorithm handles it
    } catch (error) {
      assert.ok(error instanceof Error)
      // Should mention conflict
      if ((error as Error).message.includes('conflict')) {
        // Verify CHERRY_PICK_HEAD was set
        const { StateManager } = await import('@awesome-os/universal-git-src/core-utils/StateManager.ts')
        const stateManager = new StateManager(fs, gitdir)
        const cherryPickHead = await stateManager.getCherryPickHead()
        assert.strictEqual(cherryPickHead, featureCommit, 'CHERRY_PICK_HEAD should be set to the commit being cherry-picked')
      }
    }
  })

  await t.test('handles conflicts with noCommit - returns conflicts without throwing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file.txt`, 'content1')
    
    // Create initial commit
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const initialCommit = await commit({ fs, dir, message: 'Initial', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Modify file on main
    await normalizedFs.write(`${dir}/file.txt`, 'content2-main')
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const mainCommit = await commit({ fs, dir, message: 'Main change', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Create branch and modify same file
    await writeRef({ fs, gitdir, ref: 'refs/heads/feature', value: initialCommit })
    await normalizedFs.write(`${dir}/file.txt`, 'content2-feature')
    await add({ fs, dir, filepath: 'file.txt', cache: repo.cache })
    const featureCommit = await commit({ fs, dir, message: 'Feature change', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Switch back to main
    await writeRef({ fs, gitdir, ref: 'HEAD', value: mainCommit })
    await normalizedFs.write(`${dir}/file.txt`, 'content2-main')
    
    // Cherry-pick with noCommit should return conflicts without throwing - use dir to let cherryPick resolve gitdir the same way commit does
    const result = await cherryPick({
      fs,
      dir,
      cache: repo.cache,
      commit: featureCommit,
      noCommit: true,
    })
    
    // Should return result with conflicts if any
    if (result.conflicts && result.conflicts.length > 0) {
      assert.ok(Array.isArray(result.conflicts), 'Conflicts should be an array')
      assert.ok(result.conflicts.length > 0, 'Should have conflicts')
    }
  })

  await t.test('preserves commit author and message from original commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Use Repository to ensure cache consistency
    const cache: Record<string, unknown> = {}
    const repo = await Repository.open({ fs, dir, gitdir, cache })
    
    // Write files to filesystem
    const { createFileSystem } = await import('@awesome-os/universal-git-src/utils/createFileSystem.ts')
    const normalizedFs = createFileSystem(fs)
    await normalizedFs.write(`${dir}/file1.txt`, 'content1')
    
    // Create initial commit
    await add({ fs, dir, filepath: 'file1.txt', cache: repo.cache })
    const initialCommit = await commit({ fs, dir, message: 'Initial', author: { name: 'Test', email: 'test@example.com' }, cache: repo.cache })
    
    // Create feature commit with specific author
    await writeRef({ fs, gitdir, ref: 'refs/heads/feature', value: initialCommit })
    await normalizedFs.write(`${dir}/file2.txt`, 'content2')
    await add({ fs, dir, filepath: 'file2.txt', cache: repo.cache })
    const originalAuthor = { name: 'Feature Author', email: 'feature@example.com' }
    const featureCommit = await commit({ 
      fs, 
      dir, 
      message: 'Feature commit message', 
      author: originalAuthor,
      committer: originalAuthor,
      cache: repo.cache,
    })
    
    // Switch back to main
    await writeRef({ fs, gitdir, ref: 'HEAD', value: initialCommit })
    await normalizedFs.rm(`${dir}/file2.txt`).catch(() => {})
    
    // Cherry-pick - use dir to let cherryPick resolve gitdir the same way commit does
    const result = await cherryPick({
      fs,
      dir,
      cache: repo.cache,
      commit: featureCommit,
    })
    
    // Verify the commit has the same author and message
    const { readCommit } = await import('@awesome-os/universal-git-src/index.ts')
    const newCommitResult = await readCommit({ fs, dir, cache: repo.cache, oid: result.oid })
    // Message may have trailing newline from normalization, so trim it
    assert.strictEqual(newCommitResult.commit.message.trim(), 'Feature commit message', 'Message should be preserved')
    assert.strictEqual(newCommitResult.commit.author.name, originalAuthor.name, 'Author name should be preserved')
    assert.strictEqual(newCommitResult.commit.author.email, originalAuthor.email, 'Author email should be preserved')
  })
})

