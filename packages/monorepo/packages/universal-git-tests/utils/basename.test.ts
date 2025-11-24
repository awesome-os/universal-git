import { test } from 'node:test'
import assert from 'node:assert'
import { basename } from '@awesome-os/universal-git-src/utils/basename.ts'

test('basename', async (t) => {
  await t.test('ok:extracts-basename-from-path', () => {
    assert.strictEqual(basename('path/to/file.txt'), 'file.txt')
  })

  await t.test('ok:handles-root-file', () => {
    assert.strictEqual(basename('file.txt'), 'file.txt')
  })

  await t.test('ok:handles-trailing-slash', () => {
    // When path ends with '/', basename returns empty string (the part after last '/')
    assert.strictEqual(basename('path/to/file.txt/'), '')
  })

  await t.test('edge:path-only-slashes', () => {
    assert.strictEqual(basename('///'), '')
  })

  await t.test('edge:empty-string', () => {
    assert.strictEqual(basename(''), '')
  })

  await t.test('ok:handles-single-directory', () => {
    assert.strictEqual(basename('dir'), 'dir')
  })

  await t.test('ok:handles-nested-paths', () => {
    assert.strictEqual(basename('a/b/c/d.txt'), 'd.txt')
  })
})
