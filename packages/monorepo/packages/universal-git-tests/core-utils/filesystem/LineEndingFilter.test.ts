import { test } from 'node:test'
import assert from 'node:assert'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import {
  convertLineEndings,
  normalizeToLF,
  convertForWorkdir,
  convertForStorage,
} from '@awesome-os/universal-git-src/core-utils/filesystem/LineEndingFilter.ts'

test('LineEndingFilter', async (t) => {
  await t.test('convertLineEndings with Buffer input', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    assert.ok(UniversalBuffer.isBuffer(result))
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with Uint8Array input', async () => {
    const uint8Array = new Uint8Array([76, 105, 110, 101, 32, 49, 10, 76, 105, 110, 101, 32, 50, 10])
    const result = convertLineEndings(uint8Array, 'lf')
    
    assert.ok(UniversalBuffer.isBuffer(result))
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with eol=lf', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with eol=crlf', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'crlf')
    
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })

  await t.test('convertLineEndings with eol=auto on unix platform', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertLineEndings(buffer, 'auto', 'unix')
    
    // Unix platform should use LF
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with eol=auto on windows platform', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'auto', 'windows')
    
    // Windows platform should use CRLF
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })

  await t.test('convertLineEndings with eol=binary returns as-is', async () => {
    const buffer = UniversalBuffer.from('Binary content\x00\x01\x02', 'utf8')
    const result = convertLineEndings(buffer, 'binary')
    
    // Should return unchanged
    assert.strictEqual(result.toString('utf8'), buffer.toString('utf8'))
  })

  await t.test('convertLineEndings with eol=empty string returns as-is', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, '')
    
    // Should return unchanged
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with eol=undefined returns as-is', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, undefined as any)
    
    // Should return unchanged
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with unknown eol value returns as-is', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'unknown' as any)
    
    // Should return unchanged for unknown values
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings normalizes CRLF to LF first', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    // Should normalize CRLF to LF
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings normalizes CR to LF first', async () => {
    const buffer = UniversalBuffer.from('Line 1\rLine 2\r', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    // Should normalize CR to LF
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings handles mixed line endings', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\nLine 3\r', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    // Should normalize all to LF
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\nLine 3\n')
  })

  await t.test('convertLineEndings converts LF to CRLF when target is CRLF', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'crlf')
    
    // Should convert LF to CRLF
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })

  await t.test('convertLineEndings handles file without trailing newline', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2', 'utf8')
    const result = convertLineEndings(buffer, 'crlf')
    
    // Should convert LF to CRLF, but not add trailing newline
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2')
  })

  await t.test('convertLineEndings handles empty buffer', async () => {
    const buffer = UniversalBuffer.from('', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    assert.strictEqual(result.toString('utf8'), '')
  })

  await t.test('convertLineEndings handles buffer with only newlines', async () => {
    const buffer = UniversalBuffer.from('\n\n\n', 'utf8')
    const result = convertLineEndings(buffer, 'crlf')
    
    assert.strictEqual(result.toString('utf8'), '\r\n\r\n\r\n')
  })

  await t.test('normalizeToLF converts to LF', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r', 'utf8')
    const result = normalizeToLF(buffer)
    
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('normalizeToLF handles Uint8Array', async () => {
    const uint8Array = new Uint8Array([76, 105, 110, 101, 32, 49, 13, 10, 76, 105, 110, 101, 32, 50])
    const result = normalizeToLF(uint8Array)
    
    assert.ok(UniversalBuffer.isBuffer(result))
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2')
  })

  await t.test('convertForWorkdir with eol=lf', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertForWorkdir({ buffer, eol: 'lf' })
    
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertForWorkdir with eol=crlf', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertForWorkdir({ buffer, eol: 'crlf' })
    
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })

  await t.test('convertForWorkdir with eol=auto defaults to unix', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertForWorkdir({ buffer, eol: 'auto' })
    
    // Default platform is 'unix', so should use LF
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertForWorkdir with eol=auto and platform=windows', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertForWorkdir({ buffer, eol: 'auto', platform: 'windows' })
    
    // Windows platform should use CRLF
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })

  await t.test('convertForWorkdir with eol=undefined defaults to auto', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertForWorkdir({ buffer })
    
    // Should default to 'auto' which defaults to 'unix' platform (LF)
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertForWorkdir with eol=undefined and platform=windows', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertForWorkdir({ buffer, platform: 'windows' })
    
    // Should default to 'auto' which uses windows platform (CRLF)
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })

  await t.test('convertForStorage always normalizes to LF', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r', 'utf8')
    const result = convertForStorage({ buffer })
    
    // Should always normalize to LF regardless of eol parameter
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertForStorage ignores eol parameter', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertForStorage({ buffer, eol: 'crlf' })
    
    // Should always normalize to LF, ignoring eol parameter
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertForStorage handles Uint8Array', async () => {
    const uint8Array = new Uint8Array([76, 105, 110, 101, 32, 49, 13, 10, 76, 105, 110, 101, 32, 50])
    const result = convertForStorage({ buffer: uint8Array })
    
    assert.ok(UniversalBuffer.isBuffer(result))
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2')
  })

  await t.test('convertLineEndings handles unicode content', async () => {
    const buffer = UniversalBuffer.from('Hello 世界\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'crlf')
    
    assert.strictEqual(result.toString('utf8'), 'Hello 世界\r\nLine 2\r\n')
  })

  await t.test('convertLineEndings handles content with no line endings', async () => {
    const buffer = UniversalBuffer.from('Single line content', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    // Should return unchanged if no line endings
    assert.strictEqual(result.toString('utf8'), 'Single line content')
  })

  await t.test('convertLineEndings handles content with only CRLF', async () => {
    const buffer = UniversalBuffer.from('\r\n\r\n', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    assert.strictEqual(result.toString('utf8'), '\n\n')
  })

  await t.test('convertLineEndings handles content with only CR', async () => {
    const buffer = UniversalBuffer.from('\r\r', 'utf8')
    const result = convertLineEndings(buffer, 'lf')
    
    assert.strictEqual(result.toString('utf8'), '\n\n')
  })

  await t.test('convertLineEndings handles content with only LF', async () => {
    const buffer = UniversalBuffer.from('\n\n', 'utf8')
    const result = convertLineEndings(buffer, 'crlf')
    
    assert.strictEqual(result.toString('utf8'), '\r\n\r\n')
  })

  await t.test('convertLineEndings with eol=auto on unix handles CRLF input', async () => {
    const buffer = UniversalBuffer.from('Line 1\r\nLine 2\r\n', 'utf8')
    const result = convertLineEndings(buffer, 'auto', 'unix')
    
    // Should normalize to LF on unix
    assert.strictEqual(result.toString('utf8'), 'Line 1\nLine 2\n')
  })

  await t.test('convertLineEndings with eol=auto on windows handles LF input', async () => {
    const buffer = UniversalBuffer.from('Line 1\nLine 2\n', 'utf8')
    const result = convertLineEndings(buffer, 'auto', 'windows')
    
    // Should convert to CRLF on windows
    assert.strictEqual(result.toString('utf8'), 'Line 1\r\nLine 2\r\n')
  })
})
