import { test } from 'node:test'
import assert from 'node:assert'
import { detectChange, detectThreeWayChange, modified } from '@awesome-os/universal-git-src/utils/changeDetection.ts'
import type { WalkerEntry } from '@awesome-os/universal-git-src/models/Walker.ts'
import { createWalkerEntry } from '@awesome-os/universal-git-src/models/Walker.ts'

// Helper to create a mock WalkerEntry for testing
function MockWalkerEntry(oid: string, type: 'blob' | 'tree' | 'commit' | 'special' = 'blob', mode: number = 0o100644): WalkerEntry {
  return createWalkerEntry({
    oid: async () => oid,
    type: async () => type,
    mode: async () => mode,
    content: async () => {
      throw new Error('Not implemented')
    },
    stat: async () => {
      throw new Error('Not implemented')
    },
  })
}

// Helper to create a WalkerEntry that throws on oid() call
function FailingWalkerEntry(): WalkerEntry {
  return createWalkerEntry({
    oid: async () => {
      throw new Error('Missing blob')
    },
    type: async () => 'blob',
    mode: async () => 0o100644,
    content: async () => {
      throw new Error('Not implemented')
    },
    stat: async () => {
      throw new Error('Not implemented')
    },
  })
}

test('changeDetection', async (t) => {
  await t.test('ok:detectChange-added-file', async () => {
    const base = null
    const target = MockWalkerEntry('abc123')
    const result = await detectChange(base, target)
    assert.strictEqual(result.type, 'added')
    assert.strictEqual(result.base, null)
    assert.strictEqual(result.target, target)
    assert.strictEqual(result.baseOid, undefined)
    assert.strictEqual(result.targetOid, 'abc123')
  })

  await t.test('ok:detectChange-deleted-file', async () => {
    const base = MockWalkerEntry('abc123')
    const target = null
    const result = await detectChange(base, target)
    assert.strictEqual(result.type, 'deleted')
    assert.strictEqual(result.base, base)
    assert.strictEqual(result.target, null)
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.targetOid, undefined)
  })

  await t.test('ok:detectChange-modified-file', async () => {
    const base = MockWalkerEntry('abc123')
    const target = MockWalkerEntry('def456')
    const result = await detectChange(base, target)
    assert.strictEqual(result.type, 'modified')
    assert.strictEqual(result.base, base)
    assert.strictEqual(result.target, target)
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.targetOid, 'def456')
  })

  await t.test('ok:detectChange-unchanged-file', async () => {
    const base = MockWalkerEntry('abc123')
    const target = MockWalkerEntry('abc123')
    const result = await detectChange(base, target)
    assert.strictEqual(result.type, 'unchanged')
    assert.strictEqual(result.base, base)
    assert.strictEqual(result.target, target)
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.targetOid, 'abc123')
  })

  await t.test('ok:detectChange-both-null', async () => {
    const base = null
    const target = null
    const result = await detectChange(base, target)
    assert.strictEqual(result.type, 'unchanged')
    assert.strictEqual(result.base, null)
    assert.strictEqual(result.target, null)
    assert.strictEqual(result.baseOid, undefined)
    assert.strictEqual(result.targetOid, undefined)
  })

  await t.test('edge:detectChange-missing-blob-base', async () => {
    const base = FailingWalkerEntry()
    const target = MockWalkerEntry('abc123')
    const result = await detectChange(base, target)
    // When base.oid() fails, baseOid is undefined but base is not null
    // So it's treated as modified (both exist, but OIDs differ)
    assert.strictEqual(result.type, 'modified')
    assert.strictEqual(result.baseOid, undefined)
    assert.strictEqual(result.targetOid, 'abc123')
  })

  await t.test('edge:detectChange-missing-blob-target', async () => {
    const base = MockWalkerEntry('abc123')
    const target = FailingWalkerEntry()
    const result = await detectChange(base, target)
    // Should return unchanged when target.oid() fails
    assert.strictEqual(result.type, 'unchanged')
    assert.strictEqual(result.baseOid, undefined)
    assert.strictEqual(result.targetOid, undefined)
  })

  await t.test('ok:detectThreeWayChange-our-change', async () => {
    const ours = MockWalkerEntry('abc123')
    const base = MockWalkerEntry('def456')
    const theirs = MockWalkerEntry('def456')
    const result = await detectThreeWayChange(ours, base, theirs)
    assert.strictEqual(result.ourChange, true)
    assert.strictEqual(result.theirChange, false)
    assert.strictEqual(result.ourOid, 'abc123')
    assert.strictEqual(result.baseOid, 'def456')
    assert.strictEqual(result.theirOid, 'def456')
  })

  await t.test('ok:detectThreeWayChange-their-change', async () => {
    const ours = MockWalkerEntry('def456')
    const base = MockWalkerEntry('def456')
    const theirs = MockWalkerEntry('abc123')
    const result = await detectThreeWayChange(ours, base, theirs)
    assert.strictEqual(result.ourChange, false)
    assert.strictEqual(result.theirChange, true)
    assert.strictEqual(result.ourOid, 'def456')
    assert.strictEqual(result.baseOid, 'def456')
    assert.strictEqual(result.theirOid, 'abc123')
  })

  await t.test('ok:detectThreeWayChange-both-changes', async () => {
    const ours = MockWalkerEntry('abc123')
    const base = MockWalkerEntry('def456')
    const theirs = MockWalkerEntry('ghi789')
    const result = await detectThreeWayChange(ours, base, theirs)
    assert.strictEqual(result.ourChange, true)
    assert.strictEqual(result.theirChange, true)
    assert.strictEqual(result.ourOid, 'abc123')
    assert.strictEqual(result.baseOid, 'def456')
    assert.strictEqual(result.theirOid, 'ghi789')
  })

  await t.test('ok:detectThreeWayChange-no-changes', async () => {
    const ours = MockWalkerEntry('abc123')
    const base = MockWalkerEntry('abc123')
    const theirs = MockWalkerEntry('abc123')
    const result = await detectThreeWayChange(ours, base, theirs)
    assert.strictEqual(result.ourChange, false)
    assert.strictEqual(result.theirChange, false)
    assert.strictEqual(result.ourOid, 'abc123')
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.theirOid, 'abc123')
  })

  await t.test('ok:detectThreeWayChange-our-deletion', async () => {
    const ours = null
    const base = MockWalkerEntry('abc123')
    const theirs = MockWalkerEntry('abc123')
    const result = await detectThreeWayChange(ours, base, theirs)
    assert.strictEqual(result.ourChange, true) // ours is null, base is not
    assert.strictEqual(result.theirChange, false)
    assert.strictEqual(result.ourOid, undefined)
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.theirOid, 'abc123')
  })

  await t.test('ok:detectThreeWayChange-their-deletion', async () => {
    const ours = MockWalkerEntry('abc123')
    const base = MockWalkerEntry('abc123')
    const theirs = null
    const result = await detectThreeWayChange(ours, base, theirs)
    assert.strictEqual(result.ourChange, false)
    assert.strictEqual(result.theirChange, true) // theirs is null, base is not
    assert.strictEqual(result.ourOid, 'abc123')
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.theirOid, undefined)
  })

  await t.test('edge:detectThreeWayChange-missing-blobs', async () => {
    const ours = FailingWalkerEntry()
    const base = MockWalkerEntry('abc123')
    const theirs = MockWalkerEntry('abc123')
    const result = await detectThreeWayChange(ours, base, theirs)
    // Should handle error gracefully
    assert.strictEqual(result.ourOid, undefined)
    assert.strictEqual(result.baseOid, 'abc123')
    assert.strictEqual(result.theirOid, 'abc123')
  })

  await t.test('ok:modified-both-null', async () => {
    const result = await modified(null, null)
    assert.strictEqual(result, false)
  })

  await t.test('ok:modified-entry-exists-base-null', async () => {
    const entry = MockWalkerEntry('abc123')
    const result = await modified(entry, null)
    assert.strictEqual(result, true)
  })

  await t.test('ok:modified-entry-null-base-exists', async () => {
    const base = MockWalkerEntry('abc123')
    const result = await modified(null, base)
    assert.strictEqual(result, true)
  })

  await t.test('ok:modified-both-trees', async () => {
    const entry = MockWalkerEntry('abc123', 'tree')
    const base = MockWalkerEntry('def456', 'tree')
    const result = await modified(entry, base)
    assert.strictEqual(result, false)
  })

  await t.test('ok:modified-identical', async () => {
    const entry = MockWalkerEntry('abc123', 'blob', 0o100644)
    const base = MockWalkerEntry('abc123', 'blob', 0o100644)
    const result = await modified(entry, base)
    assert.strictEqual(result, false)
  })

  await t.test('modified - returns true when OID differs', async () => {
    const entry = MockWalkerEntry('abc123', 'blob', 0o100644)
    const base = MockWalkerEntry('def456', 'blob', 0o100644)
    const result = await modified(entry, base)
    assert.strictEqual(result, true)
  })

  await t.test('modified - returns true when mode differs', async () => {
    const entry = MockWalkerEntry('abc123', 'blob', 0o100755)
    const base = MockWalkerEntry('abc123', 'blob', 0o100644)
    const result = await modified(entry, base)
    assert.strictEqual(result, true)
  })

  await t.test('modified - returns true when type differs', async () => {
    const entry = MockWalkerEntry('abc123', 'blob', 0o100644)
    const base = MockWalkerEntry('abc123', 'tree', 0o040000)
    const result = await modified(entry, base)
    assert.strictEqual(result, true)
  })

  await t.test('modified - returns true when oid() throws', async () => {
    const entry = FailingWalkerEntry()
    const base = MockWalkerEntry('abc123')
    const result = await modified(entry, base)
    assert.strictEqual(result, true) // Should treat as modified to be safe
  })
})

