import { test } from 'node:test'
import assert from 'node:assert'
import { resolveCommit } from '@awesome-os/universal-git-src/utils/resolveCommit.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { writeCommit, writeTag, writeBlob, writeTree } from '@awesome-os/universal-git-src/index.ts'
import { ObjectTypeError } from '@awesome-os/universal-git-src/errors/ObjectTypeError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('resolveCommit', async (t) => {
  await t.test('ok:resolves-commit', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const commitOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test Author', email: 'author@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test Author', email: 'author@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Test commit message',
      },
      cache,
    })
    
    const result = await resolveCommit({
      fs: fs,
      cache,
      gitdir,
      oid: commitOid,
    })
    
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.commit)
    assert.strictEqual(result.commit.tree, treeOid)
    // Commit messages may have trailing newlines from normalization
    assert.ok(result.commit.message.includes('Test commit message'), 'Message should contain expected text')
    assert.strictEqual(result.commit.message.trim(), 'Test commit message', 'Message should match when trimmed')
    assert.strictEqual(result.commit.author.name, 'Test Author')
  })

  await t.test('ok:peels-tag-to-commit', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const commitOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Tagged commit',
      },
      cache,
    })
    
    const tagOid = await writeTag({
      repo,
      tag: {
        object: commitOid,
        type: 'commit',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Tag message',
      },
      cache,
    })
    
    const result = await resolveCommit({
      fs: fs,
      cache,
      gitdir,
      oid: tagOid,
    })
    
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.commit)
    assert.strictEqual(result.commit.tree, treeOid)
  })

  await t.test('error:ObjectTypeError-non-commit', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      repo,
      blob: UniversalBuffer.from('content'),
      cache,
    })
    
    await assert.rejects(
      async () => {
        await resolveCommit({
          fs: fs,
          cache,
          gitdir,
          oid: blobOid,
        })
      },
      (error: any) => {
        return error instanceof ObjectTypeError && error.data?.expected === 'commit'
      }
    )
  })

  await t.test('error:NotFoundError-non-existent', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const nonExistentOid = 'a'.repeat(40)
    
    await assert.rejects(
      async () => {
        await resolveCommit({
          fs: fs,
          cache,
          gitdir,
          oid: nonExistentOid,
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })

  await t.test('ok:commit-with-parent', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const parentOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Parent commit',
      },
      cache,
    })
    
    const commitOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [parentOid],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567891, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567891, timezoneOffset: 0 },
        message: 'Child commit',
      },
      cache,
    })
    
    const result = await resolveCommit({
      fs: fs,
      cache,
      gitdir,
      oid: commitOid,
    })
    
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.commit)
    assert.ok(Array.isArray(result.commit.parent))
    assert.strictEqual(result.commit.parent[0], parentOid)
  })

  await t.test('ok:commit-multiple-parents', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const parent1Oid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Parent 1',
      },
      cache,
    })
    
    const parent2Oid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Parent 2',
      },
      cache,
    })
    
    const commitOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [parent1Oid, parent2Oid],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567892, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567892, timezoneOffset: 0 },
        message: 'Merge commit',
      },
      cache,
    })
    
    const result = await resolveCommit({
      fs: fs,
      cache,
      gitdir,
      oid: commitOid,
    })
    
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.commit)
    assert.ok(Array.isArray(result.commit.parent))
    assert.strictEqual(result.commit.parent.length, 2)
    assert.strictEqual(result.commit.parent[0], parent1Oid)
    assert.strictEqual(result.commit.parent[1], parent2Oid)
  })

  await t.test('ok:commit-different-committer', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const commitOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Author', email: 'author@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Committer', email: 'committer@example.com', timestamp: 1234567891, timezoneOffset: 0 },
        message: 'Commit with different committer',
      },
      cache,
    })
    
    const result = await resolveCommit({
      fs: fs,
      cache,
      gitdir,
      oid: commitOid,
    })
    
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.commit)
    assert.strictEqual(result.commit.author.name, 'Author')
    assert.strictEqual(result.commit.committer.name, 'Committer')
  })
})

