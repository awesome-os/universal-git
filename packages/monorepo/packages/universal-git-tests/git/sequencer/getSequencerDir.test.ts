import { test } from 'node:test'
import assert from 'node:assert'
import { getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'

test('getSequencerDir', async (t) => {
  await t.test('ok:rebase-operation', () => {
    const gitdir = '/test/.git'
    const result = getSequencerDir(gitdir, 'rebase')
    assert.ok(result.includes('rebase-merge'))
    assert.ok(!result.includes('sequencer'))
  })

  await t.test('ok:cherry-pick-operation', () => {
    const gitdir = '/test/.git'
    const result = getSequencerDir(gitdir, 'cherry-pick')
    assert.ok(result.includes('sequencer'))
    assert.ok(!result.includes('rebase-merge'))
  })

  await t.test('ok:default-operation', () => {
    const gitdir = '/test/.git'
    const result = getSequencerDir(gitdir)
    // Default operation is 'rebase', so should return 'rebase-merge'
    assert.ok(result.includes('rebase-merge'))
  })
})

