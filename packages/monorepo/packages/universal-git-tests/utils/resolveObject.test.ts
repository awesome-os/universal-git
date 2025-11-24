import { test } from 'node:test'
import assert from 'node:assert'
import { resolveObject } from '@awesome-os/universal-git-src/utils/resolveObject.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { writeBlob, writeCommit, writeTree, writeTag } from '@awesome-os/universal-git-src/index.ts'
import { parse as parseBlob } from '@awesome-os/universal-git-src/core-utils/parsers/Blob.ts'
import { parse as parseTree } from '@awesome-os/universal-git-src/core-utils/parsers/Tree.ts'
import { parse as parseCommit } from '@awesome-os/universal-git-src/core-utils/parsers/Commit.ts'
import { ObjectTypeError } from '@awesome-os/universal-git-src/errors/ObjectTypeError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('resolveObject', async (t) => {
  await t.test('ok:resolves-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('test content'),
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: blobOid,
      expectedType: 'blob',
      parser: parseBlob,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(UniversalBuffer.isBuffer(result.object))
    assert.strictEqual(result.object.toString(), 'test content')
  })

  await t.test('ok:resolves-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      expectedType: 'tree',
      parser: parseTree,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.object))
    assert.strictEqual(result.object.length, 1)
  })

  await t.test('ok:resolves-commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [],
      cache,
    })
    
    const commitOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Test commit',
      },
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: commitOid,
      expectedType: 'commit',
      parser: parseCommit,
    })
    
    assert.strictEqual(result.oid, commitOid)
    assert.ok(result.object)
    assert.strictEqual(result.object.tree, treeOid)
  })

  await t.test('edge:empty-tree-OID', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const emptyTreeOid = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: emptyTreeOid,
      expectedType: 'tree',
      parser: parseTree,
    })
    
    assert.strictEqual(result.oid, emptyTreeOid)
    assert.ok(Array.isArray(result.object))
    assert.strictEqual(result.object.length, 0)
  })

  await t.test('edge:custom-empty-tree-OID', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const customEmptyTreeOid = 'a'.repeat(40)
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: customEmptyTreeOid,
      expectedType: 'tree',
      parser: parseTree,
      emptyTreeOid: customEmptyTreeOid,
    })
    
    assert.strictEqual(result.oid, customEmptyTreeOid)
    assert.ok(Array.isArray(result.object))
    assert.strictEqual(result.object.length, 0)
  })

  await t.test('ok:peels-tag-to-target', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('tagged content'),
      cache,
    })
    
    const tagOid = await writeTag({
      fs,
      dir,
      gitdir,
      tag: {
        object: blobOid,
        type: 'blob',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Tag message',
      },
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: tagOid,
      expectedType: 'blob',
      parser: parseBlob,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(UniversalBuffer.isBuffer(result.object))
    assert.strictEqual(result.object.toString(), 'tagged content')
  })

  await t.test('ok:resolves-commit-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: 'a'.repeat(40), type: 'blob' },
      ],
      cache,
    })
    
    const commitOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Test commit',
      },
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: commitOid,
      expectedType: 'tree',
      parser: parseTree,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.object))
  })

  await t.test('edge:falls-back-empty-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    // Create commit with non-existent tree OID
    const nonExistentTreeOid = 'b'.repeat(40)
    const commitOid = await writeCommit({
      fs,
      dir,
      gitdir,
      commit: {
        tree: nonExistentTreeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Test commit',
      },
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: commitOid,
      expectedType: 'tree',
      parser: parseTree,
    })
    
    // Should fall back to empty tree
    assert.strictEqual(result.oid, '4b825dc642cb6eb9a060e54bf8d69288fbee4904')
    assert.ok(Array.isArray(result.object))
    assert.strictEqual(result.object.length, 0)
  })

  await t.test('error:ObjectTypeError-wrong-type', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('content'),
      cache,
    })
    
    await assert.rejects(
      async () => {
        await resolveObject({
          fs,
          cache,
          gitdir,
          oid: blobOid,
          expectedType: 'tree',
          parser: parseTree,
        })
      },
      (error: any) => {
        return error instanceof ObjectTypeError && error.data?.expected === 'tree'
      }
    )
  })

  await t.test('error:NotFoundError-non-existent', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const nonExistentOid = 'a'.repeat(40)
    
    await assert.rejects(
      async () => {
        await resolveObject({
          fs,
          cache,
          gitdir,
          oid: nonExistentOid,
          expectedType: 'blob',
          parser: parseBlob,
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })

  await t.test('param:objectFormat', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('content'),
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: blobOid,
      expectedType: 'blob',
      parser: parseBlob,
      objectFormat: 'sha1',
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })

  await t.test('ok:detects-objectFormat', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('content'),
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: blobOid,
      expectedType: 'blob',
      parser: parseBlob,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(UniversalBuffer.isBuffer(result.object))
  })

  await t.test('ok:nested-tag-peeling', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: UniversalBuffer.from('nested tagged content'),
      cache,
    })
    
    // Create first tag pointing to blob
    const tag1Oid = await writeTag({
      fs,
      dir,
      gitdir,
      tag: {
        object: blobOid,
        type: 'blob',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'First tag',
      },
      cache,
    })
    
    // Create second tag pointing to first tag
    const tag2Oid = await writeTag({
      fs,
      dir,
      gitdir,
      tag: {
        object: tag1Oid,
        type: 'tag',
        tag: 'v1.0.0-annotated',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Second tag',
      },
      cache,
    })
    
    const result = await resolveObject({
      fs,
      cache,
      gitdir,
      oid: tag2Oid,
      expectedType: 'blob',
      parser: parseBlob,
    })
    
    // Should peel through both tags to get the blob
    assert.strictEqual(result.oid, blobOid)
    assert.ok(UniversalBuffer.isBuffer(result.object))
    assert.strictEqual(result.object.toString(), 'nested tagged content')
  })
})

