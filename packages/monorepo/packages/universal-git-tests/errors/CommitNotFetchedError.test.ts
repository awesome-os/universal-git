import { test } from 'node:test'
import assert from 'node:assert'
import { CommitNotFetchedError } from '@awesome-os/universal-git-src/errors/CommitNotFetchedError.ts'

test('CommitNotFetchedError', async (t) => {
  await t.test('constructor - basic', () => {
    const error = new CommitNotFetchedError('refs/heads/main', 'abc123def456')
    
    assert.strictEqual(error.code, 'CommitNotFetchedError')
    assert.strictEqual(error.name, 'CommitNotFetchedError')
    assert.ok(error.message.includes('refs/heads/main'))
    assert.ok(error.message.includes('abc123def456'))
    assert.ok(error.message.includes('not available locally'))
    assert.ok(error.message.includes('git fetch'))
    assert.deepStrictEqual(error.data, { ref: 'refs/heads/main', oid: 'abc123def456' })
    assert.ok(error instanceof CommitNotFetchedError)
  })

  await t.test('constructor - different ref formats', () => {
    const error1 = new CommitNotFetchedError('HEAD', 'def456abc789')
    assert.ok(error1.message.includes('HEAD'))
    assert.deepStrictEqual(error1.data, { ref: 'HEAD', oid: 'def456abc789' })

    const error2 = new CommitNotFetchedError('refs/tags/v1.0.0', '123abc456def')
    assert.ok(error2.message.includes('refs/tags/v1.0.0'))
    assert.deepStrictEqual(error2.data, { ref: 'refs/tags/v1.0.0', oid: '123abc456def' })
  })

  await t.test('constructor - with cause', () => {
    const cause = new Error('Network error')
    const error = new CommitNotFetchedError('refs/heads/feature', 'abc123', cause)
    
    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'CommitNotFetchedError')
  })

  await t.test('static code property', () => {
    assert.strictEqual(CommitNotFetchedError.code, 'CommitNotFetchedError')
  })
})

