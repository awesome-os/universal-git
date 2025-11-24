import { test } from 'node:test'
import assert from 'node:assert'
import { BaseError } from '@awesome-os/universal-git-src/errors/BaseError.ts'

test('BaseError', async (t) => {
  await t.test('constructor - creates error with message', () => {
    const error = new BaseError('Test error message')
    assert.strictEqual(error.message, 'Test error message')
    assert.ok(error instanceof Error)
    assert.ok(error instanceof BaseError)
  })

  await t.test('constructor - initializes default properties', () => {
    const error = new BaseError('Test error')
    assert.strictEqual(error.code, '')
    assert.deepStrictEqual(error.data, {})
    assert.strictEqual(error.caller, '')
    assert.strictEqual(error.cause, undefined)
  })

  await t.test('constructor - accepts cause error', () => {
    const cause = new Error('Original error')
    const error = new BaseError('Wrapped error', cause)
    assert.strictEqual(error.message, 'Wrapped error')
    assert.strictEqual(error.cause, cause)
  })

  await t.test('can set code property', () => {
    const error = new BaseError('Test error')
    error.code = 'TEST_ERROR'
    assert.strictEqual(error.code, 'TEST_ERROR')
  })

  await t.test('can set data property', () => {
    const error = new BaseError('Test error')
    error.data = { file: 'test.ts', line: 10 }
    assert.deepStrictEqual(error.data, { file: 'test.ts', line: 10 })
  })

  await t.test('can set caller property', () => {
    const error = new BaseError('Test error')
    error.caller = 'git.test'
    assert.strictEqual(error.caller, 'git.test')
  })

  await t.test('toJSON - serializes error without cause', () => {
    const error = new BaseError('Test error')
    error.code = 'TEST_ERROR'
    error.data = { file: 'test.ts' }
    error.caller = 'git.test'
    
    const json = error.toJSON()
    assert.strictEqual(json.code, 'TEST_ERROR')
    assert.deepStrictEqual(json.data, { file: 'test.ts' })
    assert.strictEqual(json.caller, 'git.test')
    assert.strictEqual(json.message, 'Test error')
    assert.ok(json.stack)
    assert.strictEqual(json.cause, undefined)
  })

  await t.test('toJSON - serializes error with cause', () => {
    const cause = new Error('Original error')
    cause.name = 'TypeError'
    const error = new BaseError('Wrapped error', cause)
    error.code = 'WRAPPED_ERROR'
    
    const json = error.toJSON()
    assert.strictEqual(json.code, 'WRAPPED_ERROR')
    assert.strictEqual(json.message, 'Wrapped error')
    assert.ok(json.cause)
    assert.strictEqual(json.cause!.message, 'Original error')
    assert.strictEqual(json.cause!.name, 'TypeError')
    assert.ok(json.cause!.stack)
  })

  await t.test('fromJSON - deserializes error without cause', () => {
    const json = {
      code: 'TEST_ERROR',
      data: { file: 'test.ts' },
      caller: 'git.test',
      message: 'Test error',
      stack: 'Error: Test error\n    at test.ts:10',
    }
    
    const error = BaseError.prototype.fromJSON.call({} as BaseError, json)
    assert.ok(error instanceof BaseError)
    assert.strictEqual(error.code, 'TEST_ERROR')
    assert.deepStrictEqual(error.data, { file: 'test.ts' })
    assert.strictEqual(error.caller, 'git.test')
    assert.strictEqual(error.message, 'Test error')
    assert.strictEqual(error.stack, json.stack)
    assert.strictEqual(error.cause, undefined)
  })

  await t.test('fromJSON - deserializes error with cause', () => {
    const json = {
      code: 'WRAPPED_ERROR',
      data: {},
      caller: 'git.test',
      message: 'Wrapped error',
      stack: 'Error: Wrapped error\n    at test.ts:10',
      cause: {
        message: 'Original error',
        name: 'TypeError',
        stack: 'TypeError: Original error\n    at original.ts:5',
      },
    }
    
    const error = BaseError.prototype.fromJSON.call({} as BaseError, json)
    assert.ok(error instanceof BaseError)
    assert.strictEqual(error.message, 'Wrapped error')
    assert.ok(error.cause)
    assert.strictEqual(error.cause!.message, 'Original error')
    assert.strictEqual(error.cause!.name, 'TypeError')
    assert.strictEqual(error.cause!.stack, json.cause.stack)
  })

  await t.test('isIsomorphicGitError - returns true', () => {
    const error = new BaseError('Test error')
    assert.strictEqual(error.isIsomorphicGitError, true)
  })

  await t.test('error chaining - cause is accessible', () => {
    const original = new Error('Original')
    const wrapped = new BaseError('Wrapped', original)
    assert.strictEqual(wrapped.cause, original)
  })

  await t.test('toJSON - preserves stack trace', () => {
    const error = new BaseError('Test error')
    const stack = error.stack
    const json = error.toJSON()
    assert.strictEqual(json.stack, stack)
  })
})

