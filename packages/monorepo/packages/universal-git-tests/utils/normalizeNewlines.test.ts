import { test } from 'node:test'
import assert from 'node:assert'
import { normalizeNewlines } from '@awesome-os/universal-git-src/utils/normalizeNewlines.ts'

test('normalizeNewlines', async (t) => {
  await t.test('ok:removes-carriage-returns', () => {
    const input = 'line1\rline2\rline3'
    const result = normalizeNewlines(input)
    // All \r are removed, then a single \n is added at the end
    assert.strictEqual(result, 'line1line2line3\n')
  })

  await t.test('ok:removes-extra-newlines-beginning', () => {
    const input = '\n\n\nline1\nline2'
    const result = normalizeNewlines(input)
    assert.strictEqual(result, 'line1\nline2\n')
  })

  await t.test('ok:adds-single-newline-end', () => {
    const input = 'line1\nline2'
    const result = normalizeNewlines(input)
    assert.strictEqual(result, 'line1\nline2\n')
  })

  await t.test('ok:removes-multiple-newlines-end', () => {
    const input = 'line1\nline2\n\n\n'
    const result = normalizeNewlines(input)
    assert.strictEqual(result, 'line1\nline2\n')
  })

  await t.test('ok:handles-CRLF-endings', () => {
    const input = 'line1\r\nline2\r\nline3'
    const result = normalizeNewlines(input)
    // \r is removed, \n remains, then trailing \n is removed and single \n added
    assert.strictEqual(result, 'line1\nline2\nline3\n')
  })

  await t.test('ok:handles-mixed-line-endings', () => {
    const input = 'line1\r\nline2\nline3\r'
    const result = normalizeNewlines(input)
    // \r is removed, \n remains, then trailing \n is removed and single \n added
    assert.strictEqual(result, 'line1\nline2\nline3\n')
  })

  await t.test('edge:empty-string', () => {
    const input = ''
    const result = normalizeNewlines(input)
    assert.strictEqual(result, '\n')
  })

  await t.test('edge:string-only-newlines', () => {
    const input = '\n\n\n'
    const result = normalizeNewlines(input)
    assert.strictEqual(result, '\n')
  })

  await t.test('edge:string-only-carriage-returns', () => {
    const input = '\r\r\r'
    const result = normalizeNewlines(input)
    assert.strictEqual(result, '\n')
  })

  await t.test('ok:handles-leading-trailing-newlines', () => {
    const input = '\n\nline1\nline2\n\n'
    const result = normalizeNewlines(input)
    assert.strictEqual(result, 'line1\nline2\n')
  })
})

