import { test } from 'node:test'
import assert from 'node:assert'
import { readRebaseOnto, getSequencerDir } from '@awesome-os/universal-git-src/core-utils/algorithms/SequencerManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('readRebaseOnto', async (t) => {
  await t.test('edge:file-does-not-exist', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const result = await readRebaseOnto({ fs, gitdir })
    assert.strictEqual(result, null)
  })

  await t.test('ok:read-onto-OID', async () => {
    const { fs, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir: gitdir.replace('/.git', '') })

    const rebaseDir = getSequencerDir(gitdir, 'rebase')
    await fs.mkdir(rebaseDir)
    const ontoOid = 'a'.repeat(40)
    await fs.write(`${rebaseDir}/onto`, `${ontoOid}\n`, 'utf8')

    const result = await readRebaseOnto({ fs, gitdir })
    assert.strictEqual(result, ontoOid)
  })
})

