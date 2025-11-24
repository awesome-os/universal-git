import { test } from 'node:test'
import assert from 'node:assert'
import { createErrorClass, createTypedErrorClass } from '@awesome-os/universal-git-src/utils/errorFactory.ts'
import { BaseError } from '@awesome-os/universal-git-src/errors/BaseError.ts'

test('errorFactory', async (t) => {
  await t.test('ok:createErrorClass-string-message', () => {
    const TestError = createErrorClass('TEST_ERROR', 'Test error message')

    const error = new TestError({})

    assert.ok(error instanceof BaseError)
    assert.strictEqual(error.code, 'TEST_ERROR')
    assert.strictEqual(error.name, 'TEST_ERROR')
    assert.strictEqual(error.message, 'Test error message')
    assert.deepStrictEqual(error.data, {})
  })

  await t.test('ok:createErrorClass-function-message', () => {
    const TestError = createErrorClass<{ value: number }>(
      'TEST_ERROR',
      (data) => `Test error with value: ${data.value}`
    )

    const error = new TestError({ value: 42 })

    assert.ok(error instanceof BaseError)
    assert.strictEqual(error.code, 'TEST_ERROR')
    assert.strictEqual(error.message, 'Test error with value: 42')
    assert.deepStrictEqual(error.data, { value: 42 })
  })

  await t.test('ok:createErrorClass-custom-message', () => {
    const TestError = createErrorClass('TEST_ERROR', 'Default message')

    const error = new TestError({}, 'Custom message')

    assert.strictEqual(error.message, 'Custom message')
    assert.strictEqual(error.code, 'TEST_ERROR')
  })

  await t.test('ok:createErrorClass-with-data', () => {
    const TestError = createErrorClass<{ file: string; line: number }>(
      'TEST_ERROR',
      'Test error'
    )

    const error = new TestError({ file: 'test.ts', line: 10 })

    assert.deepStrictEqual(error.data, { file: 'test.ts', line: 10 })
  })

  await t.test('ok:createErrorClass-static-code', () => {
    const TestError = createErrorClass('MY_ERROR', 'Message')

    assert.strictEqual(TestError.code, 'MY_ERROR')
  })

  await t.test('ok:createTypedErrorClass-message-builder', () => {
    const TestError = createTypedErrorClass<{ name: string }>(
      'TYPED_ERROR',
      (data) => `Error for ${data.name}`
    )

    const error = new TestError({ name: 'test' })

    assert.ok(error instanceof BaseError)
    assert.strictEqual(error.code, 'TYPED_ERROR')
    assert.strictEqual(error.name, 'TYPED_ERROR')
    assert.strictEqual(error.message, 'Error for test')
    assert.deepStrictEqual(error.data, { name: 'test' })
  })

  await t.test('ok:createTypedErrorClass-static-code', () => {
    const TestError = createTypedErrorClass('TYPED_ERROR', () => 'Message')

    assert.strictEqual(TestError.code, 'TYPED_ERROR')
  })

  await t.test('ok:createTypedErrorClass-complex-data', () => {
    const TestError = createTypedErrorClass<{ 
      operation: string
      details: { code: number; message: string }
    }>(
      'COMPLEX_ERROR',
      (data) => `${data.operation} failed: ${data.details.message}`
    )

    const error = new TestError({
      operation: 'fetch',
      details: { code: 404, message: 'Not found' }
    })

    assert.strictEqual(error.message, 'fetch failed: Not found')
    assert.deepStrictEqual(error.data, {
      operation: 'fetch',
      details: { code: 404, message: 'Not found' }
    })
  })

  await t.test('ok:createErrorClass-error-inheritance', () => {
    const TestError = createErrorClass('INHERIT_ERROR', 'Message')

    const error = new TestError({})

    assert.ok(error instanceof Error)
    assert.ok(error instanceof BaseError)
    assert.ok(error instanceof TestError)
  })
})

