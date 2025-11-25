import { test } from 'node:test'
import assert from 'node:assert'
import { getSubmoduleGitdir } from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'

test('getSubmoduleGitdir', async (t) => {
  await t.test('ok:returns-gitdir-path-for-submodule', () => {
    const gitdir = '/path/to/.git'
    const path = 'lib'
    
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path })
    
    // Assert
    assert.strictEqual(submoduleGitdir, '/path/to/.git/modules/lib')
  })

  await t.test('ok:handles-nested-paths', () => {
    const gitdir = '/path/to/.git'
    const path = 'lib/submodule'
    
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path })
    
    // Assert
    assert.strictEqual(submoduleGitdir, '/path/to/.git/modules/lib/submodule')
  })
})

