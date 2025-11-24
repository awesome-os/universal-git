import { test } from 'node:test'
import assert from 'node:assert'
import { assertParameter } from '@awesome-os/universal-git-src/utils/assertParameter.ts'
import { MissingParameterError } from '@awesome-os/universal-git-src/errors/MissingParameterError.ts'

test('assertParameter', async (t) => {
  await t.test('ok:does-not-throw-valid-values', () => {
    assert.doesNotThrow(() => {
      assertParameter('test', 'value')
      assertParameter('test', 123)
      assertParameter('test', true)
      assertParameter('test', {})
      assertParameter('test', [])
      assertParameter('test', 0)
      assertParameter('test', false)
      assertParameter('test', '')
    })
  })

  await t.test('error:throws-MissingParameterError-undefined', () => {
    assert.throws(() => {
      assertParameter('test', undefined)
    }, MissingParameterError)
  })

  await t.test('ok:does-not-throw-null', () => {
    // Note: assertParameter only checks for undefined, not null
    assert.doesNotThrow(() => {
      assertParameter('test', null)
    })
  })
})

