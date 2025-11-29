import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { InvalidFilepathError } from '@awesome-os/universal-git-src/errors/InvalidFilepathError.ts'
import { NotFoundError } from '@awesome-os/universal-git-src/errors/NotFoundError.ts'
import { ObjectTypeError } from '@awesome-os/universal-git-src/errors/ObjectTypeError.ts'
import { GitTree } from '@awesome-os/universal-git-src/models/GitTree.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { resolveFilepath } from '@awesome-os/universal-git-src/utils/resolveFilepath.ts'
import type { GitBackend } from '@awesome-os/universal-git-src/backends/GitBackend.ts'

// Helper function to write a blob using backend methods
async function writeBlobWithBackend(gitBackend: GitBackend, content: string | Buffer): Promise<string> {
  const buffer = typeof content === 'string'
    ? UniversalBuffer.from(content, 'utf8')
    : UniversalBuffer.from(content)
  return await gitBackend.writeObject('blob', buffer, 'content')
}

import type { ObjectType } from '@awesome-os/universal-git-src/models/GitObject.ts'

// Helper function to write a tree using backend methods
async function writeTreeWithBackend(gitBackend: GitBackend, entries: Array<{ path: string; mode: string; oid: string; type: ObjectType }>): Promise<string> {
  const tree = new GitTree(entries)
  const treeBuffer = tree.toObject()
  return await gitBackend.writeObject('tree', treeBuffer, 'content')
}

test('resolveFilepath', async (t) => {
  await t.test('ok:resolves-empty-filepath', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    // Create a blob
    const blobOid = await writeBlobWithBackend(gitBackend, 'dummy content')

    // Create a tree
    const treeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: treeOid,
      filepath: ''
    })

    assert.strictEqual(result, treeOid)
  })

  await t.test('ok:resolves-root-level-file', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, Buffer.from('content'))

    const treeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: treeOid,
      filepath: 'file.txt'
    })

    assert.strictEqual(result, blobOid)
  })

  await t.test('ok:resolves-nested-file', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, Buffer.from('nested content'))

    const nestedTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'nested.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const rootTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'subdir', mode: '040000', oid: nestedTreeOid, type: 'tree' },
    ])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: rootTreeOid,
      filepath: 'subdir/nested.txt'
    })

    assert.strictEqual(result, blobOid)
  })

  await t.test('ok:resolves-deeply-nested-file', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, Buffer.from('deep content'))

    const deepTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'deep.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const midTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'mid', mode: '040000', oid: deepTreeOid, type: 'tree' },
    ])

    const rootTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'level1', mode: '040000', oid: midTreeOid, type: 'tree' },
    ])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: rootTreeOid,
      filepath: 'level1/mid/deep.txt'
    })

    assert.strictEqual(result, blobOid)
  })

  await t.test('error:InvalidFilepathError-leading-slash', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    await assert.rejects(
      async () => {
        await resolveFilepath({
          gitBackend,
          cache: repo.cache,
          oid: 'a'.repeat(40),
          filepath: '/file.txt'
        })
      },
      (error: any) => {
        return error instanceof InvalidFilepathError && error.data?.reason === 'leading-slash'
      }
    )
  })

  await t.test('error:InvalidFilepathError-trailing-slash', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    await assert.rejects(
      async () => {
        await resolveFilepath({
          gitBackend,
          cache: repo.cache,
          oid: 'a'.repeat(40),
          filepath: 'file.txt/'
        })
      },
      (error: any) => {
        return error instanceof InvalidFilepathError && error.data?.reason === 'trailing-slash'
      }
    )
  })

  await t.test('error:NotFoundError-non-existent-file', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, 'dummy')

    const treeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    await assert.rejects(
      async () => {
        await resolveFilepath({
          gitBackend,
          cache: repo.cache,
          oid: treeOid,
          filepath: 'nonexistent.txt'
        })
      },
      (error: any) => {
        return error instanceof NotFoundError && error.message.includes('nonexistent.txt')
      }
    )
  })

  await t.test('error:NotFoundError-non-existent-nested-file', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, 'dummy')

    const nestedTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const rootTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'subdir', mode: '040000', oid: nestedTreeOid, type: 'tree' },
    ])

    await assert.rejects(
      async () => {
        await resolveFilepath({
          gitBackend,
          cache: repo.cache,
          oid: rootTreeOid,
          filepath: 'subdir/nonexistent.txt'
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })

  await t.test('error:ObjectTypeError-path-segment-not-tree', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, Buffer.from('content'))

    const treeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    // Try to access file.txt/nested.txt (file.txt is a blob, not a tree)
    await assert.rejects(
      async () => {
        await resolveFilepath({
          gitBackend,
          cache: repo.cache,
          oid: treeOid,
          filepath: 'file.txt/nested.txt'
        })
      },
      (error: any) => {
        return error instanceof ObjectTypeError && error.data?.expected === 'tree'
      }
    )
  })

  await t.test('ok:filepath-multiple-slashes', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, Buffer.from('content'))

    const tree3Oid = await writeTreeWithBackend(gitBackend, [
      { path: 'file.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const tree2Oid = await writeTreeWithBackend(gitBackend, [
      { path: 'level3', mode: '040000', oid: tree3Oid, type: 'tree' },
    ])

    const tree1Oid = await writeTreeWithBackend(gitBackend, [
      { path: 'level2', mode: '040000', oid: tree2Oid, type: 'tree' },
    ])

    const rootTreeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'level1', mode: '040000', oid: tree1Oid, type: 'tree' },
    ])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: rootTreeOid,
      filepath: 'level1/level2/level3/file.txt'
    })

    assert.strictEqual(result, blobOid)
  })

  await t.test('ok:filepath-special-characters', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const blobOid = await writeBlobWithBackend(gitBackend, Buffer.from('content'))

    const treeOid = await writeTreeWithBackend(gitBackend, [
      { path: 'file with spaces.txt', mode: '100644', oid: blobOid, type: 'blob' },
    ])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: treeOid,
      filepath: 'file with spaces.txt'
    })

    assert.strictEqual(result, blobOid)
  })

  await t.test('edge:empty-tree', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const emptyTreeOid = await writeTreeWithBackend(gitBackend, [])

    const result = await resolveFilepath({
      gitBackend,
      cache: repo.cache,
      oid: emptyTreeOid,
      filepath: ''
    })

    assert.strictEqual(result, emptyTreeOid)
  })

  await t.test('error:NotFoundError-file-in-empty-tree', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-empty', { init: true })
    const gitBackend = repo.gitBackend

    const emptyTreeOid = await writeTreeWithBackend(gitBackend, [])

    await assert.rejects(
      async () => {
        await resolveFilepath({
          gitBackend,
          cache: repo.cache,
          oid: emptyTreeOid,
          filepath: 'file.txt'
        })
      },
      (error: any) => {
        return error instanceof NotFoundError
      }
    )
  })
})

