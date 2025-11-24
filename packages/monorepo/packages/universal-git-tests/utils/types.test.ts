import { test } from 'node:test'
import assert from 'node:assert'
import { isPromiseLike, isObject, isFunction } from '@awesome-os/universal-git-src/utils/types.ts'

test('types', async (t) => {
  await t.test('ok:isPromiseLike-Promise', () => {
    const promise = Promise.resolve('value')
    assert.strictEqual(isPromiseLike(promise), true)
  })

  await t.test('ok:isPromiseLike-Promise-like', () => {
    const promiseLike = {
      then: (onFulfilled: (value: string) => void) => {
        onFulfilled('value')
        return promiseLike
      },
      catch: () => promiseLike,
    }
    assert.strictEqual(isPromiseLike(promiseLike), true)
  })

  await t.test('ok:isPromiseLike-non-Promise', () => {
    assert.strictEqual(isPromiseLike({}), false)
    assert.strictEqual(isPromiseLike([]), false)
    assert.strictEqual(isPromiseLike(null), false)
    assert.strictEqual(isPromiseLike(undefined), false)
    assert.strictEqual(isPromiseLike('string'), false)
    assert.strictEqual(isPromiseLike(123), false)
  })

  await t.test('ok:isPromiseLike-no-then', () => {
    const obj = { catch: () => {} }
    assert.strictEqual(isPromiseLike(obj), false)
  })

  await t.test('ok:isPromiseLike-no-catch', () => {
    const obj = { then: () => {} }
    assert.strictEqual(isPromiseLike(obj), false)
  })

  await t.test('ok:isObject-plain-objects', () => {
    assert.strictEqual(isObject({}), true)
    assert.strictEqual(isObject({ key: 'value' }), true)
    assert.strictEqual(isObject([]), true) // Arrays are objects
    assert.strictEqual(isObject(new Date()), true)
  })

  await t.test('ok:isObject-null', () => {
    assert.strictEqual(isObject(null), false)
  })

  await t.test('ok:isObject-primitives', () => {
    assert.strictEqual(isObject(undefined), false)
    assert.strictEqual(isObject('string'), false)
    assert.strictEqual(isObject(123), false)
    assert.strictEqual(isObject(true), false)
    assert.strictEqual(isObject(Symbol('test')), false)
  })

  await t.test('ok:isFunction-functions', () => {
    assert.strictEqual(isFunction(() => {}), true)
    assert.strictEqual(isFunction(function() {}), true)
    assert.strictEqual(isFunction(async () => {}), true)
    assert.strictEqual(isFunction(function*() {}), true)
  })

  await t.test('ok:isFunction-non-functions', () => {
    assert.strictEqual(isFunction({}), false)
    assert.strictEqual(isFunction([]), false)
    assert.strictEqual(isFunction(null), false)
    assert.strictEqual(isFunction(undefined), false)
    assert.strictEqual(isFunction('string'), false)
    assert.strictEqual(isFunction(123), false)
  })

  await t.test('ok:isFunction-object-with-call', () => {
    const obj = { call: () => {} }
    assert.strictEqual(isFunction(obj), false)
  })

  await t.test('ok:type-guards-TypeScript-narrowing', () => {
    const value: unknown = { key: 'value' }
    
    if (isObject(value)) {
      // TypeScript should know value is Record<string, unknown>
      assert.ok('key' in value)
      assert.strictEqual(value.key, 'value')
    }
  })
})
