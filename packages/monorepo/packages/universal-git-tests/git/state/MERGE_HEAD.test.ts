import { test } from 'node:test'
import assert from 'node:assert'
import { readMergeHead, writeMergeHead, deleteMergeHead } from '@awesome-os/universal-git-src/git/state/MERGE_HEAD.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('MERGE_HEAD', async (t) => {
  await t.test('ok:read-returns-null-when-missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const result = await readMergeHead({ fs, gitdir })
    
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-returns-OID-when-exists', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'a'.repeat(40)
    await writeMergeHead({ fs, gitdir, oid })
    
    const result = await readMergeHead({ fs, gitdir })
    
    assert.strictEqual(result, oid)
  })

  await t.test('ok:write-creates-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'b'.repeat(40)
    await writeMergeHead({ fs, gitdir, oid })
    
    const result = await readMergeHead({ fs, gitdir })
    assert.strictEqual(result, oid)
  })

  await t.test('ok:write-overwrites-existing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid1 = 'c'.repeat(40)
    const oid2 = 'd'.repeat(40)
    
    await writeMergeHead({ fs, gitdir, oid: oid1 })
    await writeMergeHead({ fs, gitdir, oid: oid2 })
    
    const result = await readMergeHead({ fs, gitdir })
    assert.strictEqual(result, oid2)
  })

  await t.test('ok:delete-removes-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'e'.repeat(40)
    await writeMergeHead({ fs, gitdir, oid })
    await deleteMergeHead({ fs, gitdir })
    
    const result = await readMergeHead({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:delete-handles-missing-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Should not throw
    await deleteMergeHead({ fs, gitdir })
    
    const result = await readMergeHead({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-trims-whitespace', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'f'.repeat(40)
    await fs.write(`${gitdir}/MERGE_HEAD`, `  ${oid}  \n`, 'utf8')
    
    const result = await readMergeHead({ fs, gitdir })
    assert.strictEqual(result, oid)
  })
})

