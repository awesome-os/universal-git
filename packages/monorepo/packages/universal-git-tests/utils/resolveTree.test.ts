import { test } from 'node:test'
import assert from 'node:assert'
import { resolveTree } from '@awesome-os/universal-git-src/utils/resolveTree.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { writeTree, writeCommit, writeTag, writeBlob } from '@awesome-os/universal-git-src/index.ts'
import { ObjectTypeError } from '@awesome-os/universal-git-src/errors/ObjectTypeError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('resolveTree', async (t) => {
  await t.test('ok:resolves-tree', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      repo,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      repo,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: treeOid,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 1)
    assert.strictEqual(result.tree[0].path, 'file.txt')
  })

  await t.test('edge:empty-tree', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const emptyTreeOid = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: emptyTreeOid,
    })
    
    assert.strictEqual(result.oid, emptyTreeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 0)
  })

  await t.test('edge:SHA256-empty-tree', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const emptyTreeOid = '0'.repeat(64)
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: emptyTreeOid,
      objectFormat: 'sha256',
    })
    
    assert.strictEqual(result.oid, emptyTreeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 0)
  })

  await t.test('ok:resolves-commit-tree', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      repo,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      repo,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const commitOid = await writeCommit({
      repo,
      commit: {
        tree: treeOid,
        parent: [],
        author: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        committer: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Test commit',
      },
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: commitOid,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 1)
  })

  await t.test('ok:peels-tag-to-tree', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      repo,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      repo,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const tagOid = await writeTag({
      repo,
      tag: {
        object: treeOid,
        type: 'tree',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Tag message',
      },
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: tagOid,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 1)
  })

  await t.test('error:ObjectTypeError-non-tree', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      repo,
      blob: Buffer.from('content'),
      cache,
    })
    
    await assert.rejects(
      async () => {
        await resolveTree({
          fs: repo.fs,
          cache,
          gitdir,
          oid: blobOid,
        })
      },
      (error: any) => {
        return error instanceof ObjectTypeError && error.data?.expected === 'tree'
      }
    )
  })

  await t.test('error:NotFoundError-non-existent', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const nonExistentOid = 'a'.repeat(40)
    
    await assert.rejects(
      async () => {
        await resolveTree({
          fs: repo.fs,
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

  await t.test('param:objectFormat', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: treeOid,
      objectFormat: 'sha1',
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
  })

  await t.test('ok:detects-objectFormat', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      repo,
      tree: [],
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: treeOid,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
  })

  await t.test('ok:tree-multiple-entries', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const blob1Oid = await writeBlob({
      repo,
      blob: Buffer.from('content1'),
      cache,
    })
    
    const blob2Oid = await writeBlob({
      repo,
      blob: Buffer.from('content2'),
      cache,
    })
    
    const nestedTreeOid = await writeTree({
      repo,
      tree: [
        { path: 'nested.txt', mode: '100644', oid: blob2Oid, type: 'blob' },
      ],
      cache,
    })
    
    const treeOid = await writeTree({
      repo,
      tree: [
        { path: 'file1.txt', mode: '100644', oid: blob1Oid, type: 'blob' },
        { path: 'file2.txt', mode: '100644', oid: blob2Oid, type: 'blob' },
        { path: 'subdir', mode: '040000', oid: nestedTreeOid, type: 'tree' },
      ],
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: treeOid,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 3)
  })

  await t.test('ok:tree-different-modes', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      repo,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      repo,
      tree: [
        { path: 'regular.txt', mode: '100644', oid: blobOid, type: 'blob' },
        { path: 'executable.sh', mode: '100755', oid: blobOid, type: 'blob' },
        { path: 'symlink.txt', mode: '120000', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const result = await resolveTree({
      fs: repo.fs,
      cache,
      gitdir,
      oid: treeOid,
    })
    
    assert.strictEqual(result.oid, treeOid)
    assert.ok(Array.isArray(result.tree))
    assert.strictEqual(result.tree.length, 3)
    
    const regular = result.tree.find(e => e.path === 'regular.txt')
    const executable = result.tree.find(e => e.path === 'executable.sh')
    const symlink = result.tree.find(e => e.path === 'symlink.txt')
    
    assert.ok(regular)
    assert.ok(executable)
    assert.ok(symlink)
    assert.strictEqual(regular.mode, '100644')
    assert.strictEqual(executable.mode, '100755')
    assert.strictEqual(symlink.mode, '120000')
  })
})

