import { test } from 'node:test'
import assert from 'node:assert'
import { compareAge } from '@awesome-os/universal-git-src/utils/compareAge.ts'
import type { CommitObject } from '@awesome-os/universal-git-src/models/GitCommit.ts'

test('compareAge', async (t) => {
  await t.test('ok:compare-first-older', () => {
    const a: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 1000, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 1000, timezoneOffset: 0 },
      message: 'First commit',
    }
    const b: CommitObject = {
      tree: 'b'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 2000, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 2000, timezoneOffset: 0 },
      message: 'Second commit',
    }

    const result = compareAge(a, b)
    assert.strictEqual(result, -1000) // a is older (negative)
  })

  await t.test('ok:compare-second-older', () => {
    const a: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 2000, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 2000, timezoneOffset: 0 },
      message: 'First commit',
    }
    const b: CommitObject = {
      tree: 'b'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 1000, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 1000, timezoneOffset: 0 },
      message: 'Second commit',
    }

    const result = compareAge(a, b)
    assert.strictEqual(result, 1000) // a is newer (positive)
  })

  await t.test('ok:compare-same-age', () => {
    const a: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 1500, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 1500, timezoneOffset: 0 },
      message: 'First commit',
    }
    const b: CommitObject = {
      tree: 'b'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 1500, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 1500, timezoneOffset: 0 },
      message: 'Second commit',
    }

    const result = compareAge(a, b)
    assert.strictEqual(result, 0) // same age
  })

  await t.test('behavior:uses-committer-timestamp', () => {
    const a: CommitObject = {
      tree: 'a'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 1000, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 5000, timezoneOffset: 0 },
      message: 'First commit',
    }
    const b: CommitObject = {
      tree: 'b'.repeat(40),
      parent: [],
      author: { name: 'Test', email: 'test@example.com', timestamp: 2000, timezoneOffset: 0 },
      committer: { name: 'Test', email: 'test@example.com', timestamp: 3000, timezoneOffset: 0 },
      message: 'Second commit',
    }

    const result = compareAge(a, b)
    // Should use committer timestamp (5000 - 3000 = 2000)
    assert.strictEqual(result, 2000)
  })
})

