import { test } from 'node:test'
import assert from 'node:assert'
import { withErrorCaller, setErrorCaller } from '@awesome-os/universal-git-src/utils/errorHandler.ts'

test('errorHandler', async (t) => {
  await t.test('ok:withErrorCaller-sets-caller', async () => {
    const fn = async () => {
      throw new Error('Test error')
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    
    try {
      await wrapped()
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.ok(error instanceof Error)
      assert.strictEqual(error.caller, 'git.test')
    }
  })

  await t.test('ok:withErrorCaller-passes-result', async () => {
    const fn = async () => {
      return 'success'
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    const result = await wrapped()
    
    assert.strictEqual(result, 'success')
  })

  await t.test('ok:withErrorCaller-preserves-message', async () => {
    const fn = async () => {
      throw new Error('Original error message')
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    
    try {
      await wrapped()
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.ok(error instanceof Error)
      assert.strictEqual(error.message, 'Original error message')
      assert.strictEqual(error.caller, 'git.test')
    }
  })

  await t.test('ok:withErrorCaller-multiple-arguments', async () => {
    const fn = async (a: string, b: number, c: boolean) => {
      if (c) {
        throw new Error('Error with args')
      }
      return `${a}-${b}`
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    
    // Test success case
    const result = await wrapped('test', 123, false)
    assert.strictEqual(result, 'test-123')
    
    // Test error case
    try {
      await wrapped('test', 123, true)
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.strictEqual(error.caller, 'git.test')
    }
  })

  await t.test('edge:withErrorCaller-non-Error-exceptions', async () => {
    const fn = async () => {
      throw 'string error'
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    
    try {
      await wrapped()
      assert.fail('Should have thrown')
    } catch (error: any) {
      // String errors are primitives and can't have properties set on them
      // When the implementation tries to set caller on line 17: `(err as { caller?: string }).caller = callerName`
      // it throws a TypeError because you cannot create properties on primitive strings
      // The TypeError will be thrown instead of the original string error
      assert.ok(error instanceof TypeError, 'Should throw TypeError when trying to set property on string')
      assert.ok(
        error.message.includes('Cannot create property') || 
        error.message.includes('caller') ||
        error.message.includes('string'),
        'Error should mention property creation or string'
      )
    }
  })

  await t.test('ok:setErrorCaller-sets-caller', () => {
    const error = new Error('Test error')
    setErrorCaller(error, 'git.test')
    
    assert.strictEqual((error as any).caller, 'git.test')
  })

  await t.test('edge:setErrorCaller-null', () => {
    // Should not throw
    setErrorCaller(null, 'git.test')
    assert.ok(true)
  })

  await t.test('edge:setErrorCaller-undefined', () => {
    // Should not throw
    setErrorCaller(undefined, 'git.test')
    assert.ok(true)
  })

  await t.test('edge:setErrorCaller-non-object', () => {
    // Should not throw for non-objects
    setErrorCaller('string error', 'git.test')
    setErrorCaller(123, 'git.test')
    assert.ok(true)
  })

  await t.test('ok:setErrorCaller-overwrites-caller', () => {
    const error = new Error('Test error')
    setErrorCaller(error, 'git.old')
    assert.strictEqual((error as any).caller, 'git.old')
    
    setErrorCaller(error, 'git.new')
    assert.strictEqual((error as any).caller, 'git.new')
  })

  await t.test('ok:withErrorCaller-preserves-error-type', async () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'CustomError'
      }
    }
    
    const fn = async () => {
      throw new CustomError('Custom error')
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    
    try {
      await wrapped()
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.ok(error instanceof CustomError)
      assert.strictEqual(error.name, 'CustomError')
      assert.strictEqual(error.caller, 'git.test')
    }
  })

  await t.test('ok:withErrorCaller-async-promise', async () => {
    const fn = async () => {
      return Promise.resolve('async result')
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    const result = await wrapped()
    
    assert.strictEqual(result, 'async result')
  })

  await t.test('ok:withErrorCaller-additional-properties', async () => {
    const fn = async () => {
      const error: any = new Error('Test error')
      error.code = 'TEST_CODE'
      error.data = { key: 'value' }
      throw error
    }
    
    const wrapped = withErrorCaller(fn, 'git.test')
    
    try {
      await wrapped()
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.strictEqual(error.caller, 'git.test')
      assert.strictEqual(error.code, 'TEST_CODE')
      assert.deepStrictEqual(error.data, { key: 'value' })
    }
  })
})

