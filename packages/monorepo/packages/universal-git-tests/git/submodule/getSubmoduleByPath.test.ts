import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'

test('getSubmoduleByPath', async (t) => {
  await t.test('ok:finds-submodule-by-path', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-by-path', { init: true })
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git

[submodule "docs"]
	path = docs
	url = https://github.com/user/docs.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Get by path
    const libSubmodule = await repo.gitBackend.getSubmoduleByPath(repo.worktreeBackend, 'lib')
    const docsSubmodule = await repo.gitBackend.getSubmoduleByPath(repo.worktreeBackend, 'docs')
    const missingSubmodule = await repo.gitBackend.getSubmoduleByPath(repo.worktreeBackend, 'nonexistent')
    
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

  await t.test('ok:handles-nested-paths', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-submodule-nested', { init: true })
    // Create .gitmodules file with nested path
    const gitmodulesContent = `[submodule "nested"]
	path = lib/submodule
	url = https://github.com/user/nested.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Get by exact path
    const nested = await repo.gitBackend.getSubmoduleByPath(repo.worktreeBackend, 'lib/submodule')
    const notNested = await repo.gitBackend.getSubmoduleByPath(repo.worktreeBackend, 'lib')
    
    // Assert
    assert.ok(nested)
    assert.strictEqual(nested.path, 'lib/submodule')
    assert.strictEqual(notNested, null)
  })
})

