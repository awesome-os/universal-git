import { test } from 'node:test'
import assert from 'node:assert'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('updateSubmoduleUrl', async (t) => {
  await t.test('ok:updates-submodule-URL-in-.gitmodules', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-update-url')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Update URL
    await repo.gitBackend.updateSubmoduleUrl(repo.worktreeBackend, 'lib', 'https://github.com/user/new-lib.git')
    
    // Verify URL was updated
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    const libInfo = submodules.get('lib')
    assert.ok(libInfo)
    assert.strictEqual(libInfo.url, 'https://github.com/user/new-lib.git')
  })

  await t.test('ok:throws-error-when-.gitmodules-does-not-exist', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-update-url-error')
    
    // Try to update URL when .gitmodules doesn't exist
    await assert.rejects(
      async () => {
        await repo.gitBackend.updateSubmoduleUrl(repo.worktreeBackend, 'lib', 'https://github.com/user/new-lib.git')
      },
      (err: any) => {
        // Should throw an error (could be ENOENT, NOENT, or other file system error)
        return err !== undefined && err !== null
      }
    )
  })
})

