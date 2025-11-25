import { test } from 'node:test'
import assert from 'node:assert'
import { isSubmodule } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('isSubmodule', async (t) => {
  await t.test('ok:checks-if-path-is-a-submodule', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-check')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Check paths
    const isLib = await isSubmodule({ fs, dir, path: 'lib' })
    const isDocs = await isSubmodule({ fs, dir, path: 'docs' })
    const isNested = await isSubmodule({ fs, dir, path: 'lib/subdir' })
    
    // Assert
    assert.strictEqual(isLib, true)
    assert.strictEqual(isDocs, false)
    assert.strictEqual(isNested, false) // Only exact path matches
  })

  await t.test('ok:returns-false-when-.gitmodules-does-not-exist', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-check-empty')
    
    // Check path (no .gitmodules file)
    const isLib = await isSubmodule({ fs, dir, path: 'lib' })
    
    // Assert
    assert.strictEqual(isLib, false)
  })
})

