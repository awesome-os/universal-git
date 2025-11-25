import { test } from 'node:test'
import assert from 'node:assert'
import { readRebaseHead, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('readRebaseHead', async (t) => {
  await t.test('edge:file-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await readRebaseHead({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-head-name', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    await fs.write(`${rebaseDir}/head-name`, 'refs/heads/main\n', 'utf8')

    const result = await readRebaseHead({ fs, gitdir })
    assert.strictEqual(result, 'refs/heads/main')
  })
})

