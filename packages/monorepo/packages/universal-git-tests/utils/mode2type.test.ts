import { test } from 'node:test'
import assert from 'node:assert'
import { mode2type } from '@awesome-os/universal-git-src/utils/mode2type.ts'
import { InternalError } from '@awesome-os/universal-git-src/errors/InternalError.ts'

test('mode2type', async (t) => {
  await t.test('ok:returns-tree-directory', () => {
    assert.strictEqual(mode2type(0o040000), 'tree')
  })

  await t.test('ok:returns-blob-regular-file', () => {
    assert.strictEqual(mode2type(0o100644), 'blob')
  })

  await t.test('ok:returns-blob-executable-file', () => {
    assert.strictEqual(mode2type(0o100755), 'blob')
  })

  await t.test('ok:returns-blob-symlink', () => {
    assert.strictEqual(mode2type(0o120000), 'blob')
  })

  await t.test('ok:returns-commit-gitlink', () => {
    assert.strictEqual(mode2type(0o160000), 'commit')
  })

  await t.test('error:InternalError-invalid-mode', () => {
    assert.throws(() => {
      mode2type(0o123456)
    }, (err: Error) => {
      return err instanceof InternalError && err.message.includes('Unexpected GitTree entry mode')
    })
  })

  await t.test('error:InternalError-zero-mode', () => {
    assert.throws(() => {
      mode2type(0)
    }, (err: Error) => {
      return err instanceof InternalError && err.message.includes('Unexpected GitTree entry mode')
    })
  })
})

