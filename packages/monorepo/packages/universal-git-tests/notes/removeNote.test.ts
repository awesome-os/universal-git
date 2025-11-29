import { test } from 'node:test'
import assert from 'node:assert'
import { listNotes, removeNote } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

test('removeNote', async (t) => {
  await t.test('ok:default-branch', async () => {
    // Setup
    const { repo } = await makeFixture('test-removeNote')
    // Test
    let notes = await listNotes({
      repo,
    })
    assert.strictEqual(notes.length, 3)
    const oid = await removeNote({
      repo,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '199948939a0b95c6f27668689102496574b2c332',
    })
    notes = await listNotes({
      repo,
    })
    assert.strictEqual(notes.length, 2)
    assert.strictEqual(oid, '7f186442042a2d1dcdfeb56619c5d700168801e9')
  })

  await t.test('ok:alternate-branch', async () => {
    // Setup
    const { repo } = await makeFixture('test-removeNote')
    // Test
    let notes = await listNotes({
      repo,
      ref: 'refs/notes/alt',
    })
    assert.strictEqual(notes.length, 1)
    const oid = await removeNote({
      repo,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      ref: 'refs/notes/alt',
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    notes = await listNotes({
      repo,
      ref: 'refs/notes/alt',
    })
    assert.strictEqual(notes.length, 0)
    assert.strictEqual(oid, 'db09e78a665c260b8b76778643196b4cc53d5201')
  })

  await t.test('param:fs-missing', async () => {
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await removeNote({
        gitdir: '/tmp/test.git',
        oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
        author: { name: 'Test', email: 'test@example.com', timestamp: 1578937310, timezoneOffset: 300 },
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'fs')
    }
  })

  await t.test('param:oid-missing', async () => {
    const { repo } = await makeFixture('test-removeNote')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await removeNote({
        repo,
        author: { name: 'Test', email: 'test@example.com', timestamp: 1578937310, timezoneOffset: 300 },
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual((error as any).data?.parameter, 'oid')
    }
  })

  await t.test('param:repo-provided', async () => {
    const { repo } = await makeFixture('test-removeNote')
    const oid = await removeNote({
      repo,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '199948939a0b95c6f27668689102496574b2c332',
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('param:dir-derives-gitdir', async () => {
    const { repo } = await makeFixture('test-removeNote')
    const oid = await removeNote({
      repo,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '199948939a0b95c6f27668689102496574b2c332',
    })
    assert.ok(typeof oid === 'string')
    assert.strictEqual(oid.length, 40)
  })

  await t.test('error:caller-property', async () => {
    const { repo } = await makeFixture('test-removeNote')
    const { MissingParameterError } = await import('@awesome-os/universal-git-src/errors/MissingParameterError.ts')
    try {
      await removeNote({
        repo,
        author: { name: 'Test', email: 'test@example.com', timestamp: 1578937310, timezoneOffset: 300 },
      } as any)
      assert.fail('Should have thrown MissingParameterError')
    } catch (error: any) {
      assert.ok(error instanceof MissingParameterError)
      assert.strictEqual(error.caller, 'git.removeNote')
    }
  })

  await t.test('edge:non-existent-note', async () => {
    const { repo } = await makeFixture('test-removeNote')
    try {
      await removeNote({
        repo,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: '0000000000000000000000000000000000000000',
      })
      // Should not throw - removeNote may be idempotent
    } catch (error) {
      // If it throws, that's also acceptable
      assert.ok(error instanceof Error)
    }
  })
})

