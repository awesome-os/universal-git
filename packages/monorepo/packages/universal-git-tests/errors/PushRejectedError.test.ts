import { test } from 'node:test'
import assert from 'node:assert'
import { PushRejectedError } from '@awesome-os/universal-git-src/errors/PushRejectedError.ts'

test('PushRejectedError', async (t) => {
  await t.test('constructor - not-fast-forward reason', () => {
    const error = new PushRejectedError('not-fast-forward')
    
    assert.strictEqual(error.code, 'PushRejectedError')
    assert.strictEqual(error.name, 'PushRejectedError')
    assert.ok(error.message.includes('not a simple fast-forward'))
    assert.ok(error.message.includes('Use "force: true"'))
    assert.deepStrictEqual(error.data, { reason: 'not-fast-forward' })
    assert.ok(error instanceof PushRejectedError)
  })

  await t.test('constructor - tag-exists reason', () => {
    const error = new PushRejectedError('tag-exists')
    
    assert.strictEqual(error.code, 'PushRejectedError')
    assert.ok(error.message.includes('tag already exists'))
    assert.ok(error.message.includes('Use "force: true"'))
    assert.deepStrictEqual(error.data, { reason: 'tag-exists' })
  })

  await t.test('constructor - with cause', () => {
    const cause = new Error('Remote error')
    const error = new PushRejectedError('not-fast-forward', cause)
    
    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'PushRejectedError')
  })

  await t.test('static code property', () => {
    assert.strictEqual(PushRejectedError.code, 'PushRejectedError')
  })
})

