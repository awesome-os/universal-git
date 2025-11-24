import { test } from 'node:test'
import assert from 'node:assert'
import { formatInfoRefs } from '@awesome-os/universal-git-src/utils/formatInfoRefs.ts'

test('formatInfoRefs', async (t) => {
  await t.test('ok:formats-refs-no-prefix', () => {
    const remote = {
      refs: new Map([
        ['refs/heads/main', 'abc123'],
        ['refs/heads/develop', 'def456'],
      ]),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, '', false, false)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].ref, 'refs/heads/main')
    assert.strictEqual(result[0].oid, 'abc123')
    assert.strictEqual(result[1].ref, 'refs/heads/develop')
    assert.strictEqual(result[1].oid, 'def456')
  })

  await t.test('ok:filters-refs-by-prefix', () => {
    const remote = {
      refs: new Map([
        ['refs/heads/main', 'abc123'],
        ['refs/tags/v1.0.0', 'def456'],
        ['refs/remotes/origin/main', 'ghi789'],
      ]),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, 'refs/heads/', false, false)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].ref, 'refs/heads/main')
    assert.strictEqual(result[0].oid, 'abc123')
  })

  await t.test('param:includes-symrefs-true', () => {
    const remote = {
      refs: new Map([
        ['refs/heads/main', 'abc123'],
      ]),
      symrefs: new Map([
        ['refs/heads/main', 'refs/remotes/origin/main'],
      ]),
    }
    const result = formatInfoRefs(remote, '', true, false)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].ref, 'refs/heads/main')
    assert.strictEqual(result[0].oid, 'abc123')
    assert.strictEqual(result[0].target, 'refs/remotes/origin/main')
  })

  await t.test('param:excludes-symrefs-false', () => {
    const remote = {
      refs: new Map([
        ['refs/heads/main', 'abc123'],
      ]),
      symrefs: new Map([
        ['refs/heads/main', 'refs/remotes/origin/main'],
      ]),
    }
    const result = formatInfoRefs(remote, '', false, false)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].ref, 'refs/heads/main')
    assert.strictEqual(result[0].oid, 'abc123')
    assert.strictEqual(result[0].target, undefined)
  })

  await t.test('param:peels-tags-true', () => {
    const remote = {
      refs: new Map([
        ['refs/tags/v1.0.0', 'abc123'],
        ['refs/tags/v1.0.0^{}', 'def456'], // Peeled tag
      ]),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, '', false, true)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].ref, 'refs/tags/v1.0.0')
    assert.strictEqual(result[0].oid, 'abc123')
    assert.strictEqual(result[0].peeled, 'def456')
  })

  await t.test('param:skips-peeled-tags-false', () => {
    const remote = {
      refs: new Map([
        ['refs/tags/v1.0.0', 'abc123'],
        ['refs/tags/v1.0.0^{}', 'def456'], // Peeled tag
      ]),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, '', false, false)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].ref, 'refs/tags/v1.0.0')
    assert.strictEqual(result[0].oid, 'abc123')
    assert.strictEqual(result[0].peeled, undefined)
  })

  await t.test('ok:handles-peeled-tag-not-immediate', () => {
    const remote = {
      refs: new Map([
        ['refs/tags/v1.0.0', 'abc123'],
        ['refs/tags/v2.0.0', 'xyz789'],
        ['refs/tags/v1.0.0^{}', 'def456'], // Peeled tag appears later
      ]),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, '', false, true)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].ref, 'refs/tags/v1.0.0')
    assert.strictEqual(result[0].oid, 'abc123')
    assert.strictEqual(result[0].peeled, 'def456')
    assert.strictEqual(result[1].ref, 'refs/tags/v2.0.0')
    assert.strictEqual(result[1].oid, 'xyz789')
  })

  await t.test('error:peeled-tag-no-matching-original', () => {
    const remote = {
      refs: new Map([
        ['refs/tags/v1.0.0^{}', 'def456'], // Peeled tag without original
      ]),
      symrefs: new Map(),
    }
    try {
      formatInfoRefs(remote, '', false, true)
      assert.fail('Should have thrown an error')
    } catch (error) {
      assert.ok(error instanceof Error)
      assert.ok((error as Error).message.includes('I did not expect this to happen'))
    }
  })

  await t.test('edge:empty-refs-map', () => {
    const remote = {
      refs: new Map(),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, '', false, false)
    assert.strictEqual(result.length, 0)
  })

  await t.test('ok:handles-multiple-peeled-tags', () => {
    const remote = {
      refs: new Map([
        ['refs/tags/v1.0.0', 'abc123'],
        ['refs/tags/v1.0.0^{}', 'def456'],
        ['refs/tags/v2.0.0', 'ghi789'],
        ['refs/tags/v2.0.0^{}', 'jkl012'],
      ]),
      symrefs: new Map(),
    }
    const result = formatInfoRefs(remote, '', false, true)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0].ref, 'refs/tags/v1.0.0')
    assert.strictEqual(result[0].peeled, 'def456')
    assert.strictEqual(result[1].ref, 'refs/tags/v2.0.0')
    assert.strictEqual(result[1].peeled, 'jkl012')
  })
})

