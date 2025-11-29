import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'

test('initSubmodule', async (t) => {
  await t.test('ok:initializes-submodule-configuration', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-init', { init: true })
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Initialize submodule
    await repo.gitBackend.initSubmodule(repo.worktreeBackend, 'lib')
    
    // Verify URL was copied to config
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    
    // Assert
    assert.strictEqual(url, 'https://github.com/user/lib.git')
    
    // Verify directories were created
    const submoduleDir = join(dir, 'lib')
    const submoduleGitdir = await repo.gitBackend.getSubmoduleGitdir('lib')
    assert.ok(await fs.exists(submoduleDir))
    assert.ok(await fs.exists(submoduleGitdir))
  })

  await t.test('ok:throws-error-for-non-existent-submodule', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-init-error', { init: true })
    // Try to initialize non-existent submodule
    // This will throw an error because getSubmoduleByName returns null
    await assert.rejects(
      async () => {
        await repo.gitBackend.initSubmodule(repo.worktreeBackend, 'nonexistent')
      }
      // Error could be about submodule not found or config access issues
    )
  })

  await t.test('ok:does-not-overwrite-existing-config-URL', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-init-no-overwrite', { init: true })
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
    
    // Force reload of config in backend to ensure it sees the changes
    await repo.gitBackend.reloadConfig()

    // Initialize submodule (should not overwrite existing URL)
    await repo.gitBackend.initSubmodule(repo.worktreeBackend, 'lib')
    
    // Verify URL was not overwritten
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    assert.strictEqual(url, 'https://github.com/user/custom-lib.git')
  })

  await t.test('ok:creates-directories-if-they-do-not-exist', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-init-dirs', { init: true })
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Initialize submodule (directories don't exist yet)
    await repo.gitBackend.initSubmodule(repo.worktreeBackend, 'lib')
    
    // Verify directories were created
    const submoduleDir = join(dir, 'lib')
    const submoduleGitdir = await repo.gitBackend.getSubmoduleGitdir('lib')
    assert.ok(await fs.exists(submoduleDir))
    assert.ok(await fs.exists(submoduleGitdir))
  })
})

