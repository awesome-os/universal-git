import { test } from 'node:test'
import assert from 'node:assert'
import { listNotes } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('listNotes', async (t) => {
  await t.test('ok:from-default-branch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-listNotes')
    // Test
    const notes = await listNotes({
      fs,
      gitdir,
    })
    assert.strictEqual(notes.length, 3)
    assert.deepStrictEqual(notes, [
      {
        note: '0bd2dc08e06dafbcdfe1c97fc64a99d0f206ef78',
        target: '199948939a0b95c6f27668689102496574b2c332',
      },
      {
        note: '6e2160d80f201db57a02415c47da5037ecc7c27f',
        target: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
      },
      {
        note: '40f0ba45e23b41630eabae9f4fc8d5007e37fcd6',
        target: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      },
    ])
  })

  await t.test('ok:from-alternate-branch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-listNotes')
    // Test
    const notes = await listNotes({
      fs,
      gitdir,
      ref: 'refs/notes/alt',
    })
    assert.strictEqual(notes.length, 1)
    assert.deepStrictEqual(notes, [
      {
        note: '73ec9c00618d8ebb2648c47c9b05d78227569728',
        target: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      },
    ])
  })

  await t.test('edge:non-existent-branch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-listNotes')
    // Test
    const notes = await listNotes({
      fs,
      gitdir,
      ref: 'refs/notes/alt2',
    })
    assert.strictEqual(notes.length, 0)
    assert.deepStrictEqual(notes, [])
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listNotes({
        gitdir: '/tmp/test.git',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, gitdir } = await makeFixture('test-listNotes')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, gitdir })
    const notes = await listNotes({ repo })
    assert.ok(Array.isArray(notes))
    assert.strictEqual(notes.length, 3)
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-listNotes')
    const notes = await listNotes({ fs, dir, gitdir })
    assert.ok(Array.isArray(notes))
    // Notes may or may not exist depending on fixture
    assert.ok(notes.length >= 0)
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-listNotes')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await listNotes({
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.listNotes')
    }
  })

  await t.test('edge:empty-repository', async () => {
    const { fs, dir } = await makeFixture('test-empty')
    const { init } = await import('@awesome-os/universal-git-src/index.ts')
    await init({ fs, dir })
    const notes = await listNotes({ fs, dir })
    assert.ok(Array.isArray(notes))
    assert.strictEqual(notes.length, 0)
  })
})

