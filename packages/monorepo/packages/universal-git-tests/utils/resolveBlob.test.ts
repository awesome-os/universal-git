import { test } from 'node:test'
import assert from 'node:assert'
import { resolveBlob } from '@awesome-os/universal-git-src/utils/resolveBlob.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { writeBlob, writeTag } from '@awesome-os/universal-git-src/index.ts'
import { ObjectTypeError } from '@awesome-os/universal-git-src/errors/ObjectTypeError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'

test('resolveBlob', async (t) => {
  await t.test('ok:resolves-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('test content'),
      cache,
    })
    
    const result = await resolveBlob({
      fs,
      cache,
      gitdir,
      oid: blobOid,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(result.blob instanceof Uint8Array)
    assert.strictEqual(Buffer.from(result.blob).toString(), 'test content')
  })

  await t.test('ok:peels-tag-to-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('tagged blob content'),
      cache,
    })
    
    const tagOid = await writeTag({
      fs,
      dir,
      gitdir,
      tag: {
        object: blobOid,
        type: 'blob',
        tag: 'v1.0.0',
        tagger: { name: 'Test', email: 'test@example.com', timestamp: 1234567890, timezoneOffset: 0 },
        message: 'Tag message',
      },
      cache,
    })
    
    const result = await resolveBlob({
      fs,
      cache,
      gitdir,
      oid: tagOid,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(result.blob instanceof Uint8Array)
    assert.strictEqual(Buffer.from(result.blob).toString(), 'tagged blob content')
  })

  await t.test('error:ObjectTypeError-non-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    // Write an empty tree object
    const { writeTree } = await import('@awesome-os/universal-git-src/commands/writeTree.ts')
    const treeOid = await writeTree({
      fs,
      gitdir,
      tree: [],
    })
    
    await assert.rejects(
      async () => {
        await resolveBlob({
          fs,
          cache,
          gitdir,
          oid: treeOid,
        })
      },
      (error: any) => {
        return error instanceof ObjectTypeError && error.data?.expected === 'blob'
      }
    )
  })

  await t.test('error:NotFoundError-non-existent', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const nonExistentOid = 'a'.repeat(40)
    
    await assert.rejects(
      async () => {
        await resolveBlob({
          fs,
          cache,
          gitdir,
          oid: nonExistentOid,
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })

  await t.test('edge:empty-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from(''),
      cache,
    })
    
    const result = await resolveBlob({
      fs,
      cache,
      gitdir,
      oid: blobOid,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(result.blob instanceof Uint8Array)
    assert.strictEqual(result.blob.length, 0)
  })

  await t.test('ok:handles-binary-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD])
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: binaryContent,
      cache,
    })
    
    const result = await resolveBlob({
      fs,
      cache,
      gitdir,
      oid: blobOid,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(result.blob instanceof Uint8Array)
    assert.deepStrictEqual(Buffer.from(result.blob), binaryContent)
  })

  await t.test('ok:handles-large-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const largeContent = Buffer.alloc(10000, 'x')
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: largeContent,
      cache,
    })
    
    const result = await resolveBlob({
      fs,
      cache,
      gitdir,
      oid: blobOid,
    })
    
    assert.strictEqual(result.oid, blobOid)
    assert.ok(result.blob instanceof Uint8Array)
    assert.strictEqual(result.blob.length, 10000)
  })
})

