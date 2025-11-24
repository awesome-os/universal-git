import assert from 'node:assert'

/**
 * Custom assertion helpers for Node.js test runner
 * These provide similar functionality to Jest's expect() matchers
 */

export function assertInstanceOf<T>(
  actual: unknown,
  expectedClass: new (...args: any[]) => T,
  message?: string
): asserts actual is T {
  assert.ok(
    actual instanceof expectedClass,
    message || `Expected instance of ${expectedClass.name}, got ${typeof actual}`
  )
}

export function assertNotNull<T>(
  actual: T | null | undefined,
  message?: string
): asserts actual is T {
  assert.ok(actual != null, message || 'Expected value to not be null or undefined')
}

export function assertArrayEqual<T>(
  actual: T[],
  expected: T[],
  message?: string
): void {
  assert.strictEqual(actual.length, expected.length, message || 'Array lengths differ')
  for (let i = 0; i < actual.length; i++) {
    assert.deepStrictEqual(actual[i], expected[i], message || `Array elements differ at index ${i}`)
  }
}

