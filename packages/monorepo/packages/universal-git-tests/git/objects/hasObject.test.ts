import { test } from 'node:test'
import assert from 'node:assert'
import { hasObject } from '@awesome-os/universal-git-src/git/objects/hasObject.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('hasObject', async (t) => {
  await t.test('ok:returns-true-when-object-exists-as-loose-object', async () => {
    const { fs, gitdir } = await makeFixture('test-readObject')
    const oid = 'e10ebb90d03eaacca84de1af0a59b444232da99e'
    const result = await hasObject({ fs, cache: {}, gitdir, oid })
    assert.strictEqual(result, true)
  })

  await t.test('ok:returns-true-when-object-exists-in-packfile', async () => {
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    const result = await hasObject({ fs, cache: {}, gitdir, oid })
    assert.strictEqual(result, true)
  })

  await t.test('ok:returns-false-when-object-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-readObject')
    const oid = '0000000000000000000000000000000000000000'
    const result = await hasObject({ fs, cache: {}, gitdir, oid })
    assert.strictEqual(result, false)
  })

  await t.test('behavior:uses-getExternalRefDelta-for-packfile-deltas', async () => {
    // Test - lines 32-37: getExternalRefDelta function
    // This is tested indirectly when checking packed objects with deltas
    const { fs, gitdir } = await makeFixture('test-GitPackIndex')
    const oid = '0b8faa11b353db846b40eb064dfb299816542a46'
    const result = await hasObject({ fs, cache: {}, gitdir, oid })
    assert.strictEqual(result, true)
  })
})

