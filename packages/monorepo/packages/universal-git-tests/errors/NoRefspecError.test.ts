import { test } from 'node:test'
import assert from 'node:assert'
import { NoRefspecError } from '@awesome-os/universal-git-src/errors/NoRefspecError.ts'

test('NoRefspecError', async (t) => {
  await t.test('creates error with remote name', () => {
    const error = new NoRefspecError('origin')
    assert.strictEqual(error.code, 'NoRefspecError')
    assert.strictEqual(error.name, 'NoRefspecError')
    assert.strictEqual(error.data.remote, 'origin')
    assert.ok(error.message.includes('origin'))
  })
})

