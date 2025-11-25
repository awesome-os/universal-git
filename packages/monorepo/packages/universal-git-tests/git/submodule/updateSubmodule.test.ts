import { test } from 'node:test'
import assert from 'node:assert'
import { updateSubmodule } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('updateSubmodule', async (t) => {
  await t.test('ok:updates-submodule', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-update')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Update submodule
    await updateSubmodule({ fs, dir, gitdir, name: 'lib', commitOid: 'abc123' })
    
    // Verify submodule was initialized (updateSubmodule calls initSubmodule)
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    assert.strictEqual(url, 'https://github.com/user/lib.git')
  })

  await t.test('ok:throws-error-for-non-existent-submodule', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-update-error')
    
    // Try to update non-existent submodule
    // This should throw an error because getSubmoduleByName returns null
    await assert.rejects(
      async () => {
        await updateSubmodule({ fs, dir, gitdir, name: 'nonexistent', commitOid: 'abc123' })
      }
    )
  })
})

