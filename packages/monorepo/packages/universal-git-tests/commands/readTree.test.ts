import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Errors, readTree } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'

describe('readTree', () => {
  it('ok:read-a-tree-directly', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    const { oid, tree } = await readTree({
      repo,
      oid: '6257985e3378ec42a03a57a7dc8eb952d69a5ff3',
    })
    assert.strictEqual(oid, '6257985e3378ec42a03a57a7dc8eb952d69a5ff3')
    assert.ok(Array.isArray(tree))
    assert.ok(tree.length > 0)
    // Check that tree entries have required properties
    tree.forEach(entry => {
      assert.ok(entry.mode)
      assert.ok(entry.oid)
      assert.ok(entry.path)
      assert.ok(entry.type)
    })
  })

  it('ok:peels-tags', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    const { oid, tree } = await readTree({
      repo,
      oid: '86167ce7861387275b2fbd188e031e00aff446f9',
    })
    // Tag should be peeled to the tree it points to
    assert.strictEqual(oid, '6257985e3378ec42a03a57a7dc8eb952d69a5ff3')
    assert.ok(Array.isArray(tree))
    assert.ok(tree.length > 0)
  })

  it('ok:with-simple-filepath-to-tree', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    const { oid, tree } = await readTree({
      repo,
      oid: 'be1e63da44b26de8877a184359abace1cddcb739',
      filepath: '',
    })
    // Empty filepath should return root tree
    assert.strictEqual(oid, '6257985e3378ec42a03a57a7dc8eb952d69a5ff3')
    assert.ok(Array.isArray(tree))
    assert.ok(tree.length > 0)
  })

  it('ok:with-deep-filepath-to-tree', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    const { oid, tree } = await readTree({
      repo,
      oid: 'be1e63da44b26de8877a184359abace1cddcb739',
      filepath: 'src/commands',
    })
    assert.strictEqual(oid, '7704a6e8a802efcdbe6cf3dfa114c105f1d5c67a')
    assert.ok(Array.isArray(tree))
    assert.ok(tree.length > 0)
    // Verify it's the commands directory
    const entry = tree.find((e: any) => e.path === 'clone.js')
    assert.ok(entry, 'Should contain clone.js')
  })

  it('error:with-erroneous-filepath-directory-is-a-file', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    let error: unknown = null
    try {
      await readTree({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        filepath: 'src/commands/clone.js/isntafolder.txt',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.ObjectTypeError)
  })

  it('error:with-erroneous-filepath-no-such-directory', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    let error: unknown = null
    try {
      await readTree({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        filepath: 'src/isntafolder',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.NotFoundError)
  })

  it('error:with-erroneous-filepath-leading-slash', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    let error: unknown = null
    try {
      await readTree({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        filepath: '/src',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidFilepathError)
    if (error instanceof Errors.InvalidFilepathError) {
      assert.strictEqual(error.data.reason, 'leading-slash')
    }
  })

  it('error:with-erroneous-filepath-trailing-slash', async () => {
    // Setup
    const { repo } = await makeFixture('test-readTree')
    // Test
    let error: unknown = null
    try {
      await readTree({
        repo,
        oid: 'be1e63da44b26de8877a184359abace1cddcb739',
        filepath: 'src/',
      })
    } catch (err) {
      error = err
    }
    assert.notStrictEqual(error, null)
    assert.ok(error instanceof Errors.InvalidFilepathError)
    if (error instanceof Errors.InvalidFilepathError) {
      assert.strictEqual(error.data.reason, 'trailing-slash')
    }
  })
})

