import { test } from 'node:test'
import assert from 'node:assert'
import { comparePath } from '@awesome-os/universal-git-src/utils/comparePath.ts'

test('comparePath', async (t) => {
  await t.test('ok:compares-paths-correctly', () => {
    assert.strictEqual(comparePath({ path: 'a' }, { path: 'b' }), -1)
    assert.strictEqual(comparePath({ path: 'b' }, { path: 'a' }), 1)
    assert.strictEqual(comparePath({ path: 'a' }, { path: 'a' }), 0)
  })

  await t.test('ok:handles-directory-vs-file', () => {
    // 'a/' > 'a' lexicographically because '/' > '' (empty string)
    assert.strictEqual(comparePath({ path: 'a/' }, { path: 'a' }), 1)
    assert.strictEqual(comparePath({ path: 'a' }, { path: 'a/' }), -1)
  })

  await t.test('ok:handles-nested-paths', () => {
    assert.strictEqual(comparePath({ path: 'a/b' }, { path: 'a/c' }), -1)
    assert.strictEqual(comparePath({ path: 'a/c' }, { path: 'a/b' }), 1)
  })
})

