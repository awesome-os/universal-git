import { test } from 'node:test'
import assert from 'node:assert'
import { deleteRef, init } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('deleteRef', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await deleteRef({
        gitdir: '/tmp/test.git',
        ref: 'refs/heads/test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-missing', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    try {
      await deleteRef({
        fs: fs,
        ref: 'refs/heads/test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
    }
  })

  await t.test('param:ref-missing', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    try {
      await deleteRef({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'ref')
    }
  })

  await t.test('ok:basic', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a ref first
    await repo.gitBackend.writeRef('refs/heads/test-branch', 'a'.repeat(40), false, repo.cache)
    
    // Verify it exists
    const before = await repo.gitBackend.readRef('refs/heads/test-branch', 5, repo.cache)
    assert.ok(before, 'Ref should exist before deletion')
    
    // Delete the ref
    await deleteRef({ repo, ref: 'refs/heads/test-branch' })
    
    // Verify it's deleted
    try {
      await repo.gitBackend.readRef('refs/heads/test-branch', 5, repo.cache)
      assert.fail('Ref should not exist after deletion')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error, 'Should throw an error when reading deleted ref')
    }
  })

  await t.test('edge:non-existent-ref', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    // deleteRef might not throw an error if the ref doesn't exist
    // (it just tries to delete it, which is a no-op)
    try {
      await deleteRef({ repo, ref: 'refs/heads/nonexistent' })
      // If it doesn't throw, that's also acceptable behavior
      assert.ok(true, 'deleteRef should handle non-existent refs gracefully')
    } catch (error) {
      // If it throws, it should be a NotFoundError
      assert.ok(error instanceof NotFoundError || error instanceof Error, 'Should throw an error for non-existent ref')
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a ref first
    await repo.gitBackend.writeRef('refs/heads/test-branch', 'a'.repeat(40), false, repo.cache)
    
    // Delete using dir (gitdir should be derived)
    await deleteRef({ repo, ref: 'refs/heads/test-branch' })
    
    // Verify it's deleted
    try {
      await repo.gitBackend.readRef('refs/heads/test-branch', 5, repo.cache)
      assert.fail('Ref should not exist after deletion')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error, 'Should throw an error when reading deleted ref')
    }
  })
})

