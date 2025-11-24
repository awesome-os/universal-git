import { test } from 'node:test'
import assert from 'node:assert'
import { AlreadyExistsError } from '@awesome-os/universal-git-src/errors/AlreadyExistsError.ts'

test('AlreadyExistsError', async (t) => {
  await t.test('creates error for branch', () => {
    const error = new AlreadyExistsError('branch', 'master', false)
    assert.strictEqual(error.code, 'AlreadyExistsError')
    assert.strictEqual(error.name, 'AlreadyExistsError')
    assert.strictEqual(error.data.noun, 'branch')
    assert.strictEqual(error.data.where, 'master')
    assert.strictEqual(error.data.canForce, false)
    assert.ok(error.message.includes('branch'))
    assert.ok(error.message.includes('master'))
  })

  await t.test('creates error for tag', () => {
    const error = new AlreadyExistsError('tag', 'v1.0.0', true)
    assert.strictEqual(error.code, 'AlreadyExistsError')
    assert.strictEqual(error.name, 'AlreadyExistsError')
    assert.strictEqual(error.data.noun, 'tag')
    assert.strictEqual(error.data.where, 'v1.0.0')
    assert.strictEqual(error.data.canForce, true)
  })
})

