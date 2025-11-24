import { test } from 'node:test'
import assert from 'node:assert'
import { extractAuthFromUrl } from '@awesome-os/universal-git-src/utils/extractAuthFromUrl.ts'

test('extractAuthFromUrl', async (t) => {
  await t.test('ok:extracts-credentials-HTTP', () => {
    const result = extractAuthFromUrl('https://user:pass@example.com/repo.git')
    assert.strictEqual(result.url, 'https://example.com/repo.git')
    assert.strictEqual(result.auth.username, 'user')
    assert.strictEqual(result.auth.password, 'pass')
  })

  await t.test('ok:extracts-credentials-HTTPS', () => {
    const result = extractAuthFromUrl('http://user:pass@example.com/repo.git')
    assert.strictEqual(result.url, 'http://example.com/repo.git')
    assert.strictEqual(result.auth.username, 'user')
    assert.strictEqual(result.auth.password, 'pass')
  })

  await t.test('ok:returns-empty-auth-no-credentials', () => {
    const result = extractAuthFromUrl('https://example.com/repo.git')
    assert.strictEqual(result.url, 'https://example.com/repo.git')
    assert.deepStrictEqual(result.auth, {})
  })

  await t.test('ok:handles-username-no-password', () => {
    const result = extractAuthFromUrl('https://user@example.com/repo.git')
    assert.strictEqual(result.url, 'https://example.com/repo.git')
    assert.strictEqual(result.auth.username, 'user')
    assert.strictEqual(result.auth.password, undefined)
  })

  await t.test('ok:handles-password-colon', () => {
    const result = extractAuthFromUrl('https://user:pass:word@example.com/repo.git')
    assert.strictEqual(result.url, 'https://example.com/repo.git')
    assert.strictEqual(result.auth.username, 'user')
    // Note: split(':') only splits on first colon, so password is 'pass'
    assert.strictEqual(result.auth.password, 'pass')
  })

  await t.test('ok:handles-special-characters', () => {
    const result = extractAuthFromUrl('https://user%40domain:p%40ss@example.com/repo.git')
    assert.strictEqual(result.url, 'https://example.com/repo.git')
    assert.strictEqual(result.auth.username, 'user%40domain')
    assert.strictEqual(result.auth.password, 'p%40ss')
  })

  await t.test('ok:handles-URL-path', () => {
    const result = extractAuthFromUrl('https://user:pass@example.com/path/to/repo.git')
    assert.strictEqual(result.url, 'https://example.com/path/to/repo.git')
    assert.strictEqual(result.auth.username, 'user')
    assert.strictEqual(result.auth.password, 'pass')
  })

  await t.test('ok:handles-URL-port', () => {
    const result = extractAuthFromUrl('https://user:pass@example.com:8080/repo.git')
    assert.strictEqual(result.url, 'https://example.com:8080/repo.git')
    assert.strictEqual(result.auth.username, 'user')
    assert.strictEqual(result.auth.password, 'pass')
  })
})

