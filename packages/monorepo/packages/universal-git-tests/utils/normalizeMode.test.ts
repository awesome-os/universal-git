import { test } from 'node:test'
import assert from 'node:assert'
import { normalizeMode } from '@awesome-os/universal-git-src/utils/normalizeMode.ts'

test('normalizeMode', async (t) => {
  await t.test('ok:normalizes-directory-mode', () => {
    const result = normalizeMode(0o040755)
    assert.strictEqual(result, 0o040000) // Directory with permissions scrubbed
  })

  await t.test('ok:normalizes-file-mode-644', () => {
    const result = normalizeMode(0o100644)
    assert.strictEqual(result, 0o100644) // Already normalized
  })

  await t.test('ok:normalizes-file-mode-755', () => {
    const result = normalizeMode(0o100755)
    assert.strictEqual(result, 0o100755) // Already normalized
  })

  await t.test('ok:executable-file-to-755', () => {
    const result = normalizeMode(0o100777) // Any executable bits set (0b001001001 pattern)
    // 0o100777 has executable bits, so should become 0o100755
    assert.strictEqual(result, 0o100755)
  })

  await t.test('ok:non-executable-file-to-644', () => {
    const result = normalizeMode(0o100600) // No executable bits
    assert.strictEqual(result, 0o100644)
  })

  await t.test('ok:normalizes-symlink-mode', () => {
    const result = normalizeMode(0o120000)
    assert.strictEqual(result, 0o120000) // Permissions scrubbed to 0
  })

  await t.test('ok:normalizes-gitlink-mode', () => {
    const result = normalizeMode(0o160000)
    assert.strictEqual(result, 0o160000) // Permissions scrubbed to 0
  })

  await t.test('edge:invalid-type-assumes-file', () => {
    const result = normalizeMode(0o200644) // Invalid type (0b0010)
    // Should be normalized to regular file (0b1000) with 644 permissions
    // 0o200644 >> 12 = 0b0010 (invalid), becomes 0b1000, permissions 644
    assert.strictEqual(result, 0o100644)
  })

  await t.test('edge:negative-mode', () => {
    const result = normalizeMode(-1)
    // mode > 0 is false, so type = 0, which is invalid, becomes 0b1000 (regular file)
    // permissions = -1 & 0o777 = 0o777, has executable bits, becomes 0o755
    // But type !== 0b1000 check happens after, so permissions = 0
    // Actually, let me check: type = 0 (invalid), becomes 0b1000, permissions = 0o777 & 0b001001001 = true, becomes 0o755
    // But then if (type !== 0b1000) permissions = 0 - but type IS 0b1000 now, so permissions stay 0o755
    // Wait, type starts as 0, then becomes 0b1000, permissions calculated, then if type !== 0b1000, permissions = 0
    // Since type is now 0b1000, permissions stay as calculated (0o755)
    assert.strictEqual(result, 0o100755)
  })

  await t.test('edge:zero-mode', () => {
    const result = normalizeMode(0)
    // type = 0 (invalid), becomes 0b1000, permissions = 0 (no executable bits), becomes 0o644
    assert.strictEqual(result, 0o100644)
  })

  await t.test('ok:scrubs-permissions-non-regular', () => {
    const symlinkResult = normalizeMode(0o120777) // Symlink with permissions
    assert.strictEqual(symlinkResult, 0o120000) // Permissions scrubbed

    const dirResult = normalizeMode(0o040777) // Directory with permissions
    assert.strictEqual(dirResult, 0o040000) // Permissions scrubbed
  })
})

