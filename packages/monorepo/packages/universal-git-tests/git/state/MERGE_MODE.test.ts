import { test } from 'node:test'
import assert from 'node:assert'
import { readMergeMode, writeMergeMode, deleteMergeMode } from '@awesome-os/universal-git-src/git/state/MERGE_MODE.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('MERGE_MODE', async (t) => {
  await t.test('ok:read-returns-null-when-missing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const result = await readMergeMode({ fs, gitdir })
    
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-returns-mode-when-exists', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const mode = 'no-ff'
    await writeMergeMode({ fs, gitdir, mode })
    
    const result = await readMergeMode({ fs, gitdir })
    
    assert.strictEqual(result, mode)
  })

  await t.test('ok:write-creates-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const mode = 'ff-only'
    await writeMergeMode({ fs, gitdir, mode })
    
    const result = await readMergeMode({ fs, gitdir })
    assert.strictEqual(result, mode)
  })

  await t.test('ok:write-overwrites-existing', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const mode1 = 'no-ff'
    const mode2 = 'ff-only'
    
    await writeMergeMode({ fs, gitdir, mode: mode1 })
    await writeMergeMode({ fs, gitdir, mode: mode2 })
    
    const result = await readMergeMode({ fs, gitdir })
    assert.strictEqual(result, mode2)
  })

  await t.test('ok:delete-removes-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const mode = 'no-ff'
    await writeMergeMode({ fs, gitdir, mode })
    await deleteMergeMode({ fs, gitdir })
    
    const result = await readMergeMode({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:delete-handles-missing-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Should not throw
    await deleteMergeMode({ fs, gitdir })
    
    const result = await readMergeMode({ fs, gitdir })
    assert.strictEqual(result, null)
  })
})

