import { test } from 'node:test'
import assert from 'node:assert'
import { outdent } from '@awesome-os/universal-git-src/utils/outdent.ts'

test('outdent', async (t) => {
  await t.test('ok:removes-leading-space', () => {
    const result = outdent(' line1\n line2\n line3')
    assert.strictEqual(result, 'line1\nline2\nline3')
  })

  await t.test('ok:lines-without-leading-space', () => {
    const result = outdent('line1\n line2\nline3')
    assert.strictEqual(result, 'line1\nline2\nline3')
  })

  await t.test('edge:empty-string', () => {
    const result = outdent('')
    assert.strictEqual(result, '')
  })

  await t.test('edge:string-only-spaces', () => {
    const result = outdent(' \n \n ')
    assert.strictEqual(result, '\n\n')
  })

  await t.test('ok:removes-first-space-only', () => {
    const result = outdent('  line1\n  line2')
    assert.strictEqual(result, ' line1\n line2')
  })

  await t.test('ok:single-line', () => {
    const result = outdent(' hello')
    assert.strictEqual(result, 'hello')
  })

  await t.test('ok:lines-with-tabs-whitespace', () => {
    const result = outdent(' line1\n\tline2\n line3')
    assert.strictEqual(result, 'line1\n\tline2\nline3')
  })
})
