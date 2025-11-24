import { test } from 'node:test'
import assert from 'node:assert'
import { flat } from '@awesome-os/universal-git-src/utils/flat.ts'

test('flat', async (t) => {
  await t.test('ok:flattens-nested-arrays', () => {
    const result = flat([[1, 2], [3, 4], [5]])
    assert.deepStrictEqual(result, [1, 2, 3, 4, 5])
  })

  await t.test('edge:empty-arrays', () => {
    const result = flat([])
    assert.deepStrictEqual(result, [])
  })

  await t.test('ok:handles-single-level-arrays', () => {
    const result = flat([1, 2, 3])
    assert.deepStrictEqual(result, [1, 2, 3])
  })

  await t.test('ok:handles-mixed-types', () => {
    const result = flat([['a'], [1, 2], ['b', 'c']])
    assert.deepStrictEqual(result, ['a', 1, 2, 'b', 'c'])
  })
})

