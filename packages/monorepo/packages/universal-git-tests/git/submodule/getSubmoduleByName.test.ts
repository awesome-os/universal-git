import { test } from 'node:test'
import assert from 'node:assert'
import { getSubmoduleByName } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('getSubmoduleByName', async (t) => {
  await t.test('ok:finds-submodule-by-name', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-by-name')
    
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
    const libSubmodule = await getSubmoduleByName({ fs, dir, name: 'lib' })
    const docsSubmodule = await getSubmoduleByName({ fs, dir, name: 'docs' })
    const missingSubmodule = await getSubmoduleByName({ fs, dir, name: 'nonexistent' })
    
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

