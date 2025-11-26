import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setConfig } from '@awesome-os/universal-git-src/index.ts'
import { normalizeCommitterObject } from '@awesome-os/universal-git-src/utils/normalizeCommitterObject.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

describe('normalizeCommitterObject', () => {
  it('ok:return-committer-all-properties', async () => {
    // Setup
    const { repo } = await makeFixture('test-normalizeAuthorObject', { init: true })

    await setConfig({
      repo,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      repo,
      path: 'user.email',
      value: `user-config@example.com`,
    })

    // Test
    const author = {
      name: 'user-author',
      email: 'user-author@example.com',
      timestamp: 1720159690,
      timezoneOffset: -120,
    }

    const committer = {
      name: 'user-committer',
      email: 'user-committer@example.com',
      timestamp: 1720165308,
      timezoneOffset: -60,
    }

    assert.deepStrictEqual(
      await normalizeCommitterObject({ repo, author, committer }),
      committer
    )
  })

  it('ok:return-author-values-no-committer', async () => {
    // Setup
    const { repo } = await makeFixture('test-normalizeAuthorObject', { init: true })

    await setConfig({
      repo,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      repo,
      path: 'user.email',
      value: `user-config@example.com`,
    })

    // Test
    const author = {
      name: 'user-author',
      email: 'user-author@example.com',
      timestamp: 1720159690,
      timezoneOffset: -120,
    }

    assert.deepStrictEqual(await normalizeCommitterObject({ repo, author }), author)
  })

  it('ok:return-commit-committer-no-provided', async () => {
    // Setup
    const { repo } = await makeFixture('test-normalizeAuthorObject', { init: true })

    await setConfig({
      repo,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      repo,
      path: 'user.email',
      value: `user-config@example.com`,
    })

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

    assert.deepStrictEqual(await normalizeCommitterObject({ repo, commit }), commit.committer)
  })

  it('ok:return-config-values-no-provided', async () => {
    // Setup
    const { repo } = await makeFixture('test-normalizeAuthorObject', { init: true })

    await setConfig({
      repo,
      path: 'user.name',
      value: `user-config`,
    })

    await setConfig({
      repo,
      path: 'user.email',
      value: `user-config@example.com`,
    })

    // Test
    const committer = await normalizeCommitterObject({ repo })
    assert.strictEqual(committer.name, 'user-config')
    assert.strictEqual(committer.email, 'user-config@example.com')
    assert.strictEqual(typeof committer.timestamp, 'number')
    assert.strictEqual(typeof committer.timezoneOffset, 'number')
  })

  it('edge:return-undefined-no-value', async () => {
    // Setup
    const { repo: _repo } = await makeFixture('test-normalizeAuthorObject', { init: true })
    const fs = _repo.fs
    const gitdir = await _repo.getGitdir()

    // Disable auto-detection and ignore system/global config to ensure no config values are found
    const repo = await Repository.open({ fs, gitdir, cache: {}, autoDetectConfig: false, ignoreSystemConfig: true })

    // Test
    // With ignoreSystemConfig: true, only local config is read, so if no local config is set,
    // normalizeCommitterObject should return undefined
    assert.strictEqual(await normalizeCommitterObject({ repo }), undefined)
  })
})

