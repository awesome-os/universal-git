import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { getConfigAll } from '@awesome-os/universal-git-src/git/config.ts'

test('git/config/getConfigAll', async (t) => {
  await t.test('returns scoped values for multi-valued entries', async () => {
    const { fs, gitdir } = await makeFixture('test-config')

    const values = await getConfigAll({ fs, gitdir, path: 'remote.upstream.fetch' })
    const fetched = values.map(entry => entry.value)

    assert.deepStrictEqual(fetched, [
      '+refs/heads/master:refs/remotes/upstream/master',
      'refs/heads/develop:refs/remotes/upstream/develop',
      'refs/heads/qa/*:refs/remotes/upstream/qa/*',
    ])
    assert.ok(values.every(entry => entry.scope === 'local'))
  })

  await t.test('returns empty array when nothing matches', async () => {
    const { fs, gitdir } = await makeFixture('test-config')

    const values = await getConfigAll({ fs, gitdir, path: 'remote.*.nonexistent' })

    assert.deepStrictEqual(values, [])
  })
})

