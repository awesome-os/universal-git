import { test } from 'node:test'
import assert from 'node:assert'
import { assignDefined } from '@awesome-os/universal-git-src/utils/assignDefined.ts'

test('assignDefined', async (t) => {
  await t.test('ok:assigns-defined-properties', () => {
    const result = assignDefined({}, { a: 1, b: 2 }, { c: 3 })
    assert.deepStrictEqual(result, { a: 1, b: 2, c: 3 })
  })

  await t.test('behavior:skips-undefined-properties', () => {
    const result = assignDefined({}, { a: 1, b: undefined }, { c: 3 })
    assert.deepStrictEqual(result, { a: 1, c: 3 })
  })

  await t.test('behavior:includes-null-properties', () => {
    const result = assignDefined({}, { a: 1, b: null }, { c: 3 })
    // assignDefined only skips undefined, not null
    assert.deepStrictEqual(result, { a: 1, b: null, c: 3 })
  })

  await t.test('edge:empty-objects', () => {
    const result = assignDefined({}, {}, {})
    assert.deepStrictEqual(result, {})
  })

  await t.test('behavior:overwrites-later-values', () => {
    const result = assignDefined({}, { a: 1 }, { a: 2 })
    assert.deepStrictEqual(result, { a: 2 })
  })
})

