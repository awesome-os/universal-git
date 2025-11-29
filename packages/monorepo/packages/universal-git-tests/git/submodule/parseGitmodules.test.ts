import { test } from 'node:test'
import assert from 'node:assert'
import { makeNodeFixture } from '../../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('parseGitmodules', async (t) => {
  await t.test('ok:parses-.gitmodules-file', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-parse')
    
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
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    
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

  await t.test('ok:returns-empty-map-when-.gitmodules-does-not-exist', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-empty')
    
    // Parse (no .gitmodules file)
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    
    // Assert
    assert.strictEqual(submodules.size, 0)
  })

  await t.test('ok:handles-missing-path-or-url', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-incomplete')
    
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
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    
    // Assert - only complete entry should be included
    assert.strictEqual(submodules.size, 1)
    assert.ok(submodules.has('complete'))
    assert.ok(!submodules.has('incomplete1'))
    assert.ok(!submodules.has('incomplete2'))
  })

  await t.test('ok:handles-empty-.gitmodules-file', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-empty-file')
    
    // Create empty .gitmodules file
    await fs.write(join(dir, '.gitmodules'), '')
    
    // Parse
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    
    // Assert
    assert.strictEqual(submodules.size, 0)
  })

  await t.test('ok:handles-.gitmodules-with-only-comments', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-comments')
    
    // Create .gitmodules file with only comments
    const gitmodulesContent = `# This is a comment
# Another comment
`
    await fs.write(join(dir, '.gitmodules'), gitmodulesContent)
    
    // Parse
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    
    // Assert
    assert.strictEqual(submodules.size, 0)
  })

  await t.test('ok:handles-multiple-submodules-with-same-path', async () => {
    const { repo, fs, dir } = await makeNodeFixture('test-submodule-duplicate-path')
    
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
    const submodules = await repo.gitBackend.parseGitmodules(repo.worktreeBackend)
    
    // Assert - both should be parsed, but getSubmoduleByPath will return the last one
    assert.strictEqual(submodules.size, 2)
  })
})

