import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { getConfig } from '@awesome-os/universal-git-src/git/config.ts'

test('git/config/getConfig', async (t) => {
  await t.test('reads values from merged configs', async () => {
    const { fs, gitdir } = await makeFixture('test-config')

    const symlinks = await getConfig({ fs, gitdir, path: 'core.symlinks' })
    const remoteUrl = await getConfig({ fs, gitdir, path: 'remote.origin.url' })

    assert.strictEqual(symlinks, false)
    assert.strictEqual(remoteUrl, 'https://github.com/octocat/Hello-World.git')
  })

  await t.test('returns undefined for missing entries', async () => {
    const { fs, gitdir } = await makeFixture('test-config')

    const value = await getConfig({ fs, gitdir, path: 'core.nonexistent' })

    assert.strictEqual(value, undefined)
  })
})

