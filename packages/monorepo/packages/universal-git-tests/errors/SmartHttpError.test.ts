import { test } from 'node:test'
import assert from 'node:assert'
import { Errors } from '@awesome-os/universal-git-src/index.ts'
const { SmartHttpError } = Errors

test('SmartHttpError', async (t) => {
  await t.test('creates error with correct message and code', () => {
    const preview = 'HTML response'
    const response = '<html>...</html>'
    const error = new SmartHttpError(preview, response)
    
    assert.strictEqual(error.code, 'SmartHttpError')
    assert.strictEqual(error.name, 'SmartHttpError')
    assert.ok(error.message.includes('smart" HTTP protocol'))
    assert.ok(error.message.includes(preview))
    assert.deepStrictEqual(error.data, { preview, response })
  })

  await t.test('supports error chaining with cause', () => {
    const cause = new Error('Network error')
    const error = new SmartHttpError('preview', 'response', cause)
    
    assert.strictEqual(error.cause, cause)
  })
})

