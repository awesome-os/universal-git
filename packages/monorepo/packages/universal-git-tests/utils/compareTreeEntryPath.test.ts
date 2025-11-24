import { test } from 'node:test'
import assert from 'node:assert'
import { compareTreeEntryPath } from '@awesome-os/universal-git-src/utils/compareTreeEntryPath.ts'
import type { TreeEntry } from '@awesome-os/universal-git-src/models/GitTree.ts'

test('compareTreeEntryPath', async (t) => {
  await t.test('ok:compares-file-paths', () => {
    const a: TreeEntry = { mode: '100644', path: 'file1.txt', oid: 'abc123', type: 'blob' }
    const b: TreeEntry = { mode: '100644', path: 'file2.txt', oid: 'def456', type: 'blob' }
    assert.strictEqual(compareTreeEntryPath(a, b), -1) // 'file1' < 'file2'
  })

  await t.test('ok:compares-directory-paths', () => {
    const a: TreeEntry = { mode: '040000', path: 'dir1', oid: 'abc123', type: 'tree' }
    const b: TreeEntry = { mode: '040000', path: 'dir2', oid: 'def456', type: 'tree' }
    // Should compare 'dir1/' vs 'dir2/'
    assert.strictEqual(compareTreeEntryPath(a, b), -1)
  })

  await t.test('ok:compares-file-and-directory', () => {
    const file: TreeEntry = { mode: '100644', path: 'file.txt', oid: 'abc123', type: 'blob' }
    const dir: TreeEntry = { mode: '040000', path: 'dir', oid: 'def456', type: 'tree' }
    // 'file.txt' vs 'dir/' - 'file.txt' > 'dir/' lexicographically
    assert.strictEqual(compareTreeEntryPath(file, dir), 1)
  })

  await t.test('ok:returns-0-identical-paths', () => {
    const a: TreeEntry = { mode: '100644', path: 'file.txt', oid: 'abc123', type: 'blob' }
    const b: TreeEntry = { mode: '100644', path: 'file.txt', oid: 'def456', type: 'blob' }
    assert.strictEqual(compareTreeEntryPath(a, b), 0)
  })

  await t.test('ok:handles-nested-paths', () => {
    const a: TreeEntry = { mode: '100644', path: 'a/b/file1.txt', oid: 'abc123', type: 'blob' }
    const b: TreeEntry = { mode: '100644', path: 'a/b/file2.txt', oid: 'def456', type: 'blob' }
    assert.strictEqual(compareTreeEntryPath(a, b), -1)
  })

  await t.test('ok:handles-dir-same-name-as-file', () => {
    const file: TreeEntry = { mode: '100644', path: 'name', oid: 'abc123', type: 'blob' }
    const dir: TreeEntry = { mode: '040000', path: 'name', oid: 'def456', type: 'tree' }
    // 'name' vs 'name/' - 'name' < 'name/' lexicographically
    assert.strictEqual(compareTreeEntryPath(file, dir), -1)
  })

  await t.test('ok:sorts-directories-correctly', () => {
    const a: TreeEntry = { mode: '040000', path: 'a', oid: 'abc123', type: 'tree' }
    const b: TreeEntry = { mode: '040000', path: 'b', oid: 'def456', type: 'tree' }
    assert.strictEqual(compareTreeEntryPath(a, b), -1)
  })
})

