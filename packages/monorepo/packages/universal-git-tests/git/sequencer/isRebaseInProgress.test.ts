import { test } from 'node:test'
import assert from 'node:assert'
import { isRebaseInProgress, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('isRebaseInProgress', async (t) => {
  await t.test('ok:no-rebase', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await isRebaseInProgress({ fs, gitdir })
    assert.strictEqual(result, false)
  })

  await t.test('ok:rebase-in-progress', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Create rebase directory and todo file
    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/git-rebase-todo`, 'pick abc123 commit message\n', 'utf8')

    const result = await isRebaseInProgress({ fs, gitdir })
    assert.strictEqual(result, true)
  })
})

