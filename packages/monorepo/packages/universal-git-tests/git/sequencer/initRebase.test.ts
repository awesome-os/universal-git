import { test } from 'node:test'
import assert from 'node:assert'
import { initRebase, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('initRebase', async (t) => {
  await t.test('ok:initialize-rebase', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const headName = 'refs/heads/feature'
    const onto = 'b'.repeat(40)
    const commands = [
      { action: 'pick', oid: 'c'.repeat(40), message: 'Commit 1' },
      { action: 'pick', oid: 'd'.repeat(40), message: 'Commit 2' },
    ]

    await initRebase({ fs, gitdir, headName, onto, commands })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    const headContent = await fs.read(`${rebaseDir}/head-name`, 'utf8') as string
    const ontoContent = await fs.read(`${rebaseDir}/onto`, 'utf8') as string
    const todoContent = await fs.read(`${rebaseDir}/git-rebase-todo`, 'utf8') as string

    assert.strictEqual(headContent.trim(), headName)
    assert.strictEqual(ontoContent.trim(), onto)
    assert.ok(todoContent.includes('Commit 1'))
    assert.ok(todoContent.includes('Commit 2'))
  })
})

