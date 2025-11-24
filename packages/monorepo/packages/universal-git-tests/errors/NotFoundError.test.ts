import { test } from 'node:test'
import assert from 'node:assert'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('NotFoundError', async (t) => {
  await t.test('creates error with ref name', () => {
    const error = new NotFoundError('HEAD')
    assert.strictEqual(error.code, 'NotFoundError')
    assert.strictEqual(error.name, 'NotFoundError')
    assert.strictEqual(error.data.what, 'HEAD')
    assert.ok(error.message.includes('HEAD'))
  })

  await t.test('creates error with custom message', () => {
    const error = new NotFoundError('refs/heads/master')
    assert.strictEqual(error.code, 'NotFoundError')
    assert.strictEqual(error.name, 'NotFoundError')
    assert.strictEqual(error.data.what, 'refs/heads/master')
  })
})

