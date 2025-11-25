import { test } from 'node:test'
import assert from 'node:assert'
import { abortRebase, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('abortRebase', async (t) => {
  await t.test('ok:remove-rebase-directory', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/git-rebase-todo`, 'pick abc123 test\n', 'utf8')

    await abortRebase({ fs, gitdir })

    const exists = await fs.exists(rebaseDir)
    assert.strictEqual(exists, false)
  })

  await t.test('edge:directory-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    // Should not throw
    await abortRebase({ fs, gitdir })
  })
})

