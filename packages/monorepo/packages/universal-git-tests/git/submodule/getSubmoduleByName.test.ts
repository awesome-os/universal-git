import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'

test('getSubmoduleByName', async (t) => {
  await t.test('ok:finds-submodule-by-name', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-by-name', { init: true })
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git

[submodule "docs"]
	path = docs
	url = https://github.com/user/docs.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Get by name
    const libSubmodule = await repo.gitBackend.getSubmoduleByName(repo.worktreeBackend, 'lib')
    const docsSubmodule = await repo.gitBackend.getSubmoduleByName(repo.worktreeBackend, 'docs')
    const missingSubmodule = await repo.gitBackend.getSubmoduleByName(repo.worktreeBackend, 'nonexistent')
    
    // Assert
    assert.ok(libSubmodule)
    assert.strictEqual(libSubmodule.name, 'lib')
    assert.strictEqual(libSubmodule.path, 'lib')
    assert.strictEqual(libSubmodule.url, 'https://github.com/user/lib.git')
    
    assert.ok(docsSubmodule)
    assert.strictEqual(docsSubmodule.name, 'docs')
    assert.strictEqual(docsSubmodule.path, 'docs')
    
    assert.strictEqual(missingSubmodule, null)
  })
})

