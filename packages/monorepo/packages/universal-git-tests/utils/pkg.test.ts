import { test } from 'node:test'
import assert from 'node:assert'
import { pkg } from '@awesome-os/universal-git-src/utils/pkg.ts'

test('pkg', async (t) => {
  await t.test('ok:pkg-exports-name', () => {
    assert.strictEqual(pkg.name, 'universal-git')
  })

  await t.test('ok:pkg-exports-version', () => {
    assert.strictEqual(pkg.version, '0.0.0-development')
  })

  await t.test('ok:pkg-exports-agent', () => {
    assert.strictEqual(pkg.agent, 'git/universal-git@0.0.0-development')
  })

  await t.test('ok:pkg-const-object', () => {
    // Verify it's a const object (readonly)
    assert.ok(typeof pkg === 'object')
    assert.ok(pkg !== null)
  })

  await t.test('ok:pkg-properties-accessible', () => {
    assert.ok('name' in pkg)
    assert.ok('version' in pkg)
    assert.ok('agent' in pkg)
  })
})

