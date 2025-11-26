import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  Errors,
  merge,
  readBlob,
  resolveRef,
  abortMerge,
  add,
  STAGE,
  TREE,
  WORKDIR,
  walk,
} from '@awesome-os/universal-git-src/index.ts'
// Keep Repository import independent to avoid circular dependency issues
// Import directly from the module instead of through index.ts
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'
import { modified } from '@awesome-os/universal-git-src/utils/modified.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('abortMerge', () => {
  it('ok:conflicted-files-different-stages', async () => {
    // Setup
    const { repo } = await makeFixture('test-abortMerge')

    const branchA = await resolveRef({ repo, ref: 'a' })
    const branchB = await resolveRef({ repo, ref: 'b' })
    const ancestor = '2d7b1a9b82e52bd8648cf156aa559eff3a27a678' // common ancestor, hard coded, not ideal

    const fileAVersions = [
      await readBlob({ repo, oid: ancestor, filepath: 'a' }),
      await readBlob({ repo, oid: branchA, filepath: 'a' }),
      await readBlob({ repo, oid: branchB, filepath: 'a' }),
    ]

    const fileBVersions = [
      await readBlob({ repo, oid: ancestor, filepath: 'b' }),
      await readBlob({ repo, oid: branchA, filepath: 'b' }),
      await readBlob({ repo, oid: branchB, filepath: 'b' }),
    ]

    // Test
    let error: unknown = null
    try {
      await merge({
        repo,
        ours: 'a',
        theirs: 'b',
        abortOnConflict: false,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
      })
    } catch (e) {
      error = e
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MergeConflictError || (error as any).code === Errors.MergeConflictError.code)

    const index = await repo.readIndexDirect()
    assert.strictEqual(index.unmergedPaths.length, 2)
    assert.strictEqual(index.entriesFlat.length, 7)
    assert.ok(index.unmergedPaths.includes('a'))
    assert.ok(index.unmergedPaths.includes('b'))
    
    const entryA = index.entriesMap.get('a')
    const entryB = index.entriesMap.get('b')
    const entryC = index.entriesMap.get('c')
    
    assert.ok(entryA !== undefined, 'Entry a should exist')
    assert.ok(entryB !== undefined, 'Entry b should exist')
    assert.ok(entryC !== undefined, 'Entry c should exist')
    
    assert.strictEqual(entryA.stages.length, 4)
    assert.strictEqual(entryB.stages.length, 4)
    assert.strictEqual(entryC.stages.length, 1)
    
    const fileAStages = [
      await readBlob({
        repo,
        oid: entryA.stages[1].oid,
      }),
      await readBlob({
        repo,
        oid: entryA.stages[2].oid,
      }),
      await readBlob({
        repo,
        oid: entryA.stages[3].oid,
      }),
    ]
    const fileBStages = [
      await readBlob({
        repo,
        oid: entryB.stages[1].oid,
      }),
      await readBlob({
        repo,
        oid: entryB.stages[2].oid,
      }),
      await readBlob({
        repo,
        oid: entryB.stages[3].oid,
      }),
    ]
    assert.deepStrictEqual(fileAVersions, fileAStages)
    assert.deepStrictEqual(fileBVersions, fileBStages)
  })

  it('ok:abort-merge', async () => {
    // Setup
    const { repo } = await makeFixture('test-abortMerge')

    // Test
    let error: unknown = null
    try {
      await merge({
        repo,
        ours: 'a',
        theirs: 'b',
        abortOnConflict: false,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
      })
    } catch (e) {
      error = e
    }

    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MergeConflictError || (error as any).code === Errors.MergeConflictError.code)

    await abortMerge({ repo })

    const trees = [TREE({ ref: 'HEAD' }), WORKDIR(), STAGE()]
    await walk({
      repo,
      trees,
      map: async function (path, [head, workdir, index]) {
        if (path === '.') return

        if (head && index) {
          assert.deepStrictEqual([path, await head.mode()], [path, await index.mode()])
          assert.deepStrictEqual([path, await head.oid()], [path, await index.oid()])
        }

        assert.strictEqual(await modified(index, head), false)

        // only since we didn't touch anything
        assert.strictEqual(await modified(workdir, head), false)

        assert.strictEqual(await modified(index, workdir), false)
      },
    })
  })

  it('ok:abort-after-modifying-files', async () => {
    // Setup
    const { repo } = await makeFixture('test-abortMerge')
    const dir = await repo.getDir()!

    // Test
    let error: unknown = null
    try {
      await merge({
        repo,
        ours: 'a',
        theirs: 'b',
        abortOnConflict: false,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
      })
    } catch (e) {
      error = e
    }

    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MergeConflictError || (error as any).code === Errors.MergeConflictError.code)

    await repo.fs.rm(`${dir}/a`)
    await repo.fs.write(`${dir}/b`, 'new text for file b')
    await repo.fs.write(`${dir}/c`, 'new text for file c')

    await abortMerge({ repo })

    const trees = [TREE({ ref: 'HEAD' }), WORKDIR(), STAGE()]
    await walk({
      repo,
      trees,
      map: async function (path, [head, workdir, index]) {
        if (path === '.') return

        if (path === 'b') {
          assert.strictEqual(await modified(workdir, head), false)
          assert.strictEqual(await modified(workdir, index), false)
        }

        if (head && index) {
          assert.deepStrictEqual([path, await head.mode()], [path, await index.mode()])
          assert.deepStrictEqual([path, await head.oid()], [path, await index.oid()])
        }

        assert.strictEqual(await modified(index, head), false)
      },
    })
    const fileCData = await repo.fs.read(`${dir}/c`)
    const fileBData = await repo.fs.read(`${dir}/b`)
    const fileCContent = fileCData ? new TextDecoder().decode(typeof fileCData === 'string' ? new TextEncoder().encode(fileCData) : fileCData) : ''
    const fileBContent = fileBData ? new TextDecoder().decode(typeof fileBData === 'string' ? new TextEncoder().encode(fileBData) : fileBData) : ''
    assert.strictEqual(fileCContent, 'new text for file c')
    assert.notStrictEqual(fileBContent, 'new text for file b')
  })

  it('behavior:workdir-ne-index-eq-head', async () => {
    // Setup
    const { repo } = await makeFixture('test-abortMerge')
    const dir = await repo.getDir()!

    const head = await resolveRef({ repo, ref: 'HEAD' })

    const fileAHeadVersion = await readBlob({
      repo,
      oid: head,
      filepath: 'a',
    }).then(result => {
      return new TextDecoder().decode(result.blob)
    })
    const fileBHeadVersion = await readBlob({
      repo,
      oid: head,
      filepath: 'b',
    }).then(result => {
      return new TextDecoder().decode(result.blob)
    })

    // Test
    let error: unknown = null
    try {
      await merge({
        repo,
        ours: 'a',
        theirs: 'b',
        abortOnConflict: false,
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
      })
    } catch (e) {
      error = e
    }

    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.MergeConflictError || (error as any).code === Errors.MergeConflictError.code)

    await repo.fs.write(`${dir}/c`, 'new text for file c')
    await abortMerge({ repo })

    const fileAContent = await repo.fs.read(`${dir}/a`).then(buffer => {
      assert.ok(buffer !== null, 'File a content should not be null')
      return buffer.toString()
    })
    const fileBContent = await repo.fs.read(`${dir}/b`).then(buffer => {
      assert.ok(buffer !== null, 'File b content should not be null')
      return buffer.toString()
    })
    const fileCContent = await repo.fs.read(`${dir}/c`).then(buffer => {
      assert.ok(buffer !== null, 'File c content should not be null')
      return buffer.toString()
    })

    const dirContents = await repo.fs.readdir(dir)
    assert.ok(dirContents !== null && dirContents !== undefined, 'readdir should return an array')

    assert.strictEqual(dirContents.length, 3)
    assert.strictEqual(fileAContent, fileAHeadVersion)
    assert.strictEqual(fileBContent, fileBHeadVersion)
    assert.strictEqual(fileCContent, 'new text for file c')
  })
})

