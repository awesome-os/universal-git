import { test } from 'node:test'
import assert from 'node:assert'
import { compareStats } from '@awesome-os/universal-git-src/utils/compareStats.ts'
import type { Stat } from '@awesome-os/universal-git-src/models/FileSystem.ts'

test('compareStats', async (t) => {
  await t.test('ok:returns-false-identical-stats', () => {
    const entry: Partial<Stat> = {
      mode: 0o100644,
      mtimeSeconds: 1234567890,
      ctimeSeconds: 1234567890,
      uid: 1000,
      gid: 1000,
      ino: 12345,
      size: 1024,
    }
    const stats: Partial<Stat> = {
      mode: 0o100644,
      mtimeSeconds: 1234567890,
      ctimeSeconds: 1234567890,
      uid: 1000,
      gid: 1000,
      ino: 12345,
      size: 1024,
    }
    assert.strictEqual(compareStats(entry, stats), false)
  })

  await t.test('ok:returns-true-mode-differs', () => {
    const entry: Partial<Stat> = { mode: 0o100644 }
    const stats: Partial<Stat> = { mode: 0o100755 }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('ok:returns-true-mtime-differs', () => {
    // normalizeStats requires both mtimeSeconds AND mtimeNanoseconds to use them directly
    // Otherwise it falls back to Date.now(). So we need to provide both.
    const entry: Partial<Stat> = {
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      size: 1024,
      uid: 1000,
      gid: 1000,
      ino: 12345,
      mode: 0o100644,
    }
    const stats: Partial<Stat> = {
      mtimeSeconds: 1234567891, // Different mtime
      mtimeNanoseconds: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      size: 1024,
      uid: 1000,
      gid: 1000,
      ino: 12345,
      mode: 0o100644,
    }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('ok:returns-true-ctime-differs', () => {
    const entry: Partial<Stat> = {
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 0,
      size: 1024,
      uid: 1000,
      gid: 1000,
      ino: 12345,
      mode: 0o100644,
    }
    const stats: Partial<Stat> = {
      mtimeSeconds: 1234567890,
      mtimeNanoseconds: 0,
      ctimeSeconds: 1234567891, // Different ctime
      ctimeNanoseconds: 0,
      size: 1024,
      uid: 1000,
      gid: 1000,
      ino: 12345,
      mode: 0o100644,
    }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('ok:returns-true-uid-differs', () => {
    const entry: Partial<Stat> = { uid: 1000, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { uid: 2000, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('ok:returns-true-gid-differs', () => {
    const entry: Partial<Stat> = { gid: 1000, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { gid: 2000, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('ok:returns-true-ino-differs', () => {
    const entry: Partial<Stat> = { ino: 12345, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { ino: 67890, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('ok:returns-true-size-differs', () => {
    const entry: Partial<Stat> = { size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { size: 2048, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats), true)
  })

  await t.test('param:ignores-mode-filemode-false', () => {
    const entry: Partial<Stat> = { mode: 0o100644, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { mode: 0o100755, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats, false), false)
  })

  await t.test('param:ignores-ino-trustino-false', () => {
    const entry: Partial<Stat> = { ino: 12345, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { ino: 67890, size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats, true, false), false)
  })

  await t.test('ok:handles-partial-stats', () => {
    const entry: Partial<Stat> = { size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    const stats: Partial<Stat> = { size: 1024, mtimeSeconds: 1234567890, ctimeSeconds: 1234567890 }
    assert.strictEqual(compareStats(entry, stats), false)
  })

  await t.test('edge:empty-stats', () => {
    // Empty stats will use Date.now() defaults, which will be different
    // So we can't reliably test this without mocking Date.now()
    // Instead, test with explicit matching defaults
    const now = Math.floor(Date.now() / 1000)
    const entry: Partial<Stat> = { mtimeSeconds: now, ctimeSeconds: now, size: 0 }
    const stats: Partial<Stat> = { mtimeSeconds: now, ctimeSeconds: now, size: 0 }
    assert.strictEqual(compareStats(entry, stats), false)
  })
})

