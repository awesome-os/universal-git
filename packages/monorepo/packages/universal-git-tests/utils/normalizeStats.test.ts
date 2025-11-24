import { test } from 'node:test'
import assert from 'node:assert'
import { normalizeStats } from '@awesome-os/universal-git-src/utils/normalizeStats.ts'

test('normalizeStats', async (t) => {
  await t.test('ok:normalizes-seconds-nanoseconds', () => {
    const input = {
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 123456789,
      mtimeSeconds: 987654321,
      mtimeNanoseconds: 987654321,
      mode: 0o100644,
      size: 1024,
      dev: 1,
      ino: 2,
      uid: 1000,
      gid: 2000,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.ctimeSeconds, 1234567890)
    assert.strictEqual(result.ctimeNanoseconds, 123456789)
    assert.strictEqual(result.mtimeSeconds, 987654321)
    assert.strictEqual(result.mtimeNanoseconds, 987654321)
    assert.strictEqual(result.mode, 0o100644)
    assert.strictEqual(result.size, 1024)
    assert.strictEqual(result.dev, 1)
    assert.strictEqual(result.ino, 2)
    assert.strictEqual(result.uid, 1000)
    assert.strictEqual(result.gid, 2000)
  })

  await t.test('ok:normalizes-milliseconds', () => {
    const input = {
      ctimeMs: 1234567890123,
      mtimeMs: 9876543210987,
      mode: 0o100644,
      size: 2048,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.ctimeSeconds, 1234567890)
    assert.strictEqual(result.ctimeNanoseconds, 123000000)
    // mtimeMs exceeds MAX_UINT32, so it's modulo'd
    const MAX_UINT32 = 2 ** 32
    const expectedMtimeSeconds = 9876543210 % MAX_UINT32
    const expectedMtimeNanoseconds = 987000000 % MAX_UINT32
    assert.strictEqual(result.mtimeSeconds, expectedMtimeSeconds)
    assert.strictEqual(result.mtimeNanoseconds, expectedMtimeNanoseconds)
  })

  await t.test('ok:normalizes-Date-objects', () => {
    const ctime = new Date('2023-01-01T00:00:00.123Z')
    const mtime = new Date('2023-12-31T23:59:59.456Z')
    const input = {
      ctime,
      mtime,
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.ctimeSeconds, Math.floor(ctime.valueOf() / 1000))
    assert.strictEqual(result.mtimeSeconds, Math.floor(mtime.valueOf() / 1000))
  })

  await t.test('ok:uses-current-time', () => {
    const before = Date.now()
    const input = {
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    const after = Date.now()
    const expectedSeconds = Math.floor(before / 1000)
    const actualSeconds = result.ctimeSeconds
    assert.ok(actualSeconds >= expectedSeconds && actualSeconds <= Math.floor(after / 1000))
  })

  await t.test('ok:handles-negative-size', () => {
    const input = {
      size: -1,
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.size, 0)
  })

  await t.test('ok:handles-missing-optional-fields', () => {
    const input = {
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.dev, 0)
    assert.strictEqual(result.ino, 0)
    assert.strictEqual(result.uid, 0)
    assert.strictEqual(result.gid, 0)
    assert.strictEqual(result.size, 0)
  })

  await t.test('edge:values-exceeding-MAX_UINT32', () => {
    const MAX_UINT32 = 2 ** 32
    const input = {
      ctimeSeconds: MAX_UINT32 + 100,
      mtimeSeconds: MAX_UINT32 + 200,
      ctimeNanoseconds: MAX_UINT32 + 50,
      mtimeNanoseconds: MAX_UINT32 + 60,
      dev: MAX_UINT32 + 1,
      ino: MAX_UINT32 + 2,
      uid: MAX_UINT32 + 3,
      gid: MAX_UINT32 + 4,
      size: MAX_UINT32 + 5,
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    // All values are modulo'd by MAX_UINT32
    assert.strictEqual(result.ctimeSeconds, 100)
    assert.strictEqual(result.mtimeSeconds, 200)
    assert.strictEqual(result.ctimeNanoseconds, 50)
    assert.strictEqual(result.mtimeNanoseconds, 60)
    assert.strictEqual(result.dev, 1)
    assert.strictEqual(result.ino, 2)
    assert.strictEqual(result.uid, 3)
    assert.strictEqual(result.gid, 4)
    assert.strictEqual(result.size, 5)
  })

  await t.test('behavior:prioritizes-seconds-over-milliseconds', () => {
    const input = {
      ctimeSeconds: 1234567890,
      ctimeNanoseconds: 123456789,
      ctimeMs: 9999999999999,
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.ctimeSeconds, 1234567890)
    assert.strictEqual(result.ctimeNanoseconds, 123456789)
  })

  await t.test('behavior:prioritizes-milliseconds-over-Date', () => {
    const date = new Date('2020-01-01T00:00:00Z')
    const input = {
      ctimeMs: 1234567890123,
      ctime: date,
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.ctimeSeconds, 1234567890)
    assert.strictEqual(result.ctimeNanoseconds, 123000000)
  })

  await t.test('ok:normalizes-mode', () => {
    const input = {
      mode: 0o100644,
    }
    const result = normalizeStats(input)
    assert.strictEqual(result.mode, 0o100644)
  })
})

