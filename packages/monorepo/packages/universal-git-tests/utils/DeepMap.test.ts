import { test } from 'node:test'
import assert from 'node:assert'
import { DeepMap } from '@awesome-os/universal-git-src/utils/DeepMap.ts'

test('DeepMap', async (t) => {
  await t.test('ok:set-get-single-key', () => {
    const map = new DeepMap<string, number>()
    map.set(['key1'], 42)

    const result = map.get(['key1'])
    assert.strictEqual(result, 42)
  })

  await t.test('ok:set-get-multiple-keys', () => {
    const map = new DeepMap<string, number>()
    map.set(['level1', 'level2', 'level3'], 100)

    const result = map.get(['level1', 'level2', 'level3'])
    assert.strictEqual(result, 100)
  })

  await t.test('ok:has-returns-true-existing', () => {
    const map = new DeepMap<string, string>()
    map.set(['key'], 'value')

    assert.strictEqual(map.has(['key']), true)
  })

  await t.test('ok:has-returns-false-non-existing', () => {
    const map = new DeepMap<string, string>()
    map.set(['key1'], 'value1')

    assert.strictEqual(map.has(['key2']), false)
  })

  await t.test('ok:has-returns-false-nested', () => {
    const map = new DeepMap<string, string>()
    map.set(['level1', 'level2'], 'value')

    assert.strictEqual(map.has(['level1', 'level3']), false)
  })

  await t.test('ok:get-returns-undefined-non-existing', () => {
    const map = new DeepMap<string, number>()
    map.set(['key1'], 42)

    const result = map.get(['key2'])
    assert.strictEqual(result, undefined)
  })

  await t.test('ok:set-overwrites-existing', () => {
    const map = new DeepMap<string, number>()
    map.set(['key'], 42)
    map.set(['key'], 100)

    const result = map.get(['key'])
    assert.strictEqual(result, 100)
  })

  await t.test('ok:set-get-number-keys', () => {
    const map = new DeepMap<number, string>()
    map.set([1, 2, 3], 'value')

    const result = map.get([1, 2, 3])
    assert.strictEqual(result, 'value')
  })

  await t.test('ok:set-get-mixed-depth-paths', () => {
    const map = new DeepMap<string, string>()
    // Note: Once you set a value at a path, you can't set nested values under it
    // because that path becomes a value, not a map. So we test separate paths.
    map.set(['a'], 'value1')
    map.set(['x', 'y'], 'value2')
    // Can't set ['x', 'y', 'z'] after ['x', 'y'] is set as a value
    // Instead, test that we can set deeper paths before setting shallower ones
    map.set(['p', 'q', 'r'], 'value3')

    assert.strictEqual(map.get(['a']), 'value1')
    assert.strictEqual(map.get(['x', 'y']), 'value2')
    assert.strictEqual(map.get(['p', 'q', 'r']), 'value3')
  })

  await t.test('edge:get-empty-key-array', () => {
    const map = new DeepMap<string, number>()
    map.set(['key'], 42)

    // Empty array should pop() to get last key, which would be undefined
    // This is an edge case - the function will try to get from root with undefined key
    const result = map.get([])
    // Behavior depends on implementation - likely undefined
    assert.strictEqual(result, undefined)
  })

  await t.test('edge:set-empty-key-array', () => {
    const map = new DeepMap<string, number>()
    // Empty array means keysCopy.pop() returns undefined, so lastKey is undefined
    // This sets a value with undefined key in root map
    map.set([], 42)

    const result = map.get([])
    // Actually returns the value because it was set with undefined key
    assert.strictEqual(result, 42)
  })

  await t.test('ok:multiple-independent-paths', () => {
    const map = new DeepMap<string, number>()
    map.set(['path1', 'sub1'], 10)
    map.set(['path1', 'sub2'], 20)
    map.set(['path2', 'sub1'], 30)

    assert.strictEqual(map.get(['path1', 'sub1']), 10)
    assert.strictEqual(map.get(['path1', 'sub2']), 20)
    assert.strictEqual(map.get(['path2', 'sub1']), 30)
  })
})

