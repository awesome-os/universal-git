import { test } from 'node:test'
import assert from 'node:assert'
import { compareRefNames } from '@awesome-os/universal-git-src/utils/compareRefNames.ts'

test('compareRefNames', async (t) => {
  await t.test('ok:compare-refs-a-lt-b', () => {
    const result = compareRefNames('refs/heads/a', 'refs/heads/b')
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compare-refs-a-gt-b', () => {
    const result = compareRefNames('refs/heads/b', 'refs/heads/a')
    assert.strictEqual(result, 1)
  })

  await t.test('ok:compare-refs-a-eq-b', () => {
    const result = compareRefNames('refs/heads/main', 'refs/heads/main')
    // When equal after removing ^{}, returns -1 if neither has ^{}
    assert.strictEqual(result, -1)
  })

  await t.test('behavior:removes-peeled-suffix', () => {
    const result = compareRefNames('refs/tags/v1.0.0^{}', 'refs/tags/v1.0.0')
    // After removing ^{}, they're equal, but ^{} version should come after
    assert.strictEqual(result, 1)
  })

  await t.test('ok:compare-refs-both-peeled', () => {
    const result = compareRefNames('refs/tags/v1.0.0^{}', 'refs/tags/v1.0.0^{}')
    // When equal after removing ^{}, both have ^{} so returns 1
    assert.strictEqual(result, 1)
  })

  await t.test('ok:compare-refs-first-peeled', () => {
    const result = compareRefNames('refs/tags/v1.0.0^{}', 'refs/tags/v1.0.0')
    // After removing ^{}, they're equal, so ^{} version comes after
    assert.strictEqual(result, 1)
  })

  await t.test('ok:compare-refs-second-peeled', () => {
    const result = compareRefNames('refs/tags/v1.0.0', 'refs/tags/v1.0.0^{}')
    // After removing ^{}, they're equal, so non-^{} version comes first
    assert.strictEqual(result, -1)
  })

  await t.test('ok:compare-refs-different-peeled', () => {
    const result = compareRefNames('refs/tags/v1.0.0^{}', 'refs/tags/v2.0.0^{}')
    // Should compare without ^{} suffix
    assert.strictEqual(result, -1) // v1.0.0 < v2.0.0
  })

  await t.test('edge:compare-refs-empty-strings', () => {
    const result = compareRefNames('', '')
    // Empty strings are equal, neither has ^{}, so returns -1
    assert.strictEqual(result, -1)
  })

  await t.test('edge:compare-refs-one-empty', () => {
    const result = compareRefNames('', 'refs/heads/main')
    assert.strictEqual(result, -1) // empty < 'refs/heads/main'
  })
})

