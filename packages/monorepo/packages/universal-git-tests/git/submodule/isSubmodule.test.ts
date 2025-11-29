import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'

test('isSubmodule', async (t) => {
  await t.test('ok:checks-if-path-is-a-submodule', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-check', { init: true })
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Check paths
    const isLib = await repo.gitBackend.isSubmodule(repo.worktreeBackend, 'lib')
    const isDocs = await repo.gitBackend.isSubmodule(repo.worktreeBackend, 'docs')
    const isNested = await repo.gitBackend.isSubmodule(repo.worktreeBackend, 'lib/subdir')
    
    // Assert
    assert.strictEqual(isLib, true)
    assert.strictEqual(isDocs, false)
    assert.strictEqual(isNested, false) // Only exact path matches
  })

  await t.test('ok:returns-false-when-.gitmodules-does-not-exist', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-check-empty', { init: true })
    // Check path (no .gitmodules file)
    const isLib = await repo.gitBackend.isSubmodule(repo.worktreeBackend, 'lib')
    
    // Assert
    assert.strictEqual(isLib, false)
  })
})

