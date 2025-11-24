import { test } from 'node:test'
import assert from 'node:assert'
import { forAwait } from '@awesome-os/universal-git-src/utils/forAwait.ts'

test('forAwait', async (t) => {
  await t.test('ok:iterates-async-iterable', async () => {
    async function* gen() {
      yield 1
      yield 2
      yield 3
    }
    const values: number[] = []
    await forAwait(gen(), (value) => {
      values.push(value)
    })
    assert.deepStrictEqual(values, [1, 2, 3])
  })

  await t.test('ok:iterates-sync-iterable', async () => {
    const arr = [10, 20, 30]
    const values: number[] = []
    await forAwait(arr, (value) => {
      values.push(value)
    })
    assert.deepStrictEqual(values, [10, 20, 30])
  })

  await t.test('ok:handles-async-callback', async () => {
    async function* gen() {
      yield 1
      yield 2
    }
    const values: number[] = []
    await forAwait(gen(), async (value) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      values.push(value * 2)
    })
    assert.deepStrictEqual(values, [2, 4])
  })

  await t.test('edge:empty-iterable', async () => {
    const values: number[] = []
    await forAwait([], (value) => {
      values.push(value)
    })
    assert.deepStrictEqual(values, [])
  })

  await t.test('ok:handles-single-value', async () => {
    const values: number[] = []
    await forAwait([42], (value) => {
      values.push(value)
    })
    assert.deepStrictEqual(values, [42])
  })

  await t.test('ok:calls-return-on-iterator', async () => {
    let returnCalled = false
    let nextCalled = 0
    const iterator = {
      next() {
        nextCalled++
        // Return done: true after first call to prevent infinite loop
        return Promise.resolve({ value: nextCalled === 1 ? 1 : undefined, done: nextCalled > 1 })
      },
      return() {
        returnCalled = true
        return Promise.resolve({ done: true })
      },
    }
    await forAwait(iterator, () => {})
    assert.strictEqual(returnCalled, true)
  })

  await t.test('behavior:skips-undefined-values', async () => {
    async function* gen() {
      yield 1
      yield undefined
      yield 3
    }
    const values: (number | undefined)[] = []
    await forAwait(gen(), (value) => {
      values.push(value)
    })
    // Note: the implementation checks `if (value)` so undefined values are skipped
    assert.deepStrictEqual(values, [1, 3])
  })
})

