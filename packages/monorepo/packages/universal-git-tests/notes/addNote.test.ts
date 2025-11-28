import { test } from 'node:test'
import assert from 'node:assert'
import { Errors, addNote, readBlob, resolveRef, readTree } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('addNote', async (t) => {
  await t.test('ok:to-commit', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is a note about a commit.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/commits' })
    assert.strictEqual(commit, '1dc5cc644358afd817ebd143a9ae287e7ae62fb8')
    assert.strictEqual(oid, '1dc5cc644358afd817ebd143a9ae287e7ae62fb8')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '1dc5cc644358afd817ebd143a9ae287e7ae62fb8',
      filepath: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    assert.strictEqual(Buffer.from(blob).toString('utf8'), 'This is a note about a commit.')
  })

  await t.test('ok:to-tree', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '199948939a0b95c6f27668689102496574b2c332',
      note: 'This is a note about a tree.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/commits' })
    assert.strictEqual(commit, '7d7605d4dc2ac7418a73cb81c1e425945911ea1d')
    assert.strictEqual(oid, '7d7605d4dc2ac7418a73cb81c1e425945911ea1d')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '7d7605d4dc2ac7418a73cb81c1e425945911ea1d',
      filepath: '199948939a0b95c6f27668689102496574b2c332',
    })
    assert.strictEqual(Buffer.from(blob).toString('utf8'), 'This is a note about a tree.')
  })

  await t.test('ok:to-blob', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
      note: 'This is a note about a blob.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/commits' })
    assert.strictEqual(commit, '6e42dea39f6d5b8010e33834cb30d313ae088634')
    assert.strictEqual(oid, '6e42dea39f6d5b8010e33834cb30d313ae088634')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '6e42dea39f6d5b8010e33834cb30d313ae088634',
      filepath: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
    })
    assert.strictEqual(Buffer.from(blob).toString('utf8'), 'This is a note about a blob.')
  })

  await t.test('behavior:consecutive-notes-accumulate', async () => {
    // Setup
    const { fs, gitdir, repo } = await makeFixture('test-addNote')
    // Test
    {
      const oid = await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
        note: 'This is a note about a commit.',
      })
      const { tree } = await readTree({ repo, oid })
      assert.strictEqual(tree.length, 1)
    }
    {
      const oid = await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: '199948939a0b95c6f27668689102496574b2c332',
        note: 'This is a note about a tree.',
      })
      const { tree } = await readTree({ repo, oid })
      assert.strictEqual(tree.length, 2)
    }
    {
      const oid = await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
        note: 'This is a note about a blob.',
      })
      const { tree } = await readTree({ repo, oid })
      assert.strictEqual(tree.length, 3)
    }
  })

  await t.test('ok:add-note-different-branch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      ref: 'refs/notes/alt',
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
      note: 'This is a note about a blob.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/alt' })
    assert.strictEqual(commit, '6e42dea39f6d5b8010e33834cb30d313ae088634')
    assert.strictEqual(oid, '6e42dea39f6d5b8010e33834cb30d313ae088634')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '6e42dea39f6d5b8010e33834cb30d313ae088634',
      filepath: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
    })
    assert.strictEqual(Buffer.from(blob).toString('utf8'), 'This is a note about a blob.')
  })

  await t.test('error:note-already-exists', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is a note about a commit.',
    })
    // Test
    let error: unknown = null
    try {
      await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
        note: 'This is a note about a commit.',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.AlreadyExistsError)
  })

  await t.test('param:force', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is a note about a commit.',
    })
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is the newer note about a commit.',
      force: true,
    })
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid,
      filepath: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    assert.strictEqual(Buffer.from(blob).toString('utf8'), 'This is the newer note about a commit.')
  })
})

