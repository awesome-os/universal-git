import { test } from 'node:test'
import assert from 'node:assert'
import { annotatedTag, resolveRef, readTag } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('annotatedTag', async (t) => {
  await t.test('ok:creates-annotated-tag', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-annotatedTag')
    // Test
    await annotatedTag({
      repo,
      ref: 'latest',
      message: 'some tag message',
      tagger: {
        name: 'Yu Shimura',
        email: 'mail@yuhr.org',
      },
    })
    const tagRef = await resolveRef({ repo, ref: 'refs/tags/latest' })
    const { tag } = await readTag({ repo, oid: tagRef })
    assert.strictEqual(tag.object, 'cfc039a0acb68bee8bb4f3b13b6b211dbb8c1a69')
  })

  await t.test('ok:creates-annotated-tag-to-blob', async () => {
    // Setup
    const { repo, fs, dir, gitdir } = await makeFixture('test-annotatedTag')
    // Test
    await annotatedTag({
      repo,
      ref: 'latest-blob',
      message: 'some tag message',
      tagger: {
        name: 'Yu Shimura',
        email: 'mail@yuhr.org',
      },
      object: 'd670460b4b4aece5915caf5c68d12f560a9fe3e4',
    })
    const tagRef = await resolveRef({
      repo,
      ref: 'refs/tags/latest-blob',
    })
    const { tag } = await readTag({ repo, oid: tagRef })
    assert.strictEqual(tag.object, 'd670460b4b4aece5915caf5c68d12f560a9fe3e4')
  })

  await t.test('ok:creates-signed-tag', async () => {
    // Setup
    const { pgp } = await import('@isomorphic-git/pgp-plugin')
    const { repo, fs, dir, gitdir } = await makeFixture('test-annotatedTag')
    // Test
    // Import pgp-keys from fixtures directory
    const pgpKeysUrl = new URL('../__fixtures__/pgp-keys.mjs', import.meta.url).href
    const { privateKey, publicKey } = await import(pgpKeysUrl)
    await annotatedTag({
      repo,
      ref: 'latest',
      message: 'some tag message',
      tagger: {
        name: 'Yu Shimura',
        email: 'mail@yuhr.org',
      },
      signingKey: privateKey,
      onSign: pgp.sign,
    })
    const oid = await resolveRef({ repo, ref: 'latest' })
    const { tag, payload } = await readTag({ repo, oid })
    const { valid, invalid } = await pgp.verify({
      payload,
      publicKey,
      signature: tag.gpgsig,
    })
    assert.deepStrictEqual(invalid, [])
    assert.deepStrictEqual(valid, ['f2f0ced8a52613c4'])
  })
})

