import { test } from 'node:test'
import assert from 'node:assert'
import { resolveRef, init, commit, add } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('resolveRef', async (t) => {
  await t.test('param:fs-missing', async () => {
    try {
      await resolveRef({
        gitdir: '/tmp/test.git',
        ref: 'HEAD',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:gitdir-or-dir-missing', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await resolveRef({
        fs: fs,
        // intentionally missing both gitdir and dir
        ref: 'HEAD',
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
      await resolveRef({
        repo,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'ref')
    }
  })

  await t.test('ok:resolves-ref', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a ref directly
    const testOid = 'a'.repeat(40)
    await repo.gitBackend.writeRef('refs/heads/test-branch', testOid, false, repo.cache)
    
    const resolved = await resolveRef({ repo, ref: 'refs/heads/test-branch' })
    assert.strictEqual(resolved, testOid, 'Should resolve ref to the OID')
  })

  await t.test('error:NotFoundError', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    try {
      await resolveRef({ repo, ref: 'refs/heads/nonexistent' })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError, 'Should throw NotFoundError for non-existent ref')
    }
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    // Create a ref directly
    const testOid = 'a'.repeat(40)
    await repo.gitBackend.writeRef('refs/heads/test-branch', testOid, false, repo.cache)
    
    // Resolve using dir only (gitdir should be derived)
    const resolved = await resolveRef({ repo, ref: 'refs/heads/test-branch' })
    assert.strictEqual(resolved, testOid, 'Should resolve ref using derived gitdir')
  })

  await t.test('param:depth', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true, defaultBranch: 'main' })
    
    // Create refs directly
    const mainOid = 'a'.repeat(40)
    await repo.gitBackend.writeRef('refs/heads/main', mainOid, false, repo.cache)
    
    // Create a symbolic ref pointing to main
    await repo.gitBackend.writeRef('refs/heads/test', 'refs/heads/main', false, repo.cache)
    
    // Resolve with depth
    const resolved = await resolveRef({ repo, ref: 'refs/heads/test', depth: 1 })
    // Should resolve through the symbolic ref
    assert.ok(resolved, 'Should resolve symbolic ref with depth')
    assert.strictEqual(resolved, mainOid, 'Should resolve symbolic ref with depth to main OID')
  })
})

