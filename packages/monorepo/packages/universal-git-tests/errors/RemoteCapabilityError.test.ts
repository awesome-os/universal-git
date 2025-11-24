import { test } from 'node:test'
import assert from 'node:assert'
import { RemoteCapabilityError } from '@awesome-os/universal-git-src/errors/RemoteCapabilityError.ts'

test('RemoteCapabilityError', async (t) => {
  await t.test('constructor - shallow capability with depth parameter', () => {
    const error = new RemoteCapabilityError('shallow', 'depth')
    
    assert.strictEqual(error.code, 'RemoteCapabilityError')
    assert.strictEqual(error.name, 'RemoteCapabilityError')
    assert.ok(error.message.includes('shallow'))
    assert.ok(error.message.includes('depth'))
    assert.ok(error.message.includes('cannot be used'))
    assert.deepStrictEqual(error.data, { capability: 'shallow', parameter: 'depth' })
    assert.ok(error instanceof RemoteCapabilityError)
  })

  await t.test('constructor - deepen-since capability with since parameter', () => {
    const error = new RemoteCapabilityError('deepen-since', 'since')
    
    assert.strictEqual(error.code, 'RemoteCapabilityError')
    assert.ok(error.message.includes('deepen-since'))
    assert.ok(error.message.includes('since'))
    assert.deepStrictEqual(error.data, { capability: 'deepen-since', parameter: 'since' })
  })

  await t.test('constructor - deepen-not capability with exclude parameter', () => {
    const error = new RemoteCapabilityError('deepen-not', 'exclude')
    
    assert.strictEqual(error.code, 'RemoteCapabilityError')
    assert.ok(error.message.includes('deepen-not'))
    assert.ok(error.message.includes('exclude'))
    assert.deepStrictEqual(error.data, { capability: 'deepen-not', parameter: 'exclude' })
  })

  await t.test('constructor - deepen-relative capability with relative parameter', () => {
    const error = new RemoteCapabilityError('deepen-relative', 'relative')
    
    assert.strictEqual(error.code, 'RemoteCapabilityError')
    assert.ok(error.message.includes('deepen-relative'))
    assert.ok(error.message.includes('relative'))
    assert.deepStrictEqual(error.data, { capability: 'deepen-relative', parameter: 'relative' })
  })

  await t.test('constructor - with cause', () => {
    const cause = new Error('Protocol error')
    const error = new RemoteCapabilityError('shallow', 'depth', cause)
    
    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'RemoteCapabilityError')
  })

  await t.test('static code property', () => {
    assert.strictEqual(RemoteCapabilityError.code, 'RemoteCapabilityError')
  })
})

