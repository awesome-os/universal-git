import { test } from 'node:test'
import assert from 'node:assert'
import { readMergeMsg, writeMergeMsg, deleteMergeMsg } from '@awesome-os/universal-git-src/git/state/MERGE_MSG.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('MERGE_MSG', async (t) => {
  await t.test('ok:read-returns-null-when-missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const result = await readMergeMsg({ fs, gitdir })
    
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-returns-message-when-exists', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const message = 'Merge branch feature into main'
    await writeMergeMsg({ fs, gitdir, message })
    
    const result = await readMergeMsg({ fs, gitdir })
    
    assert.strictEqual(result, message)
  })

  await t.test('ok:write-creates-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const message = 'Test merge message'
    await writeMergeMsg({ fs, gitdir, message })
    
    const result = await readMergeMsg({ fs, gitdir })
    assert.strictEqual(result, message)
  })

  await t.test('ok:write-overwrites-existing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const message1 = 'First message'
    const message2 = 'Second message'
    
    await writeMergeMsg({ fs, gitdir, message: message1 })
    await writeMergeMsg({ fs, gitdir, message: message2 })
    
    const result = await readMergeMsg({ fs, gitdir })
    assert.strictEqual(result, message2)
  })

  await t.test('ok:delete-removes-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const message = 'Test message'
    await writeMergeMsg({ fs, gitdir, message })
    await deleteMergeMsg({ fs, gitdir })
    
    const result = await readMergeMsg({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:delete-handles-missing-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Should not throw
    await deleteMergeMsg({ fs, gitdir })
    
    const result = await readMergeMsg({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-trims-whitespace', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const message = 'Test message'
    await fs.write(`${gitdir}/MERGE_MSG`, `  ${message}  \n`, 'utf8')
    
    const result = await readMergeMsg({ fs, gitdir })
    assert.strictEqual(result, message)
  })
})

