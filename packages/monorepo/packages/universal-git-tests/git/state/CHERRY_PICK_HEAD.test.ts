import { test } from 'node:test'
import assert from 'node:assert'
import { readCherryPickHead, writeCherryPickHead, deleteCherryPickHead } from '@awesome-os/universal-git-src/git/state/CHERRY_PICK_HEAD.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('CHERRY_PICK_HEAD', async (t) => {
  await t.test('ok:read-returns-null-when-missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const result = await readCherryPickHead({ fs, gitdir })
    
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-returns-OID-when-exists', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'a'.repeat(40)
    await writeCherryPickHead({ fs, gitdir, oid })
    
    const result = await readCherryPickHead({ fs, gitdir })
    
    assert.strictEqual(result, oid)
  })

  await t.test('ok:write-creates-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'b'.repeat(40)
    await writeCherryPickHead({ fs, gitdir, oid })
    
    const result = await readCherryPickHead({ fs, gitdir })
    assert.strictEqual(result, oid)
  })

  await t.test('ok:write-overwrites-existing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid1 = 'c'.repeat(40)
    const oid2 = 'd'.repeat(40)
    
    await writeCherryPickHead({ fs, gitdir, oid: oid1 })
    await writeCherryPickHead({ fs, gitdir, oid: oid2 })
    
    const result = await readCherryPickHead({ fs, gitdir })
    assert.strictEqual(result, oid2)
  })

  await t.test('ok:delete-removes-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'e'.repeat(40)
    await writeCherryPickHead({ fs, gitdir, oid })
    await deleteCherryPickHead({ fs, gitdir })
    
    const result = await readCherryPickHead({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:delete-handles-missing-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Should not throw
    await deleteCherryPickHead({ fs, gitdir })
    
    const result = await readCherryPickHead({ fs, gitdir })
    assert.strictEqual(result, null)
  })
})

