import { test } from 'node:test'
import assert from 'node:assert'
import {
  parsePointer,
  isPointer,
  generatePointer,
  getLFSObjectPath,
  extractHash,
} from '@awesome-os/universal-git-src/git/lfs/pointer.ts'

test('LFS Pointer', async (t) => {
  await t.test('parsePointer - valid pointer file', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1024
`
    const pointer = parsePointer(content)

    assert.strictEqual(pointer.version, 'https://git-lfs.github.com/spec/v1')
    assert.strictEqual(pointer.oid, 'sha256:abc123def456789012345678901234567890123456789012345678901234567890')
    assert.strictEqual(pointer.size, 1024)
  })

  await t.test('parsePointer - pointer with extensions', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1024

ext1: value1
ext2: value2
`
    const pointer = parsePointer(content)

    assert.strictEqual(pointer.version, 'https://git-lfs.github.com/spec/v1')
    assert.strictEqual(pointer.oid, 'sha256:abc123def456789012345678901234567890123456789012345678901234567890')
    assert.strictEqual(pointer.size, 1024)
    assert.ok(pointer.extensions)
    assert.strictEqual(pointer.extensions?.ext1, 'value1')
    assert.strictEqual(pointer.extensions?.ext2, 'value2')
  })

  await t.test('parsePointer - Buffer input', async () => {
    const content = Buffer.from(`version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 2048
`, 'utf8')
    const pointer = parsePointer(content)

    assert.strictEqual(pointer.version, 'https://git-lfs.github.com/spec/v1')
    assert.strictEqual(pointer.oid, 'sha256:abc123def456789012345678901234567890123456789012345678901234567890')
    assert.strictEqual(pointer.size, 2048)
  })

  await t.test('parsePointer - ignores comments', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
# This is a comment
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1024
`
    const pointer = parsePointer(content)

    assert.strictEqual(pointer.version, 'https://git-lfs.github.com/spec/v1')
    assert.strictEqual(pointer.oid, 'sha256:abc123def456789012345678901234567890123456789012345678901234567890')
    assert.strictEqual(pointer.size, 1024)
  })

  await t.test('parsePointer - throws error on missing version', async () => {
    const content = `oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1024
`
    assert.throws(() => parsePointer(content), /Missing version/)
  })

  await t.test('parsePointer - throws error on missing oid', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
size 1024
`
    assert.throws(() => parsePointer(content), /Missing oid/)
  })

  await t.test('parsePointer - throws error on missing size', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
`
    assert.throws(() => parsePointer(content), /Missing size/)
  })

  await t.test('parsePointer - throws error on invalid version', async () => {
    const content = `version https://git-lfs.github.com/spec/v2
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1024
`
    assert.throws(() => parsePointer(content), /Unsupported LFS version/)
  })

  await t.test('parsePointer - throws error on invalid oid format', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
oid abc123def456789012345678901234567890123456789012345678901234567890
size 1024
`
    assert.throws(() => parsePointer(content), /Invalid oid format/)
  })

  await t.test('parsePointer - throws error on invalid size', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size invalid
`
    assert.throws(() => parsePointer(content), /Invalid size/)
  })

  await t.test('isPointer - returns true for valid pointer', async () => {
    const content = `version https://git-lfs.github.com/spec/v1
oid sha256:abc123def456789012345678901234567890123456789012345678901234567890
size 1024
`
    assert.strictEqual(isPointer(content), true)
  })

  await t.test('isPointer - returns false for invalid pointer', async () => {
    const content = 'This is not a pointer file'
    assert.strictEqual(isPointer(content), false)
  })

  await t.test('isPointer - returns false for empty string', async () => {
    assert.strictEqual(isPointer(''), false)
  })

  await t.test('generatePointer - creates valid pointer file', async () => {
    const content = Buffer.from('Large file content that should be tracked with LFS\n', 'utf8')
    const pointerText = await generatePointer(content)

    assert.ok(pointerText.includes('version https://git-lfs.github.com/spec/v1'))
    assert.ok(pointerText.includes('oid sha256:'))
    assert.ok(pointerText.includes('size '))
    
    // Verify it can be parsed
    const pointer = parsePointer(pointerText)
    assert.strictEqual(pointer.size, content.length)
  })

  await t.test('generatePointer - uses sha256 by default', async () => {
    const content = Buffer.from('test content', 'utf8')
    const pointerText = await generatePointer(content)
    const pointer = parsePointer(pointerText)

    assert.ok(pointer.oid.startsWith('sha256:'))
  })

  await t.test('generatePointer - can use sha1', async () => {
    const content = Buffer.from('test content', 'utf8')
    const pointerText = await generatePointer(content, 'sha1')
    const pointer = parsePointer(pointerText)

    assert.ok(pointer.oid.startsWith('sha1:'))
  })

  await t.test('getLFSObjectPath - creates correct path structure', async () => {
    const oid = 'sha256:abcdef123456789012345678901234567890123456789012345678901234567890'
    const path = getLFSObjectPath(oid)

    // Should be: ab/cd/ef123456789012345678901234567890123456789012345678901234567890
    assert.ok(path.startsWith('ab/cd/'))
    assert.ok(path.includes('ef123456789012345678901234567890123456789012345678901234567890'))
  })

  await t.test('getLFSObjectPath - throws error on short hash', async () => {
    const oid = 'sha256:abc'
    assert.throws(() => getLFSObjectPath(oid), /Invalid OID hash length/)
  })

  await t.test('extractHash - extracts hash from oid', async () => {
    const oid = 'sha256:abcdef1234567890'
    const hash = extractHash(oid)

    assert.strictEqual(hash, 'abcdef1234567890')
  })

  await t.test('extractHash - returns oid if no colon', async () => {
    const oid = 'abcdef1234567890'
    const hash = extractHash(oid)

    assert.strictEqual(hash, 'abcdef1234567890')
  })
})

