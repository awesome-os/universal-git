import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { getConfig, getConfigAll, setConfig } from '@awesome-os/universal-git-src/git/config.ts'

test('git/config/setConfig', async (t) => {
  await t.test('updates and clears local config values', async () => {
    const { fs, gitdir } = await makeFixture('test-config')

    await setConfig({ fs, gitdir, path: 'core.bare', value: true })
    const bareTrue = await getConfig({ fs, gitdir, path: 'core.bare' })
    assert.strictEqual(bareTrue, true)

    await setConfig({ fs, gitdir, path: 'core.bare', value: false })
    const bareFalse = await getConfig({ fs, gitdir, path: 'core.bare' })
    assert.strictEqual(bareFalse, false)

    await setConfig({ fs, gitdir, path: 'core.bare', value: undefined })
    const cleared = await getConfig({ fs, gitdir, path: 'core.bare' })
    assert.strictEqual(cleared, undefined)
  })

  await t.test('stores multiple values for the same key', async () => {
    const { fs, gitdir } = await makeFixture('test-config')

    await setConfig({ fs, gitdir, path: 'test.multi', value: 'one' })
    await setConfig({ fs, gitdir, path: 'test.multi', value: 'two' })

    const values = await getConfigAll({ fs, gitdir, path: 'test.multi' })
    const readValues = values.map(entry => entry.value)

    assert.ok(readValues.includes('two'))
  })
})

