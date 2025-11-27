import { test } from 'node:test'
import assert from 'node:assert'
import { isSubmodule } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/core-utils/GitPath.ts'

test('isSubmodule', async (t) => {
  await t.test('ok:checks-if-path-is-a-submodule', async () => {
    const { repo } = await makeFixture('test-submodule-check', { init: true })
    const dir = (await repo.getDir())!
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await repo.fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Check paths
    const isLib = await isSubmodule({ fs: repo.fs, dir, path: 'lib' })
    const isDocs = await isSubmodule({ fs: repo.fs, dir, path: 'docs' })
    const isNested = await isSubmodule({ fs: repo.fs, dir, path: 'lib/subdir' })
    
    // Assert
    assert.strictEqual(isLib, true)
    assert.strictEqual(isDocs, false)
    assert.strictEqual(isNested, false) // Only exact path matches
  })

  await t.test('ok:returns-false-when-.gitmodules-does-not-exist', async () => {
    const { repo } = await makeFixture('test-submodule-check-empty', { init: true })
    const dir = (await repo.getDir())!
    
    // Check path (no .gitmodules file)
    const isLib = await isSubmodule({ fs: repo.fs, dir, path: 'lib' })
    
    // Assert
    assert.strictEqual(isLib, false)
  })
})

