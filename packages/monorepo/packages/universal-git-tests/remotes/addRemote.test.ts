import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, addRemote, listRemotes } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('addRemote', async (t) => {
  await t.test('ok:basic', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-addRemote')
    const remote = 'baz'
    const url = 'git@github.com:baz/baz.git'
    // Test
    await addRemote({ repo, remote, url })
    const a = await listRemotes({ repo })
    assert.deepStrictEqual(a, [
      { remote: 'foo', url: 'git@github.com:foo/foo.git' },
      { remote: 'bar', url: 'git@github.com:bar/bar.git' },
      { remote: 'baz', url: 'git@github.com:baz/baz.git' },
    ])
  })

  await t.test('param:url-missing', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-addRemote')
    const remote = 'baz'
    // Test
    let error: unknown = null
    try {
      await addRemote({
        repo,
        remote,
        url: undefined as any,
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MissingParameterError)
  })

  await t.test('error:InvalidRefNameError', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-addRemote')
    const remote = '@{HEAD~1}'
    const url = 'git@github.com:baz/baz.git'
    // Test
    let error: unknown = null
    try {
      await addRemote({ repo, remote, url })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidRefNameError)
  })
})

