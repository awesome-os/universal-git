import { test } from 'node:test'
import assert from 'node:assert'
import { GitBackendFs } from '@awesome-os/universal-git-src/backends/GitBackendFs/GitBackendFs.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'

test('getSubmoduleGitdir', async (t) => {
  await t.test('ok:returns-gitdir-path-for-submodule', async () => {
    const gitdir = '/path/to/.git'
    const path = 'lib'
    
    // Create a mock GitBackendFs since we need to test the method on it
    // We don't need a real FS for this test as it just does path manipulation
    const fs = createFileSystem({} as any)
    const backend = new GitBackendFs(fs, gitdir)
    
    const submoduleGitdir = await backend.getSubmoduleGitdir(path)
    
    // Assert
    // Note: On Windows, paths will use backslashes, so we need to normalize or expect the OS-specific path
    // The backend uses join from GitPath.ts which should handle this
    const expected = gitdir + '/modules/lib'
    // Normalize both to forward slashes for comparison if needed, but let's try direct first
    // If running on Windows, join might produce backslashes
    
    // Let's use string includes or normalization to be safe
    assert.ok(submoduleGitdir.endsWith('modules/lib') || submoduleGitdir.endsWith('modules\\lib'))
  })

  await t.test('ok:handles-nested-paths', async () => {
    const gitdir = '/path/to/.git'
    const path = 'lib/submodule'
    
    const fs = createFileSystem({} as any)
    const backend = new GitBackendFs(fs, gitdir)
    
    const submoduleGitdir = await backend.getSubmoduleGitdir(path)
    
    // Assert
    assert.ok(submoduleGitdir.endsWith('modules/lib/submodule') || submoduleGitdir.endsWith('modules\\lib\\submodule'))
  })
})

