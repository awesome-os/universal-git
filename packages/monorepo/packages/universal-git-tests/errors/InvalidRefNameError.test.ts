import { test } from 'node:test'
import assert from 'node:assert'
import { InvalidRefNameError } from '@awesome-os/universal-git-src/errors/InvalidRefNameError.ts'

test('InvalidRefNameError', async (t) => {
  await t.test('creates error with ref name and suggestion', () => {
    const error = new InvalidRefNameError('invalid/ref', 'invalid-ref')
    assert.strictEqual(error.code, 'InvalidRefNameError')
    assert.strictEqual(error.name, 'InvalidRefNameError')
    assert.strictEqual(error.data.ref, 'invalid/ref')
    assert.strictEqual(error.data.suggestion, 'invalid-ref')
    assert.ok(error.message.includes('invalid/ref'))
    assert.ok(error.message.includes('invalid-ref'))
  })
})

