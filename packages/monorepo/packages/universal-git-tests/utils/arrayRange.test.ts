import { test } from 'node:test'
import assert from 'node:assert'
import { arrayRange } from '@awesome-os/universal-git-src/utils/arrayRange.ts'

test('arrayRange', async (t) => {
  await t.test('ok:creates-range-start-to-end-1', () => {
    const result = arrayRange(0, 5)
    assert.deepStrictEqual(result, [0, 1, 2, 3, 4])
  })

  await t.test('edge:empty-array-start-equals-end', () => {
    const result = arrayRange(5, 5)
    assert.deepStrictEqual(result, [])
  })

  await t.test('ok:creates-single-element-array', () => {
    const result = arrayRange(0, 1)
    assert.deepStrictEqual(result, [0])
  })

  await t.test('ok:handles-non-zero-start', () => {
    const result = arrayRange(5, 10)
    assert.deepStrictEqual(result, [5, 6, 7, 8, 9])
  })

  await t.test('ok:handles-negative-start', () => {
    const result = arrayRange(-2, 2)
    assert.deepStrictEqual(result, [-2, -1, 0, 1])
  })

  await t.test('ok:handles-large-numbers', () => {
    const result = arrayRange(0, 10)
    assert.strictEqual(result.length, 10)
    assert.strictEqual(result[0], 0)
    assert.strictEqual(result[9], 9)
  })
})
