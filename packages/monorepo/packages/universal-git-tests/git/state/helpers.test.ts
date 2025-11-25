import { test } from 'node:test'
import assert from 'node:assert'
import { isMergeInProgress, isCherryPickInProgress, getOperationState, clearOperationState } from '@awesome-os/universal-git-src/git/state/helpers.ts'
import { writeMergeHead } from '@awesome-os/universal-git-src/git/state/MERGE_HEAD.ts'
import { writeMergeMsg } from '@awesome-os/universal-git-src/git/state/MERGE_MSG.ts'
import { writeMergeMode } from '@awesome-os/universal-git-src/git/state/MERGE_MODE.ts'
import { writeCherryPickHead } from '@awesome-os/universal-git-src/git/state/CHERRY_PICK_HEAD.ts'
import { writeOrigHead } from '@awesome-os/universal-git-src/git/state/ORIG_HEAD.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('state helpers', async (t) => {
  await t.test('ok:isMergeInProgress-returns-false-when-no-merge', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const result = await isMergeInProgress({ fs, gitdir })
    
    assert.strictEqual(result, false)
  })

  await t.test('ok:isMergeInProgress-returns-true-when-merge-exists', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'a'.repeat(40)
    await writeMergeHead({ fs, gitdir, oid })
    
    const result = await isMergeInProgress({ fs, gitdir })
    
    assert.strictEqual(result, true)
  })

  await t.test('ok:isCherryPickInProgress-returns-false-when-no-cherry-pick', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const result = await isCherryPickInProgress({ fs, gitdir })
    
    assert.strictEqual(result, false)
  })

  await t.test('ok:isCherryPickInProgress-returns-true-when-cherry-pick-exists', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'b'.repeat(40)
    await writeCherryPickHead({ fs, gitdir, oid })
    
    const result = await isCherryPickInProgress({ fs, gitdir })
    
    assert.strictEqual(result, true)
  })

  await t.test('ok:getOperationState-returns-empty-state', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const state = await getOperationState({ fs, gitdir })
    
    assert.strictEqual(state.merge, null)
    assert.strictEqual(state.cherryPick, null)
    assert.strictEqual(state.rebase, false)
    assert.strictEqual(state.origHead, null)
  })

  await t.test('ok:getOperationState-returns-merge-state', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const mergeOid = 'c'.repeat(40)
    const mode = 'no-ff'
    const message = 'Merge message'
    
    await writeMergeHead({ fs, gitdir, oid: mergeOid })
    await writeMergeMode({ fs, gitdir, mode })
    await writeMergeMsg({ fs, gitdir, message })
    
    const state = await getOperationState({ fs, gitdir })
    
    assert.ok(state.merge !== null)
    assert.strictEqual(state.merge!.head, mergeOid)
    assert.strictEqual(state.merge!.mode, mode)
    assert.strictEqual(state.merge!.message, message)
  })

  await t.test('ok:getOperationState-returns-cherry-pick-state', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const cherryPickOid = 'd'.repeat(40)
    await writeCherryPickHead({ fs, gitdir, oid: cherryPickOid })
    
    const state = await getOperationState({ fs, gitdir })
    
    assert.ok(state.cherryPick !== null)
    assert.strictEqual(state.cherryPick!.head, cherryPickOid)
  })

  await t.test('ok:getOperationState-returns-orig-head', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const origOid = 'e'.repeat(40)
    await writeOrigHead({ fs, gitdir, oid: origOid })
    
    const state = await getOperationState({ fs, gitdir })
    
    assert.strictEqual(state.origHead, origOid)
  })

  await t.test('ok:clearOperationState-removes-all-state', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Set up state
    await writeMergeHead({ fs, gitdir, oid: 'f'.repeat(40) })
    await writeCherryPickHead({ fs, gitdir, oid: 'g'.repeat(40) })
    await writeOrigHead({ fs, gitdir, oid: 'h'.repeat(40) })
    
    // Clear state
    await clearOperationState({ fs, gitdir })
    
    // Verify cleared
    const state = await getOperationState({ fs, gitdir })
    assert.strictEqual(state.merge, null)
    assert.strictEqual(state.cherryPick, null)
    assert.strictEqual(state.origHead, null)
  })
})

