import { test } from 'node:test'
import assert from 'node:assert'
import { dirname } from '@awesome-os/universal-git-src/utils/dirname.ts'

test('dirname', async (t) => {
  await t.test('ok:extracts-directory-from-path', () => {
    assert.strictEqual(dirname('path/to/file.txt'), 'path/to')
  })

  await t.test('ok:handles-root-file', () => {
    assert.strictEqual(dirname('file.txt'), '.')
  })

  await t.test('ok:handles-trailing-slash', () => {
    assert.strictEqual(dirname('path/to/file.txt/'), 'path/to/file.txt')
  })

  await t.test('ok:handles-single-directory', () => {
    assert.strictEqual(dirname('dir'), '.')
  })

  await t.test('ok:handles-nested-paths', () => {
    assert.strictEqual(dirname('a/b/c/d.txt'), 'a/b/c')
  })

  await t.test('ok:handles-root-path', () => {
    assert.strictEqual(dirname('/'), '/')
  })

  await t.test('edge:path-only-slashes', () => {
    // lastIndexOf('/') for '///' is 2, so it returns '//'
    assert.strictEqual(dirname('///'), '//')
  })
})
