import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setConfig } from '@awesome-os/universal-git-src/index.ts'
import { normalizeAuthorObject } from '@awesome-os/universal-git-src/utils/normalizeAuthorObject.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

describe('normalizeAuthorObject', () => {
  it('ok:return-author-all-properties', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-normalizeAuthorObject')

    await setConfig({
      fs,
      gitdir,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      fs,
      gitdir,
      path: 'user.email',
      value: `user-config@example.com`,
    })

    const repo = await Repository.open({ fs, gitdir, cache: {}, autoDetectConfig: true })

    // Test
    const author = {
      name: 'user',
      email: 'user@example.com',
      timestamp: 1720159690,
      timezoneOffset: -120,
    }

    assert.deepStrictEqual(await normalizeAuthorObject({ repo, author }), author)
  })

  it('ok:return-commit-author-no-provided', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-normalizeAuthorObject')

    await setConfig({
      fs,
      gitdir,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      fs,
      gitdir,
      path: 'user.email',
      value: `user-config@example.com`,
    })

    const repo = await Repository.open({ fs, gitdir, cache: {}, autoDetectConfig: true })

    // Test
    const commit = {
      message: 'commit message',
      tree: '80655da8d80aaaf92ce5357e7828dc09adb00993', // Just random SHA-1
      parent: ['d8fd39d0bbdd2dcf322d8b11390a4c5825b11495'], // Just random SHA-1
      author: {
        name: 'commit-author',
        email: 'commit-author@example.com',
        timestamp: 1720169744,
        timezoneOffset: 60,
      },
      committer: {
        name: 'commit-commiter',
        email: 'commit-commiter@example.com',
        timestamp: 1720169744,
        timezoneOffset: 120,
      },
    }

    assert.deepStrictEqual(await normalizeAuthorObject({ repo, commit }), commit.author)
  })

  it('ok:return-config-values-no-author-commit', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-normalizeAuthorObject')

    await setConfig({
      fs,
      gitdir,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      fs,
      gitdir,
      path: 'user.email',
      value: `user-config@example.com`,
    })

    const repo = await Repository.open({ fs, gitdir, cache: {}, autoDetectConfig: true })

    // Test
    const author = await normalizeAuthorObject({ repo })
    assert.strictEqual(author.name, 'user-config')
    assert.strictEqual(author.email, 'user-config@example.com')
    assert.strictEqual(typeof author.timestamp, 'number')
    assert.strictEqual(typeof author.timezoneOffset, 'number')
  })

  it('edge:return-undefined-no-value', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-normalizeAuthorObject')

    // Disable auto-detection of global/system config to ensure no config values are found
    const repo = await Repository.open({ fs, gitdir, cache: {}, autoDetectConfig: false })

    // Test
    assert.strictEqual(await normalizeAuthorObject({ repo }), undefined)
  })
})

