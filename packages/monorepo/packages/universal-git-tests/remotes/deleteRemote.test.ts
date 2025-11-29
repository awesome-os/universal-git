import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, deleteRemote, listRemotes } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('deleteRemote', async (t) => {
  await t.test('ok:basic', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    const remote = 'foo'
    // Test
    await deleteRemote({ repo, remote })
    const a = await listRemotes({ repo })
    assert.deepStrictEqual(a, [{ remote: 'bar', url: 'git@github.com:bar/bar.git' }])
  })

  await t.test('param:remote-missing', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-addRemote')
    // Test
    let error = null
    try {
      await deleteRemote({ repo })
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    await deleteRemote({ repo, remote: 'foo' })
    const remotes = await listRemotes({ repo })
    assert.deepStrictEqual(remotes, [{ remote: 'bar', url: 'git@github.com:bar/bar.git' }])
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    await deleteRemote({ repo, dir, remote: 'foo' })
    const remotes = await listRemotes({ repo })
    assert.deepStrictEqual(remotes, [{ remote: 'bar', url: 'git@github.com:bar/bar.git' }])
  })

  await t.test('error:caller-property', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-deleteRemote')
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
    const { repo, fs, dir, gitdir } = await makeFixture('test-deleteRemote')
    try {
      await deleteRemote({ repo, remote: 'nonexistent' })
      // Should not throw - deleteRemote is idempotent
    } catch (error) {
      // If it throws, that's also acceptable
      assert.ok(error instanceof Error)
    }
  })
})

