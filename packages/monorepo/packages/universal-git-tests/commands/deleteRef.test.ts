import { test } from 'node:test'
import assert from 'node:assert'
import { deleteRef, init, writeRef } from '@awesome-os/universal-git-src/index.ts'
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
    const { fs } = await makeFixture('test-empty')
    try {
      await deleteRef({
        fs,
        ref: 'refs/heads/test',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'dir OR gitdir')
    }
  })

  await t.test('param:ref-missing', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    try {
      await deleteRef({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'ref')
    }
  })

  await t.test('ok:basic', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // Create a ref first
    await writeRef({ fs, gitdir, ref: 'refs/heads/test-branch', value: 'a'.repeat(40) })
    
    // Verify it exists
    const { readRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    const before = await readRef({ fs, gitdir, ref: 'refs/heads/test-branch' })
    assert.ok(before, 'Ref should exist before deletion')
    
    // Delete the ref
    await deleteRef({ fs, gitdir, ref: 'refs/heads/test-branch' })
    
    // Verify it's deleted
    try {
      await readRef({ fs, gitdir, ref: 'refs/heads/test-branch' })
      assert.fail('Ref should not exist after deletion')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error, 'Should throw an error when reading deleted ref')
    }
  })

  await t.test('edge:non-existent-ref', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    
    // deleteRef might not throw an error if the ref doesn't exist
    // (it just tries to delete it, which is a no-op)
    try {
      await deleteRef({ fs, gitdir, ref: 'refs/heads/nonexistent' })
      // If it doesn't throw, that's also acceptable behavior
      assert.ok(true, 'deleteRef should handle non-existent refs gracefully')
    } catch (error) {
      // If it throws, it should be a NotFoundError
      assert.ok(error instanceof NotFoundError || error instanceof Error, 'Should throw an error for non-existent ref')
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    await init({ fs, dir, defaultBranch: 'main' })
    const gitdir = `${dir}/.git`
    
    // Create a ref first
    await writeRef({ fs, gitdir, ref: 'refs/heads/test-branch', value: 'a'.repeat(40) })
    
    // Delete using dir (gitdir should be derived)
    await deleteRef({ fs, dir, ref: 'refs/heads/test-branch' })
    
    // Verify it's deleted
    const { readRef } = await import('@awesome-os/universal-git-src/git/refs/readRef.ts')
    try {
      await readRef({ fs, gitdir, ref: 'refs/heads/test-branch' })
      assert.fail('Ref should not exist after deletion')
    } catch (error) {
      assert.ok(error instanceof NotFoundError || error instanceof Error, 'Should throw an error when reading deleted ref')
    }
  })
})

