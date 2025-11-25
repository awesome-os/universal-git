import { test } from 'node:test'
import assert from 'node:assert'
import { writeRebaseTodo, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('writeRebaseTodo', async (t) => {
  await t.test('ok:write-commands', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const commands = [
      { action: 'pick', oid: 'abc123', message: 'First commit' },
      { action: 'reword', oid: 'def456', message: 'Second commit' },
    ]

    await writeRebaseTodo({ fs, gitdir, commands })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    const content = await fs.read(`${rebaseDir}/git-rebase-todo`, 'utf8') as string
    assert.ok(content.includes('pick abc123 First commit'))
    assert.ok(content.includes('reword def456 Second commit'))
  })
})

