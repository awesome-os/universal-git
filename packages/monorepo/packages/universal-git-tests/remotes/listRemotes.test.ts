import { test } from 'node:test'
import assert from 'node:assert'
import { listRemotes } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('listRemotes', async (t) => {
  await t.test('ok:basic', async () => {
    // Setup
    const { repo } = await makeFixture('test-listRemotes')
    // Test
    const a = await listRemotes({ repo })
    assert.deepStrictEqual(a, [
      { remote: 'foo', url: 'git@github.com:foo/foo.git' },
      { remote: 'bar', url: 'git@github.com:bar/bar.git' },
    ])
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listRemotes({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-listRemotes')
    const remotes = await listRemotes({ repo })
    assert.ok(Array.isArray(remotes))
    assert.ok(remotes.length >= 0)
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-listRemotes')
    const dir = (await repo.getDir())!
    const remotes = await listRemotes({ repo, dir })
    assert.ok(Array.isArray(remotes))
    assert.ok(remotes.length >= 0)
  })

  await t.test('error:caller-property', async () => {
    const { repo } = await makeFixture('test-listRemotes')
    const gitdir = await repo.getGitdir()
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listRemotes({
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listRemotes')
    }
  })

  await t.test('edge:no-remotes', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const remotes = await listRemotes({ repo })
    assert.ok(Array.isArray(remotes))
    assert.strictEqual(remotes.length, 0)
  })
})

