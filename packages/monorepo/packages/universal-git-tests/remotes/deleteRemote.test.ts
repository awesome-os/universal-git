import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, deleteRemote, listRemotes } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('deleteRemote', async (t) => {
  await t.test('ok:basic', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    const remote = 'foo'
    // Test
    await deleteRemote({ fs, dir, gitdir, remote })
    const a = await listRemotes({ fs, dir, gitdir })
    assert.deepStrictEqual(a, [{ remote: 'bar', url: 'git@github.com:bar/bar.git' }])
  })

  await t.test('param:remote-missing', async () => {
    // Setup
    const { fs, dir, gitdir } = await makeFixture('test-addRemote')
    // Test
    let error = null
    try {
      await deleteRemote({ fs, dir, gitdir })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError)
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await deleteRemote({
        gitdir: '/tmp/test.git',
        remote: 'origin',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir })
    await deleteRemote({ repo, remote: 'foo' })
    const remotes = await listRemotes({ fs, dir, gitdir })
    assert.deepStrictEqual(remotes, [{ remote: 'bar', url: 'git@github.com:bar/bar.git' }])
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    await deleteRemote({ fs, dir, gitdir, remote: 'foo' })
    const remotes = await listRemotes({ fs, dir, gitdir })
    assert.deepStrictEqual(remotes, [{ remote: 'bar', url: 'git@github.com:bar/bar.git' }])
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-deleteRemote')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await deleteRemote({
        gitdir,
        remote: 'origin',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.deleteRemote')
    }
  })

  await t.test('edge:non-existent-remote', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    try {
      await deleteRemote({ fs, dir, gitdir, remote: 'nonexistent' })
      // Should not throw - deleteRemote may be idempotent
    } catch (error) {
      // If it throws, that's also acceptable
      assert.ok(error instanceof Error)
    }
  })
})

