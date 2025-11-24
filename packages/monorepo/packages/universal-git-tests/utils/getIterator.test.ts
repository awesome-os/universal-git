import { test } from 'node:test'
import assert from 'node:assert'
import { getIterator } from '@awesome-os/universal-git-src/utils/getIterator.ts'

test('getIterator', async (t) => {
  await t.test('ok:returns-iterator-from-async-iterable', async () => {
    async function* gen() {
      yield 1
      yield 2
      yield 3
    }
    const iter = getIterator(gen())
    const result1 = await iter.next()
    assert.strictEqual(result1.value, 1)
    assert.ok(!result1.done)
  })

  await t.test('ok:returns-iterator-from-sync-iterable', async () => {
    const arr = [1, 2, 3]
    const iter = getIterator(arr)
    const result1 = await iter.next()
    assert.strictEqual(result1.value, 1)
    assert.ok(!result1.done)
  })

  await t.test('ok:returns-iterator-with-next', async () => {
    const iterator = {
      next() {
        return { value: 42, done: false }
      },
    }
    const iter = getIterator(iterator)
    const result = await iter.next()
    assert.strictEqual(result.value, 42)
  })

  await t.test('ok:converts-single-value', async () => {
    const iter = getIterator(42)
    const result = await iter.next()
    assert.strictEqual(result.value, 42)
    assert.ok(!result.done)
    
    const result2 = await iter.next()
    assert.strictEqual(result2.done, true)
  })

  await t.test('ok:handles-string-iterable', async () => {
    const iter = getIterator('abc')
    const result1 = await iter.next()
    assert.strictEqual(result1.value, 'a')
    const result2 = await iter.next()
    assert.strictEqual(result2.value, 'b')
  })

  await t.test('ok:handles-Set-iterable', async () => {
    const set = new Set([1, 2, 3])
    const iter = getIterator(set)
    const result1 = await iter.next()
    assert.ok([1, 2, 3].includes(result1.value as number))
  })

  await t.test('ok:handles-Map-iterable', async () => {
    const map = new Map([['a', 1], ['b', 2]])
    const iter = getIterator(map)
    const result1 = await iter.next()
    assert.ok(Array.isArray(result1.value))
  })
})

