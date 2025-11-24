import { test } from 'node:test'
import assert from 'node:assert'
import { InternalError } from '@awesome-os/universal-git-src/errors/InternalError.ts'

test('InternalError', async (t) => {
  await t.test('creates error with message', () => {
    const error = new InternalError('Something went wrong')
    assert.strictEqual(error.code, 'InternalError')
    assert.strictEqual(error.name, 'InternalError')
    assert.strictEqual(error.data.message, 'Something went wrong')
    assert.ok(error.message.includes('Something went wrong'))
  })

  await t.test('creates error with message in data', () => {
    const error = new InternalError('Index file is empty')
    assert.strictEqual(error.code, 'InternalError')
    assert.strictEqual(error.data.message, 'Index file is empty')
  })
})

