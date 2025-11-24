import { test } from 'node:test'
import assert from 'node:assert'
import { CheckoutConflictError } from '@awesome-os/universal-git-src/errors/CheckoutConflictError.ts'

test('CheckoutConflictError', async (t) => {
  await t.test('constructor - single filepath', () => {
    const error = new CheckoutConflictError(['file.txt'])
    
    assert.strictEqual(error.code, 'CheckoutConflictError')
    assert.strictEqual(error.name, 'CheckoutConflictError')
    assert.ok(error.message.includes('file.txt'))
    assert.ok(error.message.includes('overwritten by checkout'))
    assert.deepStrictEqual(error.data, { filepaths: ['file.txt'] })
    assert.ok(error instanceof CheckoutConflictError)
  })

  await t.test('constructor - multiple filepaths', () => {
    const error = new CheckoutConflictError(['file1.txt', 'file2.txt', 'dir/file3.txt'])
    
    assert.strictEqual(error.code, 'CheckoutConflictError')
    assert.ok(error.message.includes('file1.txt'))
    assert.ok(error.message.includes('file2.txt'))
    assert.ok(error.message.includes('dir/file3.txt'))
    assert.deepStrictEqual(error.data, { filepaths: ['file1.txt', 'file2.txt', 'dir/file3.txt'] })
  })

  await t.test('constructor - empty filepaths array', () => {
    const error = new CheckoutConflictError([])
    
    assert.strictEqual(error.code, 'CheckoutConflictError')
    assert.ok(error.message.includes('overwritten by checkout'))
    assert.deepStrictEqual(error.data, { filepaths: [] })
  })

  await t.test('constructor - with cause', () => {
    const cause = new Error('Underlying error')
    const error = new CheckoutConflictError(['file.txt'], cause)
    
    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'CheckoutConflictError')
  })

  await t.test('static code property', () => {
    assert.strictEqual(CheckoutConflictError.code, 'CheckoutConflictError')
  })
})

