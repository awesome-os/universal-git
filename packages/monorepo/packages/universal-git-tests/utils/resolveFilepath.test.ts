import { test } from 'node:test'
import assert from 'node:assert'
import { resolveFilepath } from '@awesome-os/universal-git-src/utils/resolveFilepath.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { InvalidFilepathError } from '@awesome-os/universal-git-src/errors/InvalidFilepathError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'
import { ObjectTypeError } from '@awesome-os/universal-git-src/errors/ObjectTypeError.ts'
import { writeBlob, writeCommit, writeTree } from '@awesome-os/universal-git-src/index.ts'

test('resolveFilepath', async (t) => {
  await t.test('ok:resolves-empty-filepath', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    // Create a tree
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: 'a'.repeat(40), type: 'blob' },
      ],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      filepath: '',
    })
    
    assert.strictEqual(result, treeOid)
  })

  await t.test('ok:resolves-root-level-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      filepath: 'file.txt',
    })
    
    assert.strictEqual(result, blobOid)
  })

  await t.test('ok:resolves-nested-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('nested content'),
      cache,
    })
    
    const nestedTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'nested.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'subdir', mode: '040000', oid: nestedTreeOid, type: 'tree' },
      ],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      filepath: 'subdir/nested.txt',
    })
    
    assert.strictEqual(result, blobOid)
  })

  await t.test('ok:resolves-deeply-nested-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('deep content'),
      cache,
    })
    
    const deepTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'deep.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const midTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'mid', mode: '040000', oid: deepTreeOid, type: 'tree' },
      ],
      cache,
    })
    
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'level1', mode: '040000', oid: midTreeOid, type: 'tree' },
      ],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      filepath: 'level1/mid/deep.txt',
    })
    
    assert.strictEqual(result, blobOid)
  })

  await t.test('error:InvalidFilepathError-leading-slash', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    await assert.rejects(
      async () => {
        await resolveFilepath({
          fs,
          cache,
          gitdir,
          oid: 'a'.repeat(40),
          filepath: '/file.txt',
        })
      },
      (error: any) => {
        return error instanceof InvalidFilepathError && error.data?.reason === 'leading-slash'
      }
    )
  })

  await t.test('error:InvalidFilepathError-trailing-slash', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    await assert.rejects(
      async () => {
        await resolveFilepath({
          fs,
          cache,
          gitdir,
          oid: 'a'.repeat(40),
          filepath: 'file.txt/',
        })
      },
      (error: any) => {
        return error instanceof InvalidFilepathError && error.data?.reason === 'trailing-slash'
      }
    )
  })

  await t.test('error:NotFoundError-non-existent-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: 'a'.repeat(40), type: 'blob' },
      ],
      cache,
    })
    
    await assert.rejects(
      async () => {
        await resolveFilepath({
          fs,
          cache,
          gitdir,
          oid: treeOid,
          filepath: 'nonexistent.txt',
        })
      },
      (error: any) => {
        return error instanceof NotFoundError && error.message.includes('nonexistent.txt')
      }
    )
  })

  await t.test('error:NotFoundError-non-existent-nested-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const nestedTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: 'a'.repeat(40), type: 'blob' },
      ],
      cache,
    })
    
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'subdir', mode: '040000', oid: nestedTreeOid, type: 'tree' },
      ],
      cache,
    })
    
    await assert.rejects(
      async () => {
        await resolveFilepath({
          fs,
          cache,
          gitdir,
          oid: rootTreeOid,
          filepath: 'subdir/nonexistent.txt',
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })

  await t.test('error:ObjectTypeError-path-segment-not-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    // Try to access file.txt/nested.txt (file.txt is a blob, not a tree)
    await assert.rejects(
      async () => {
        await resolveFilepath({
          fs,
          cache,
          gitdir,
          oid: treeOid,
          filepath: 'file.txt/nested.txt',
        })
      },
      (error: any) => {
        return error instanceof ObjectTypeError && error.data?.expected === 'tree'
      }
    )
  })

  await t.test('ok:filepath-multiple-slashes', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('content'),
      cache,
    })
    
    const tree3Oid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const tree2Oid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'level3', mode: '040000', oid: tree3Oid, type: 'tree' },
      ],
      cache,
    })
    
    const tree1Oid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'level2', mode: '040000', oid: tree2Oid, type: 'tree' },
      ],
      cache,
    })
    
    const rootTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'level1', mode: '040000', oid: tree1Oid, type: 'tree' },
      ],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: rootTreeOid,
      filepath: 'level1/level2/level3/file.txt',
    })
    
    assert.strictEqual(result, blobOid)
  })

  await t.test('ok:filepath-special-characters', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const blobOid = await writeBlob({
      fs,
      dir,
      gitdir,
      blob: Buffer.from('content'),
      cache,
    })
    
    const treeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [
        { path: 'file with spaces.txt', mode: '100644', oid: blobOid, type: 'blob' },
      ],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: treeOid,
      filepath: 'file with spaces.txt',
    })
    
    assert.strictEqual(result, blobOid)
  })

  await t.test('edge:empty-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const emptyTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [],
      cache,
    })
    
    const result = await resolveFilepath({
      fs,
      cache,
      gitdir,
      oid: emptyTreeOid,
      filepath: '',
    })
    
    assert.strictEqual(result, emptyTreeOid)
  })

  await t.test('error:NotFoundError-file-in-empty-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    const cache: Record<string, unknown> = {}
    
    const emptyTreeOid = await writeTree({
      fs,
      dir,
      gitdir,
      tree: [],
      cache,
    })
    
    await assert.rejects(
      async () => {
        await resolveFilepath({
          fs,
          cache,
          gitdir,
          oid: emptyTreeOid,
          filepath: 'file.txt',
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })
})

