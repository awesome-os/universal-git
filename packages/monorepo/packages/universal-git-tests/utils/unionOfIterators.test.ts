import { test } from 'node:test'
import assert from 'node:assert'
import { unionOfIterators } from '@awesome-os/universal-git-src/utils/unionOfIterators.ts'

test('unionOfIterators', async (t) => {
  await t.test('ok:unions-two-iterators-common-values', () => {
    const set1 = ['a', 'b', 'c'][Symbol.iterator]()
    const set2 = ['b', 'c', 'd'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2]))
    
    assert.deepStrictEqual(result, [
      ['a', null],  // 'a' only in set1
      ['b', 'b'],   // 'b' in both
      ['c', 'c'],   // 'c' in both
      [null, 'd'],  // 'd' only in set2
    ])
  })

  await t.test('ok:unions-three-iterators', () => {
    const set1 = ['a', 'c'][Symbol.iterator]()
    const set2 = ['b', 'c'][Symbol.iterator]()
    const set3 = ['a', 'b', 'c'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2, set3]))
    
    assert.deepStrictEqual(result, [
      ['a', null, 'a'],  // 'a' in set1 and set3
      [null, 'b', 'b'],  // 'b' in set2 and set3
      ['c', 'c', 'c'],   // 'c' in all three
    ])
  })

  await t.test('edge:empty-iterators', () => {
    const set1 = [][Symbol.iterator]()
    const set2 = ['a', 'b'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2]))
    
    assert.deepStrictEqual(result, [
      [null, 'a'],
      [null, 'b'],
    ])
  })

  await t.test('edge:all-empty-iterators', () => {
    const set1 = [][Symbol.iterator]()
    const set2 = [][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2]))
    
    assert.deepStrictEqual(result, [])
  })

  await t.test('ok:single-iterator', () => {
    const set1 = ['x', 'y', 'z'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1]))
    
    assert.deepStrictEqual(result, [
      ['x'],
      ['y'],
      ['z'],
    ])
  })

  await t.test('ok:iterators-no-common-values', () => {
    const set1 = ['a', 'b'][Symbol.iterator]()
    const set2 = ['c', 'd'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2]))
    
    assert.deepStrictEqual(result, [
      ['a', null],
      ['b', null],
      [null, 'c'],
      [null, 'd'],
    ])
  })

  await t.test('ok:identical-iterators', () => {
    const set1 = ['a', 'b', 'c'][Symbol.iterator]()
    const set2 = ['a', 'b', 'c'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2]))
    
    assert.deepStrictEqual(result, [
      ['a', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ])
  })

  await t.test('ok:iterators-different-lengths', () => {
    const set1 = ['a', 'b', 'c', 'd'][Symbol.iterator]()
    const set2 = ['b', 'c'][Symbol.iterator]()
    const result = Array.from(unionOfIterators([set1, set2]))
    
    assert.deepStrictEqual(result, [
      ['a', null],
      ['b', 'b'],
      ['c', 'c'],
      ['d', null],
    ])
  })
})

