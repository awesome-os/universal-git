import { test } from 'node:test'
import assert from 'node:assert'
import { getSubmoduleByPath, parseGitmodules } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('getSubmoduleByPath', async (t) => {
  await t.test('ok:finds-submodule-by-path', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-by-path')
    
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
    const libSubmodule = await getSubmoduleByPath({ fs, dir, path: 'lib' })
    const docsSubmodule = await getSubmoduleByPath({ fs, dir, path: 'docs' })
    const missingSubmodule = await getSubmoduleByPath({ fs, dir, path: 'nonexistent' })
    
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
    const { fs, dir } = await makeNodeFixture('test-submodule-nested')
    
    // Create .gitmodules file with nested path
    const gitmodulesContent = `[submodule "nested"]
	path = lib/submodule
	url = https://github.com/user/nested.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Get by exact path
    const nested = await getSubmoduleByPath({ fs, dir, path: 'lib/submodule' })
    const notNested = await getSubmoduleByPath({ fs, dir, path: 'lib' })
    
    // Assert
    assert.ok(nested)
    assert.strictEqual(nested.path, 'lib/submodule')
    assert.strictEqual(notNested, null)
  })
})

