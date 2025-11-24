import { test } from 'node:test'
import assert from 'node:assert'
import { fromValue } from '@awesome-os/universal-git-src/utils/fromValue.ts'

test('fromValue', async (t) => {
  await t.test('ok:converts-value-to-iterator', async () => {
    const iterator = fromValue('test')
    assert.ok(iterator[Symbol.asyncIterator])
    assert.strictEqual(typeof iterator.next, 'function')
    assert.strictEqual(typeof iterator.return, 'function')
  })

  await t.test('ok:next-returns-value', async () => {
    const iterator = fromValue(42)
    const result = await iterator.next()
    assert.strictEqual(result.value, 42)
    assert.strictEqual(result.done, false)
  })

  await t.test('ok:next-returns-done-after-first', async () => {
    const iterator = fromValue('hello')
    await iterator.next()
    const result = await iterator.next()
    assert.strictEqual(result.done, true)
    assert.strictEqual(result.value, undefined)
  })

  await t.test('ok:works-different-value-types', async () => {
    const iterator1 = fromValue(null)
    const result1 = await iterator1.next()
    assert.strictEqual(result1.value, null)

    const iterator2 = fromValue(undefined)
    const result2 = await iterator2.next()
    assert.strictEqual(result2.value, undefined)

    const iterator3 = fromValue({ key: 'value' })
    const result3 = await iterator3.next()
    assert.deepStrictEqual(result3.value, { key: 'value' })
  })

  await t.test('ok:return-clears-queue', async () => {
    const iterator = fromValue('test')
    const returnResult = await iterator.return()
    assert.strictEqual(returnResult.done, true)
    assert.strictEqual(returnResult.value, undefined)
    
    // After return, next should also be done
    const nextResult = await iterator.next()
    assert.strictEqual(nextResult.done, true)
  })

  await t.test('ok:iterable-with-for-await', async () => {
    const iterator = fromValue('value')
    const values: string[] = []
    for await (const value of iterator) {
      values.push(value)
    }
    assert.deepStrictEqual(values, ['value'])
  })
})

