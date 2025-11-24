import { test } from 'node:test'
import assert from 'node:assert'
import { abbreviateRef } from '@awesome-os/universal-git-src/utils/abbreviateRef.ts'

test('abbreviateRef', async (t) => {
  await t.test('ok:abbreviates-refs-heads-branch', () => {
    assert.strictEqual(abbreviateRef('refs/heads/master'), 'master')
    assert.strictEqual(abbreviateRef('refs/heads/feature'), 'feature')
  })

  await t.test('ok:abbreviates-refs-tags-tag', () => {
    assert.strictEqual(abbreviateRef('refs/tags/v1.0.0'), 'v1.0.0')
  })

  await t.test('ok:abbreviates-refs-remotes-branch', () => {
    assert.strictEqual(abbreviateRef('refs/remotes/origin/master'), 'origin/master')
  })

  await t.test('ok:abbreviates-refs-remotes-HEAD', () => {
    assert.strictEqual(abbreviateRef('refs/remotes/origin/HEAD'), 'origin')
  })

  await t.test('ok:returns-original-non-refs-paths', () => {
    assert.strictEqual(abbreviateRef('HEAD'), 'HEAD')
    assert.strictEqual(abbreviateRef('master'), 'master')
  })
})

