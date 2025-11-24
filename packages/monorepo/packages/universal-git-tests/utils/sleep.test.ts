import { test } from 'node:test'
import assert from 'node:assert'
import { sleep } from '@awesome-os/universal-git-src/utils/sleep.ts'

test('sleep', async (t) => {
  await t.test('ok:resolves-after-milliseconds', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    // Allow some tolerance for timing (should be at least 45ms, but not more than 100ms)
    assert.ok(elapsed >= 45, `Expected at least 45ms, got ${elapsed}ms`)
    assert.ok(elapsed < 100, `Expected less than 100ms, got ${elapsed}ms`)
  })

  await t.test('edge:zero-delay', async () => {
    const start = Date.now()
    await sleep(0)
    const elapsed = Date.now() - start
    // Should be very fast, but allow some tolerance for event loop
    assert.ok(elapsed < 20, `Expected very fast, got ${elapsed}ms`)
  })

  await t.test('ok:small-delays', async () => {
    const start = Date.now()
    await sleep(10)
    const elapsed = Date.now() - start
    assert.ok(elapsed >= 8, `Expected at least 8ms, got ${elapsed}ms`)
    assert.ok(elapsed < 30, `Expected less than 30ms, got ${elapsed}ms`)
  })

  await t.test('ok:can-be-chained', async () => {
    const start = Date.now()
    await sleep(20)
    await sleep(20)
    const elapsed = Date.now() - start
    assert.ok(elapsed >= 35, `Expected at least 35ms, got ${elapsed}ms`)
    assert.ok(elapsed < 80, `Expected less than 80ms, got ${elapsed}ms`)
  })
})

