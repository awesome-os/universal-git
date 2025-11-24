import { test } from 'node:test'
import assert from 'node:assert'
import { InvalidOidError } from '@awesome-os/universal-git-src/errors/InvalidOidError.ts'

test('InvalidOidError', async (t) => {
  await t.test('creates error with value', () => {
    const error = new InvalidOidError('abc123')
    assert.strictEqual(error.code, 'InvalidOidError')
    assert.strictEqual(error.name, 'InvalidOidError')
    assert.strictEqual(error.data.value, 'abc123')
    assert.ok(error.message.includes('abc123'))
    assert.ok(error.message.includes('40-char hex object id'))
  })

  await t.test('extends BaseError', () => {
    const error = new InvalidOidError('invalid')
    assert.ok(error instanceof Error)
  })
})

