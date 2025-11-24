import { test } from 'node:test'
import assert from 'node:assert'
import { calculateBasicAuthHeader } from '@awesome-os/universal-git-src/utils/calculateBasicAuthHeader.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('calculateBasicAuthHeader', async (t) => {
  await t.test('ok:creates-header-username-password', () => {
    const header = calculateBasicAuthHeader({ username: 'user', password: 'pass' })
    assert.strictEqual(header, 'Basic dXNlcjpwYXNz')
    // Verify it's valid base64
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, 'user:pass')
  })

  await t.test('edge:creates-header-empty-strings', () => {
    const header = calculateBasicAuthHeader({ username: '', password: '' })
    assert.strictEqual(header, 'Basic Og==')
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, ':')
  })

  await t.test('ok:creates-header-default-empty', () => {
    const header = calculateBasicAuthHeader({})
    assert.strictEqual(header, 'Basic Og==')
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, ':')
  })

  await t.test('ok:creates-header-special-characters', () => {
    const header = calculateBasicAuthHeader({ username: 'user@domain', password: 'p@ss:w0rd' })
    assert.ok(header.startsWith('Basic '))
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, 'user@domain:p@ss:w0rd')
  })

  await t.test('ok:creates-header-unicode-characters', () => {
    const header = calculateBasicAuthHeader({ username: 'üser', password: 'päss' })
    assert.ok(header.startsWith('Basic '))
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, 'üser:päss')
  })

  await t.test('ok:creates-header-only-username', () => {
    const header = calculateBasicAuthHeader({ username: 'user' })
    assert.ok(header.startsWith('Basic '))
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, 'user:')
  })

  await t.test('ok:creates-header-only-password', () => {
    const header = calculateBasicAuthHeader({ password: 'pass' })
    assert.ok(header.startsWith('Basic '))
    const decoded = UniversalBuffer.from(header.replace('Basic ', ''), 'base64').toString('utf8')
    assert.strictEqual(decoded, ':pass')
  })
})

