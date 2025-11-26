import { test } from 'node:test'
import assert from 'node:assert'
import { normalizeIdentity } from '@awesome-os/universal-git-src/utils/normalizeIdentity.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { setConfig } from '@awesome-os/universal-git-src/index.ts'
import type { CommitObject } from '@awesome-os/universal-git-src/models/GitCommit.ts'

test('normalizeIdentity', async (t) => {
  await t.test('ok:author-provided-values', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'author',
      provided: {
        name: 'Provided Name',
        email: 'provided@example.com',
        timestamp: 1234567890,
        timezoneOffset: -300,
      },
    })

    // Provided values should always work
    assert.notStrictEqual(result, undefined)
    assert.strictEqual(result!.name, 'Provided Name')
    assert.strictEqual(result!.email, 'provided@example.com')
    assert.strictEqual(result!.timestamp, 1234567890)
    assert.strictEqual(result!.timezoneOffset, -300)
  })

  await t.test('ok:committer-provided-values', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'committer',
      provided: {
        name: 'Committer Name',
        email: 'committer@example.com',
      },
    })

    assert.notStrictEqual(result, undefined)
    assert.strictEqual(result!.name, 'Committer Name')
    assert.strictEqual(result!.email, 'committer@example.com')
  })


  await t.test('behavior:author-priority', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    await setConfig({ repo, path: 'user.name', value: 'Config Name' })
    await setConfig({ repo, path: 'user.email', value: 'config@example.com' })

    const commit: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: {
        name: 'Commit Author',
        email: 'commit@example.com',
        timestamp: 1000,
        timezoneOffset: 0,
      },
      committer: {
        name: 'Commit Committer',
        email: 'commit-committer@example.com',
        timestamp: 1000,
        timezoneOffset: 0,
      },
      message: 'Test commit',
    }

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'author',
      provided: {
        name: 'Provided Name',
        email: 'provided@example.com',
      },
      commit,
    })

    // Provided should take priority
    assert.strictEqual(result!.name, 'Provided Name')
    assert.strictEqual(result!.email, 'provided@example.com')
  })

  await t.test('behavior:committer-priority', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    await setConfig({ repo, path: 'user.name', value: 'Config Name' })
    await setConfig({ repo, path: 'user.email', value: 'config@example.com' })

    const commit: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: {
        name: 'Commit Author',
        email: 'commit@example.com',
        timestamp: 1000,
        timezoneOffset: 0,
      },
      committer: {
        name: 'Commit Committer',
        email: 'commit-committer@example.com',
        timestamp: 1000,
        timezoneOffset: 0,
      },
      message: 'Test commit',
    }

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'committer',
      provided: {
        name: 'Provided Committer',
        email: 'provided-committer@example.com',
      },
      fallback: {
        name: 'Fallback Name',
        email: 'fallback@example.com',
      },
      commit,
    })

    // Provided should take priority
    assert.strictEqual(result!.name, 'Provided Committer')
    assert.strictEqual(result!.email, 'provided-committer@example.com')
  })

  await t.test('edge:returns-undefined-no-name', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    // Don't set user.name in config

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'author',
    })

    assert.strictEqual(result, undefined)
  })

  await t.test('behavior:uses-fallback-committer', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    await setConfig({ repo, path: 'user.name', value: 'Config Name' })
    await setConfig({ repo, path: 'user.email', value: 'config@example.com' })

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'committer',
      fallback: {
        name: 'Fallback Name',
        email: 'fallback@example.com',
      },
    })

    // Should use fallback (author) for committer
    assert.strictEqual(result!.name, 'Fallback Name')
    assert.strictEqual(result!.email, 'fallback@example.com')
  })

  await t.test('ok:uses-commit-committer', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    await setConfig({ repo, path: 'user.name', value: 'Config Name' })

    const commit: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: {
        name: 'Author',
        email: 'author@example.com',
        timestamp: 1000,
        timezoneOffset: 0,
      },
      committer: {
        name: 'Committer',
        email: 'committer@example.com',
        timestamp: 2000,
        timezoneOffset: 0,
      },
      message: 'Test',
    }

    const result = await normalizeIdentity({
      fs: repo.fs,
      gitdir,
      type: 'committer',
      commit,
    })

    // Should use commit.committer
    assert.strictEqual(result!.name, 'Committer')
    assert.strictEqual(result!.email, 'committer@example.com')
  })
})

