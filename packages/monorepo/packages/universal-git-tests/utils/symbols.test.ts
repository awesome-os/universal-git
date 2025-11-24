import { test } from 'node:test'
import assert from 'node:assert'
import { GitWalkSymbol } from '@awesome-os/universal-git-src/utils/symbols.ts'

test('symbols', async (t) => {
  await t.test('ok:GitWalkSymbol-is-Symbol', () => {
    assert.strictEqual(typeof GitWalkSymbol, 'symbol')
  })

  await t.test('ok:GitWalkSymbol-description', () => {
    assert.strictEqual(GitWalkSymbol.description, 'GitWalkSymbol')
  })

  await t.test('ok:GitWalkSymbol-unique', () => {
    const symbol1 = GitWalkSymbol
    const symbol2 = GitWalkSymbol
    // Same symbol reference
    assert.strictEqual(symbol1, symbol2)
    
    // But different from a new symbol with same description
    const newSymbol = Symbol('GitWalkSymbol')
    assert.notStrictEqual(GitWalkSymbol, newSymbol)
  })

  await t.test('ok:GitWalkSymbol-object-key', () => {
    const obj: Record<symbol, string> = {}
    obj[GitWalkSymbol] = 'test'
    
    assert.strictEqual(obj[GitWalkSymbol], 'test')
  })

  await t.test('ok:GitWalkSymbol-not-enumerable', () => {
    const obj: Record<symbol, string> = {}
    obj[GitWalkSymbol] = 'test'
    obj['regularKey'] = 'value'
    
    const keys = Object.keys(obj)
    assert.ok(!keys.includes('GitWalkSymbol'))
    assert.ok(keys.includes('regularKey'))
    
    // But can be accessed via getOwnPropertySymbols
    const symbols = Object.getOwnPropertySymbols(obj)
    assert.ok(symbols.includes(GitWalkSymbol))
  })
})

