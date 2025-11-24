import { test } from 'node:test'
import assert from 'node:assert'
import { formatAuthor } from '@awesome-os/universal-git-src/utils/formatAuthor.ts'
import type { Author } from '@awesome-os/universal-git-src/models/GitCommit.ts'

test('formatAuthor', async (t) => {
  await t.test('ok:formats-positive-timezone', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: 120, // +02:00 (will be negated to -120, then formatted as -0200)
    }
    const formatted = formatAuthor(author)
    // formatAuthor negates the offset (except for zero), so +120 becomes -0200
    assert.strictEqual(formatted, 'Test User <test@example.com> 1234567890 -0200')
  })

  await t.test('ok:formats-negative-timezone', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: -300, // -05:00 (will be negated to +300, then formatted as +0500)
    }
    const formatted = formatAuthor(author)
    // formatAuthor negates the offset (except for zero), so -300 becomes +0500
    assert.strictEqual(formatted, 'Test User <test@example.com> 1234567890 +0500')
  })

  await t.test('ok:formats-zero-timezone', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: 0,
    }
    const formatted = formatAuthor(author)
    assert.strictEqual(formatted, 'Test User <test@example.com> 1234567890 +0000')
  })

  await t.test('ok:formats-negative-zero-timezone', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: -0,
    }
    const formatted = formatAuthor(author)
    // Should handle -0 correctly
    assert.ok(formatted.includes('Test User <test@example.com> 1234567890'))
    assert.ok(formatted.includes('-0000') || formatted.includes('+0000'))
  })

  await t.test('ok:formats-single-digit-hours-minutes', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: 90, // +01:30 (will be negated to -90, then formatted as -0130)
    }
    const formatted = formatAuthor(author)
    // formatAuthor negates the offset (except for zero), so +90 becomes -0130
    assert.strictEqual(formatted, 'Test User <test@example.com> 1234567890 -0130')
  })

  await t.test('ok:formats-large-timezone', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: 840, // +14:00 (will be negated to -840, then formatted as -1400)
    }
    const formatted = formatAuthor(author)
    // formatAuthor negates the offset (except for zero), so +840 becomes -1400
    assert.strictEqual(formatted, 'Test User <test@example.com> 1234567890 -1400')
  })

  await t.test('ok:formats-name-special-characters', () => {
    const author: Author = {
      name: 'Test <User>',
      email: 'test@example.com',
      timestamp: 1234567890,
      timezoneOffset: 0,
    }
    const formatted = formatAuthor(author)
    assert.strictEqual(formatted, 'Test <User> <test@example.com> 1234567890 +0000')
  })

  await t.test('ok:formats-email-special-characters', () => {
    const author: Author = {
      name: 'Test User',
      email: 'test+tag@example.com',
      timestamp: 1234567890,
      timezoneOffset: 0,
    }
    const formatted = formatAuthor(author)
    assert.strictEqual(formatted, 'Test User <test+tag@example.com> 1234567890 +0000')
  })
})

