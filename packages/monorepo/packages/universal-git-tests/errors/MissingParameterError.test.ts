import { test } from 'node:test'
import assert from 'node:assert'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'

test('MissingParameterError', async (t) => {
  await t.test('creates error with parameter name', () => {
    const error = new MissingParameterError('fs')
    assert.strictEqual(error.code, 'MissingParameterError')
    assert.strictEqual(error.name, 'MissingParameterError')
    assert.strictEqual(error.data.parameter, 'fs')
    assert.ok(error.message.includes('fs'))
  })

  await t.test('extends BaseError', () => {
    const error = new MissingParameterError('test')
    assert.ok(error instanceof Error)
  })
})

