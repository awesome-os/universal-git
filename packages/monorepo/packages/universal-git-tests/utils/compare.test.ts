import { test } from 'node:test'
import assert from 'node:assert'
import {
  compareStrings,
  compareRefNames,
  comparePath,
  compareTreeEntryPath,
  compareAge,
} from '@awesome-os/universal-git-src/utils/compare.ts'

test('compare.ts - unified comparison utilities', async (t) => {
  await t.test('ok:compareStrings-a-lt-b', () => {
    const result = compareStrings('apple', 'banana')
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compareStrings-a-gt-b', () => {
    const result = compareStrings('banana', 'apple')
    assert.strictEqual(result, 1)
  })

  await t.test('ok:compareStrings-a-eq-b', () => {
    const result = compareStrings('apple', 'apple')
    assert.strictEqual(result, 0)
  })

  await t.test('edge:compareStrings-empty-strings', () => {
    const result = compareStrings('', '')
    assert.strictEqual(result, 0)
  })

  await t.test('edge:compareStrings-one-empty', () => {
    const result = compareStrings('', 'apple')
    assert.strictEqual(result, -1) // empty < 'apple'
  })

  await t.test('ok:compareStrings-case-sensitive', () => {
    const result = compareStrings('Apple', 'apple')
    assert.strictEqual(result, -1) // 'A' < 'a' in ASCII
  })

  await t.test('ok:comparePath-a-lt-b', () => {
    const result = comparePath({ path: 'a.txt' }, { path: 'b.txt' })
    assert.strictEqual(result, -1)
  })

  await t.test('ok:comparePath-a-gt-b', () => {
    const result = comparePath({ path: 'b.txt' }, { path: 'a.txt' })
    assert.strictEqual(result, 1)
  })

  await t.test('ok:comparePath-a-eq-b', () => {
    const result = comparePath({ path: 'file.txt' }, { path: 'file.txt' })
    assert.strictEqual(result, 0)
  })

  await t.test('ok:comparePath-nested', () => {
    const result = comparePath({ path: 'dir/a.txt' }, { path: 'dir/b.txt' })
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compareTreeEntryPath-files', () => {
    const result = compareTreeEntryPath(
      { path: 'a.txt', mode: '100644' },
      { path: 'b.txt', mode: '100644' }
    )
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compareTreeEntryPath-directories', () => {
    const result = compareTreeEntryPath(
      { path: 'dir1', mode: '040000' },
      { path: 'dir2', mode: '040000' }
    )
    // Should append '/' to both, then compare 'dir1/' vs 'dir2/'
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compareTreeEntryPath-file-vs-dir', () => {
    const result = compareTreeEntryPath(
      { path: 'file', mode: '100644' },
      { path: 'file', mode: '040000' }
    )
    // 'file' vs 'file/' - file should come before directory
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compareTreeEntryPath-dir-vs-file', () => {
    const result = compareTreeEntryPath(
      { path: 'file', mode: '040000' },
      { path: 'file', mode: '100644' }
    )
    // 'file/' vs 'file' - directory should come after file
    assert.strictEqual(result, 1)
  })

  await t.test('ok:compareTreeEntryPath-same-file', () => {
    const result = compareTreeEntryPath(
      { path: 'file.txt', mode: '100644' },
      { path: 'file.txt', mode: '100644' }
    )
    assert.strictEqual(result, 0)
  })

  await t.test('ok:compareTreeEntryPath-same-directory', () => {
    const result = compareTreeEntryPath(
      { path: 'dir', mode: '040000' },
      { path: 'dir', mode: '040000' }
    )
    // 'dir/' vs 'dir/' - should be equal
    assert.strictEqual(result, 0)
  })

  await t.test('ok:compareRefNames', () => {
    // Test that compareRefNames from compare.ts works the same as standalone
    const result = compareRefNames('refs/heads/a', 'refs/heads/b')
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compareAge', () => {
    // Test that compareAge from compare.ts works
    const a = { committer: { timestamp: 1000 } }
    const b = { committer: { timestamp: 2000 } }
    const result = compareAge(a, b)
    assert.strictEqual(result, -1000)
  })
})

