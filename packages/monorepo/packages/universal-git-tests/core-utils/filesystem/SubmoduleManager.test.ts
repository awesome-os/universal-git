import { test } from 'node:test'
import assert from 'node:assert'
import {
  parseGitmodules,
  getSubmoduleByPath,
  getSubmoduleByName,
  isSubmodule,
  getSubmoduleGitdir,
  initSubmodule,
  updateSubmodule,
  updateSubmoduleUrl,
} from '@awesome-os/universal-git-src/core-utils/filesystem/SubmoduleManager.ts'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('SubmoduleManager', async (t) => {
  await t.test('parseGitmodules - parses .gitmodules file', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-parse')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
	branch = main

[submodule "docs"]
	path = docs
	url = https://github.com/user/docs.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Parse
    const submodules = await parseGitmodules({ fs, dir })
    
    // Assert
    assert.strictEqual(submodules.size, 2)
    assert.ok(submodules.has('lib'))
    assert.ok(submodules.has('docs'))
    
    const libInfo = submodules.get('lib')
    assert.ok(libInfo)
    assert.strictEqual(libInfo.path, 'lib')
    assert.strictEqual(libInfo.url, 'https://github.com/user/lib.git')
    assert.strictEqual(libInfo.branch, 'main')
    
    const docsInfo = submodules.get('docs')
    assert.ok(docsInfo)
    assert.strictEqual(docsInfo.path, 'docs')
    assert.strictEqual(docsInfo.url, 'https://github.com/user/docs.git')
    assert.strictEqual(docsInfo.branch, undefined)
  })

  await t.test('parseGitmodules - returns empty map when .gitmodules does not exist', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-empty')
    
    // Parse (no .gitmodules file)
    const submodules = await parseGitmodules({ fs, dir })
    
    // Assert
    assert.strictEqual(submodules.size, 0)
  })

  await t.test('parseGitmodules - handles missing path or url', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-incomplete')
    
    // Create .gitmodules file with incomplete entries
    const gitmodulesContent = `[submodule "incomplete1"]
	path = lib
	# missing url

[submodule "incomplete2"]
	url = https://github.com/user/lib.git
	# missing path

[submodule "complete"]
	path = docs
	url = https://github.com/user/docs.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Parse
    const submodules = await parseGitmodules({ fs, dir })
    
    // Assert - only complete entry should be included
    assert.strictEqual(submodules.size, 1)
    assert.ok(submodules.has('complete'))
    assert.ok(!submodules.has('incomplete1'))
    assert.ok(!submodules.has('incomplete2'))
  })

  await t.test('getSubmoduleByPath - finds submodule by path', async () => {
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

  await t.test('getSubmoduleByName - finds submodule by name', async () => {
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

  await t.test('isSubmodule - checks if path is a submodule', async () => {
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

  await t.test('isSubmodule - returns false when .gitmodules does not exist', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-check-empty')
    
    // Check path (no .gitmodules file)
    const isLib = await isSubmodule({ fs, dir, path: 'lib' })
    
    // Assert
    assert.strictEqual(isLib, false)
  })

  await t.test('getSubmoduleGitdir - returns gitdir path for submodule', () => {
    const gitdir = '/path/to/.git'
    const path = 'lib'
    
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path })
    
    // Assert
    assert.strictEqual(submoduleGitdir, '/path/to/.git/modules/lib')
  })

  await t.test('getSubmoduleGitdir - handles nested paths', () => {
    const gitdir = '/path/to/.git'
    const path = 'lib/submodule'
    
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path })
    
    // Assert
    assert.strictEqual(submoduleGitdir, '/path/to/.git/modules/lib/submodule')
  })

  await t.test('initSubmodule - initializes submodule configuration', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Initialize submodule
    await initSubmodule({ fs, dir, gitdir, name: 'lib' })
    
    // Verify URL was copied to config
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    
    // Assert
    assert.strictEqual(url, 'https://github.com/user/lib.git')
    
    // Verify directories were created
    const submoduleDir = join(dir, 'lib')
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path: 'lib' })
    assert.ok(await fs.exists(submoduleDir))
    assert.ok(await fs.exists(submoduleGitdir))
  })

  await t.test('initSubmodule - throws error for non-existent submodule', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init-error')
    
    // Try to initialize non-existent submodule
    // This will throw an error because getSubmoduleByName returns null
    await assert.rejects(
      async () => {
        await initSubmodule({ fs, dir, gitdir, name: 'nonexistent' })
      }
      // Error could be about submodule not found or config access issues
    )
  })

  await t.test('initSubmodule - does not overwrite existing config URL', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init-no-overwrite')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Set URL in config first
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    await configAccess.setConfigValue('submodule.lib.url', 'https://github.com/user/custom-lib.git', 'local')
    
    // Initialize submodule (should not overwrite existing URL)
    await initSubmodule({ fs, dir, gitdir, name: 'lib' })
    
    // Verify URL was not overwritten
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    assert.strictEqual(url, 'https://github.com/user/custom-lib.git')
  })

  await t.test('updateSubmodule - updates submodule', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-update')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Update submodule
    await updateSubmodule({ fs, dir, gitdir, name: 'lib', commitOid: 'abc123' })
    
    // Verify submodule was initialized (updateSubmodule calls initSubmodule)
    const { ConfigAccess } = await import('@awesome-os/universal-git-src/utils/configAccess.ts')
    const configAccess = new ConfigAccess(fs, gitdir)
    const url = await configAccess.getConfigValue('submodule.lib.url', 'local')
    assert.strictEqual(url, 'https://github.com/user/lib.git')
  })

  await t.test('updateSubmodule - throws error for non-existent submodule', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-update-error')
    
    // Try to update non-existent submodule
    // This should throw an error because getSubmoduleByName returns null
    await assert.rejects(
      async () => {
        await updateSubmodule({ fs, dir, gitdir, name: 'nonexistent', commitOid: 'abc123' })
      }
    )
  })

  await t.test('updateSubmoduleUrl - updates submodule URL in .gitmodules', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-update-url')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Update URL
    await updateSubmoduleUrl({ fs, dir, name: 'lib', url: 'https://github.com/user/new-lib.git' })
    
    // Verify URL was updated
    const submodules = await parseGitmodules({ fs, dir })
    const libInfo = submodules.get('lib')
    assert.ok(libInfo)
    assert.strictEqual(libInfo.url, 'https://github.com/user/new-lib.git')
  })

  await t.test('updateSubmoduleUrl - throws error when .gitmodules does not exist', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-update-url-error')
    
    // Try to update URL when .gitmodules doesn't exist
    await assert.rejects(
      async () => {
        await updateSubmoduleUrl({ fs, dir, name: 'lib', url: 'https://github.com/user/new-lib.git' })
      },
      (err: any) => {
        // Should throw an error (could be ENOENT, NOENT, or other file system error)
        return err !== undefined && err !== null
      }
    )
  })

  await t.test('parseGitmodules - handles empty .gitmodules file', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-empty-file')
    
    // Create empty .gitmodules file
    await fs.write(join(dir, '.gitmodules'), '')
    
    // Parse
    const submodules = await parseGitmodules({ fs, dir })
    
    // Assert
    assert.strictEqual(submodules.size, 0)
  })

  await t.test('parseGitmodules - handles .gitmodules with only comments', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-comments')
    
    // Create .gitmodules file with only comments
    const gitmodulesContent = `# This is a comment
# Another comment
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Parse
    const submodules = await parseGitmodules({ fs, dir })
    
    // Assert
    assert.strictEqual(submodules.size, 0)
  })

  await t.test('parseGitmodules - handles multiple submodules with same path (edge case)', async () => {
    const { fs, dir } = await makeNodeFixture('test-submodule-duplicate-path')
    
    // Create .gitmodules file with duplicate paths (should use last one)
    const gitmodulesContent = `[submodule "lib1"]
	path = lib
	url = https://github.com/user/lib1.git

[submodule "lib2"]
	path = lib
	url = https://github.com/user/lib2.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Parse
    const submodules = await parseGitmodules({ fs, dir })
    
    // Assert - both should be parsed, but getSubmoduleByPath will return the last one
    assert.strictEqual(submodules.size, 2)
    const byPath = await getSubmoduleByPath({ fs, dir, path: 'lib' })
    // Should return one of them (implementation dependent)
    assert.ok(byPath !== null)
  })

  await t.test('getSubmoduleByPath - handles nested paths', async () => {
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

  await t.test('initSubmodule - creates directories if they do not exist', async () => {
    const { fs, dir, gitdir } = await makeNodeFixture('test-submodule-init-dirs')
    
    // Create .gitmodules file
    const gitmodulesContent = `[submodule "lib"]
	path = lib
	url = https://github.com/user/lib.git
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Initialize submodule (directories don't exist yet)
    await initSubmodule({ fs, dir, gitdir, name: 'lib' })
    
    // Verify directories were created
    const submoduleDir = join(dir, 'lib')
    const submoduleGitdir = getSubmoduleGitdir({ gitdir, path: 'lib' })
    assert.ok(await fs.exists(submoduleDir))
    assert.ok(await fs.exists(submoduleGitdir))
  })
})

