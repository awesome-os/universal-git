import { test } from 'node:test'
import assert from 'node:assert'
import { readNote } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('readNote', async (t) => {
  await t.test('ok:to-commit', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-readNote')
    // Test
    const note = await readNote({
      fs,
      gitdir,
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    assert.strictEqual(
      Buffer.from(note).toString('utf8'),
      'This is a note about a commit.\n'
    )
  })

  await t.test('ok:to-tree', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-readNote')
    // Test
    const note = await readNote({
      fs,
      gitdir,
      oid: '199948939a0b95c6f27668689102496574b2c332',
    })
    assert.strictEqual(
      Buffer.from(note).toString('utf8'),
      'This is a note about a tree.\n'
    )
  })

  await t.test('ok:to-blob', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-readNote')
    // Test
    const note = await readNote({
      fs,
      gitdir,
      oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
    })
    assert.strictEqual(
      Buffer.from(note).toString('utf8'),
      'This is a note about a blob.\n'
    )
  })

  await t.test('param:ref-alternate-branch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-readNote')
    // Test
    const note = await readNote({
      fs,
      gitdir,
      ref: 'refs/notes/alt',
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    assert.strictEqual(
      Buffer.from(note).toString('utf8'),
      'This is alternate note about a commit.\n'
    )
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readNote({
        gitdir: '/tmp/test.git',
        oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:oid-missing', async () => {
    const { fs, gitdir } = await makeFixture('test-readNote')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readNote({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'oid')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { fs, gitdir, dir } = await makeFixture('test-readNote')
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir })
    // Provide gitdir explicitly to avoid default parameter evaluation issue
    const note = await readNote({
      repo,
      gitdir, // Explicitly provide to avoid default parameter evaluation
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    assert.strictEqual(
      Buffer.from(note).toString('utf8'),
      'This is a note about a commit.\n'
    )
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-readNote')
    const note = await readNote({
      fs,
      dir,
      gitdir,
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    assert.strictEqual(
      Buffer.from(note).toString('utf8'),
      'This is a note about a commit.\n'
    )
  })

  await t.test('error:caller-property', async () => {
    const { fs, gitdir } = await makeFixture('test-readNote')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await readNote({
        fs,
        gitdir,
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.readNote')
    }
  })

  await t.test('error:note-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-readNote')
    const { NotFoundError } = await import('@awesome-os/universal-git-src/errors/NotFoundError.ts')
    try {
      await readNote({
        fs,
        gitdir,
        oid: '0000000000000000000000000000000000000000',
      })
      assert.fail('Should have thrown NotFoundError')
    } catch (error) {
      assert.ok(error instanceof NotFoundError)
    }
  })
})

