import { test } from 'node:test'
import assert from 'node:assert'
import { resolveFileIdInTree } from '@awesome-os/universal-git-src/utils/resolveFileIdInTree.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init, writeBlob, writeTree, writeCommit, writeRef } from '@awesome-os/universal-git-src/index.ts'

// Helper to create author/committer with timestamps
const createAuthor = (name: string, email: string) => ({
  name,
  email,
  timestamp: Math.floor(Date.now() / 1000),
  timezoneOffset: new Date().getTimezoneOffset(),
})

test('resolveFileIdInTree', async (t) => {
  await t.test('ok:resolve-file-root', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const fileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file content') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      fileId: fileOid,
    })

    assert.strictEqual(result, 'file.txt')
  })

  await t.test('ok:resolve-file-nested', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const fileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('nested file') })
    const subdirTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'nested.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'subdir', mode: '040000', oid: subdirTreeOid, type: 'tree' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      fileId: fileOid,
    })

    assert.strictEqual(result, 'subdir/nested.txt')
  })

  await t.test('ok:resolve-file-deeply-nested', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const fileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('deep file') })
    const level3TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })
    const level2TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'level3', mode: '040000', oid: level3TreeOid, type: 'tree' }],
    })
    const level1TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'level2', mode: '040000', oid: level2TreeOid, type: 'tree' }],
    })
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'level1', mode: '040000', oid: level1TreeOid, type: 'tree' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      fileId: fileOid,
    })

    assert.strictEqual(result, 'level1/level2/level3/file.txt')
  })

  await t.test('ok:resolve-file-matches-tree-OID', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: 'a'.repeat(40), type: 'blob' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      fileId: treeOid, // fileId matches tree OID
    })

    assert.strictEqual(result, '')
  })

  await t.test('ok:resolve-multiple-files-same-OID', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const fileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('same content') })
    const subdir1TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })
    const subdir2TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'dir1', mode: '040000', oid: subdir1TreeOid, type: 'tree' },
        { path: 'dir2', mode: '040000', oid: subdir2TreeOid, type: 'tree' },
      ],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      fileId: fileOid,
    })

    // Should return array with both paths
    assert.ok(Array.isArray(result))
    assert.strictEqual(result.length, 2)
    assert.ok(result.includes('dir1/file.txt'))
    assert.ok(result.includes('dir2/file.txt'))
  })

  await t.test('ok:resolve-file-single-match-returns-string', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const fileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('content') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      fileId: fileOid,
    })

    // Single match should return string, not array
    assert.strictEqual(typeof result, 'string')
    assert.strictEqual(result, 'file.txt')
  })

  await t.test('edge:empty-file-OID', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: 'a'.repeat(40), type: 'blob' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      fileId: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391', // EMPTY_OID
    })

    assert.strictEqual(result, undefined)
  })

  await t.test('error:fileId-not-found', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const fileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file content') })
    const otherFileOid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('other content') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file.txt', mode: '100644', oid: fileOid, type: 'blob' }],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      fileId: otherFileOid, // Different OID
    })

    assert.strictEqual(result, undefined)
  })

  await t.test('ok:resolve-file-multiple-files', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const file2Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file2') })
    const file3Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file3') })
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' },
        { path: 'file2.txt', mode: '100644', oid: file2Oid, type: 'blob' },
        { path: 'file3.txt', mode: '100644', oid: file3Oid, type: 'blob' },
      ],
    })

    const cache = {}
    const result1 = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      fileId: file2Oid,
    })

    assert.strictEqual(result1, 'file2.txt')
  })

  await t.test('ok:resolve-file-complex-nested', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })

    const file1Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file1') })
    const file2Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file2') })
    const file3Oid = await writeBlob({ fs, dir, gitdir, blob: Buffer.from('file3') })

    const subdir1TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file1.txt', mode: '100644', oid: file1Oid, type: 'blob' },
        { path: 'file2.txt', mode: '100644', oid: file2Oid, type: 'blob' },
      ],
    })
    const subdir2TreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [{ path: 'file3.txt', mode: '100644', oid: file3Oid, type: 'blob' }],
    })
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'subdir1', mode: '040000', oid: subdir1TreeOid, type: 'tree' },
        { path: 'subdir2', mode: '040000', oid: subdir2TreeOid, type: 'tree' },
      ],
    })

    const cache = {}
    const result = await resolveFileIdInTree({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      fileId: file2Oid,
    })

    assert.strictEqual(result, 'subdir1/file2.txt')
  })
})

