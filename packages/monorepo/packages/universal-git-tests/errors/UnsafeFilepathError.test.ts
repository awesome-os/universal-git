import { test } from 'node:test'
import assert from 'node:assert'
import { UnsafeFilepathError } from '@awesome-os/universal-git-src/errors/UnsafeFilepathError.ts'

test('UnsafeFilepathError', async (t) => {
  await t.test('creates error with filepath', () => {
    const error = new UnsafeFilepathError('../file.txt')
    assert.strictEqual(error.code, 'UnsafeFilepathError')
    assert.strictEqual(error.name, 'UnsafeFilepathError')
    assert.strictEqual(error.data.filepath, '../file.txt')
    assert.ok(error.message.includes('../file.txt'))
  })
})

