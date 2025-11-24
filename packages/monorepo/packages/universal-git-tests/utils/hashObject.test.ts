import { test } from 'node:test'
import assert from 'node:assert'
import { hashObject } from '@awesome-os/universal-git-src/utils/hashObject.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('hashObject', async (t) => {
  await t.test('ok:hashes-blob', async () => {
    const result = await hashObject({
      type: 'blob',
      object: UniversalBuffer.from('test content'),
    })
    
    assert.ok(typeof result === 'string')
    assert.strictEqual(result.length, 40) // SHA-1 hash length
  })

  await t.test('ok:hashes-tree', async () => {
    const treeContent = UniversalBuffer.from('100644 file.txt\0' + UniversalBuffer.from('abc123').toString('hex'), 'hex')
    const result = await hashObject({
      type: 'tree',
      object: treeContent,
    })
    
    assert.ok(typeof result === 'string')
    assert.strictEqual(result.length, 40)
  })

  await t.test('ok:hashes-commit', async () => {
    const commitContent = UniversalBuffer.from('tree abc123\nparent def456\nauthor Test <test@example.com> 1234567890 -0500\ncommitter Test <test@example.com> 1234567890 -0500\n\nTest commit\n')
    const result = await hashObject({
      type: 'commit',
      object: commitContent,
    })
    
    assert.ok(typeof result === 'string')
    assert.strictEqual(result.length, 40)
  })

  await t.test('ok:hashes-tag', async () => {
    const tagContent = UniversalBuffer.from('object abc123\ntype commit\ntag v1.0.0\ntagger Test <test@example.com> 1234567890 -0500\n\nTest tag\n')
    const result = await hashObject({
      type: 'tag',
      object: tagContent,
    })
    
    assert.ok(typeof result === 'string')
    assert.strictEqual(result.length, 40)
  })

  await t.test('ok:with-Uint8Array', async () => {
    const result = await hashObject({
      type: 'blob',
      object: new Uint8Array([116, 101, 115, 116]), // 'test'
    })
    
    assert.ok(typeof result === 'string')
    assert.strictEqual(result.length, 40)
  })

  await t.test('ok:produces-consistent-hashes', async () => {
    const content = UniversalBuffer.from('same content')
    const hash1 = await hashObject({ type: 'blob', object: content })
    const hash2 = await hashObject({ type: 'blob', object: content })
    
    assert.strictEqual(hash1, hash2)
  })

  await t.test('ok:different-hashes-different-content', async () => {
    const hash1 = await hashObject({ type: 'blob', object: UniversalBuffer.from('content1') })
    const hash2 = await hashObject({ type: 'blob', object: UniversalBuffer.from('content2') })
    
    assert.notStrictEqual(hash1, hash2)
  })

  await t.test('ok:different-hashes-different-types', async () => {
    const content = UniversalBuffer.from('same content')
    const hash1 = await hashObject({ type: 'blob', object: content })
    const hash2 = await hashObject({ type: 'tree', object: content })
    
    assert.notStrictEqual(hash1, hash2)
  })

  await t.test('edge:empty-object', async () => {
    const result = await hashObject({
      type: 'blob',
      object: UniversalBuffer.alloc(0),
    })
    
    assert.ok(typeof result === 'string')
    assert.strictEqual(result.length, 40)
  })

  await t.test('param:gitdir-ignored', async () => {
    const content = UniversalBuffer.from('test')
    const hash1 = await hashObject({ type: 'blob', object: content })
    const hash2 = await hashObject({ type: 'blob', object: content, gitdir: '/some/path' })
    
    // gitdir doesn't affect hash calculation
    assert.strictEqual(hash1, hash2)
  })
})

