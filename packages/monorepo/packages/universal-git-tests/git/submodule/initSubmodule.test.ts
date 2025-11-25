import { test } from 'node:test'
import assert from 'node:assert'
import { initSubmodule, getSubmoduleGitdir } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('initSubmodule', async (t) => {
  await t.test('ok:initializes-submodule-configuration', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Initialize submodule
    await initSubmodule({ fs, dir, gitdir, name: 'lib' })
    
    // Verify URL was copied to config
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    
    // Assert
    assert.strictEqual(url, 'https://github.com/user/lib.git')
    
    // Verify directories were created
    const submoduleDir = join(dir, 'lib')
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path: 'lib' })
    assert.ok(await fs.exists(submoduleDir))
    assert.ok(await fs.exists(submoduleGitdir))
  })

  await t.test('ok:throws-error-for-non-existent-submodule', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init-error')
    
    // Try to initialize non-existent submodule
    // This will throw an error because getSubmoduleByName returns null
    await assert.rejects(
      async () => {
        await initSubmodule({ fs, dir, gitdir, name: 'nonexistent' })
      }
      // Error could be about submodule not found or config access issues
    )
  })

  await t.test('ok:does-not-overwrite-existing-config-URL', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init-no-overwrite')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Set URL in config first
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    await configAccess.setConfigValue('submodule.lib.url', 'https://github.com/user/custom-lib.git', 'local')
    
    // Initialize submodule (should not overwrite existing URL)
    await initSubmodule({ fs, dir, gitdir, name: 'lib' })
    
    // Verify URL was not overwritten
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    assert.strictEqual(url, 'https://github.com/user/custom-lib.git')
  })

  await t.test('ok:creates-directories-if-they-do-not-exist', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init-dirs')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Initialize submodule (directories don't exist yet)
    await initSubmodule({ fs, dir, gitdir, name: 'lib' })
    
    // Verify directories were created
    const submoduleDir = join(dir, 'lib')
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path: 'lib' })
    assert.ok(await fs.exists(submoduleDir))
    assert.ok(await fs.exists(submoduleGitdir))
  })
})

