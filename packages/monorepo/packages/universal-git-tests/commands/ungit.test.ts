import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import { ungit, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

test('ungit command', async (t) => {
  await t.test('basic ungit - full checkout', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository using native git CLI
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-source')
    
    // Initialize repository with native git
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Create initial commit
    await sourceFs.write(join(sourceDir, 'README.md'), '# Test Repository\n')
    await sourceFs.write(join(sourceDir, 'file1.txt'), 'Content 1\n')
    await sourceFs.write(join(sourceDir, 'file2.txt'), 'Content 2\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Initial commit"', { cwd: sourceDir })
    
    // Now use ungit to extract files
    const { fs, dir } = await makeFixture('test-ungit-basic')
    
    await ungit({
      fs,
      http,
      dir,
      url: sourceDir,
      ref: 'HEAD',
    })
    
    // Verify files were extracted
    assert.strictEqual(await fs.exists(join(dir, 'README.md')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file1.txt')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file2.txt')), true)
    
    // Verify file contents
    const readme = await fs.read(join(dir, 'README.md'), 'utf8')
    assert.strictEqual(readme, '# Test Repository\n')
    
    const file1 = await fs.read(join(dir, 'file1.txt'), 'utf8')
    assert.strictEqual(file1, 'Content 1\n')
    
    // Verify NO .git directory exists
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
  })

  await t.test('ungit with sparse checkout - single path', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository with nested structure
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-sparse-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Create directory structure
    await sourceFs.write(join(sourceDir, 'README.md'), '# Test\n')
    await sourceFs.write(join(sourceDir, 'src', 'app.js'), 'console.log("app");\n')
    await sourceFs.write(join(sourceDir, 'src', 'utils.js'), 'console.log("utils");\n')
    await sourceFs.write(join(sourceDir, 'docs', 'guide.md'), '# Guide\n')
    await sourceFs.write(join(sourceDir, 'tests', 'test.js'), 'test();\n')
    
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Initial"', { cwd: sourceDir })
    
    // Use ungit with sparse checkout
    const { fs, dir } = await makeFixture('test-ungit-sparse-single')
    
    await ungit({
      fs,
      http,
      dir,
      url: sourceDir,
      ref: 'HEAD',
      sparsePath: 'src',
      cone: true,
    })
    
    // Verify only src directory was extracted
    assert.strictEqual(await fs.exists(join(dir, 'src')), true)
    assert.strictEqual(await fs.exists(join(dir, 'src', 'app.js')), true)
    assert.strictEqual(await fs.exists(join(dir, 'src', 'utils.js')), true)
    
    // Verify other directories were NOT extracted
    assert.strictEqual(await fs.exists(join(dir, 'README.md')), false)
    assert.strictEqual(await fs.exists(join(dir, 'docs')), false)
    assert.strictEqual(await fs.exists(join(dir, 'tests')), false)
    
    // Verify NO .git directory
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
  })

  await t.test('ungit with sparse checkout - multiple paths', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-sparse-multi-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'README.md'), '# Test\n')
    await sourceFs.write(join(sourceDir, 'src', 'app.js'), 'app\n')
    await sourceFs.write(join(sourceDir, 'docs', 'guide.md'), '# Guide\n')
    await sourceFs.write(join(sourceDir, 'tests', 'test.js'), 'test\n')
    await sourceFs.write(join(sourceDir, 'other', 'file.txt'), 'other\n')
    
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Initial"', { cwd: sourceDir })
    
    // Use ungit with multiple sparse paths
    const { fs, dir } = await makeFixture('test-ungit-sparse-multi')
    
    await ungit({
      fs,
      http,
      dir,
      url: sourceDir,
      ref: 'HEAD',
      sparsePath: ['src', 'docs'],
      cone: true,
    })
    
    // Verify both directories were extracted
    assert.strictEqual(await fs.exists(join(dir, 'src')), true)
    assert.strictEqual(await fs.exists(join(dir, 'src', 'app.js')), true)
    assert.strictEqual(await fs.exists(join(dir, 'docs')), true)
    assert.strictEqual(await fs.exists(join(dir, 'docs', 'guide.md')), true)
    
    // Verify other directories were NOT extracted
    assert.strictEqual(await fs.exists(join(dir, 'README.md')), false)
    assert.strictEqual(await fs.exists(join(dir, 'tests')), false)
    assert.strictEqual(await fs.exists(join(dir, 'other')), false)
    
    // Verify NO .git directory
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
  })

  await t.test('ungit with specific branch', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository with multiple branches
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-branch-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Create main branch
    await sourceFs.write(join(sourceDir, 'file.txt'), 'main branch\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Main"', { cwd: sourceDir })
    
    // Create feature branch
    execSync('git checkout -b feature', { cwd: sourceDir })
    await sourceFs.write(join(sourceDir, 'file.txt'), 'feature branch\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Feature"', { cwd: sourceDir })
    
    // Use ungit to checkout feature branch
    const { fs, dir } = await makeFixture('test-ungit-branch')
    
    await ungit({
      fs,
      http,
      dir,
      url: sourceDir,
      ref: 'feature',
    })
    
    // Verify feature branch content
    const content = await fs.read(join(dir, 'file.txt'), 'utf8')
    assert.strictEqual(content, 'feature branch\n')
    
    // Verify NO .git directory
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
  })

  await t.test('ungit with shallow clone', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository with multiple commits
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-shallow-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'file1.txt'), 'Commit 1\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Commit 1"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'file2.txt'), 'Commit 2\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Commit 2"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'file3.txt'), 'Commit 3\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Commit 3"', { cwd: sourceDir })
    
    // Use ungit with shallow clone
    const { fs, dir } = await makeFixture('test-ungit-shallow')
    
    await ungit({
      fs,
      http,
      dir,
      url: sourceDir,
      ref: 'HEAD',
      depth: 1,
      singleBranch: true,
    })
    
    // Verify files from latest commit are present
    assert.strictEqual(await fs.exists(join(dir, 'file1.txt')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file2.txt')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file3.txt')), true)
    
    // Verify NO .git directory
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
  })

  await t.test('ungit cleans up temporary directory on error', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-cleanup-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'file.txt'), 'test\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Initial"', { cwd: sourceDir })
    
    // Try ungit with invalid ref (should fail)
    const { fs, dir } = await makeFixture('test-ungit-cleanup')
    
    try {
      await ungit({
        fs,
        http,
        dir,
        url: sourceDir,
        ref: 'nonexistent-branch',
      })
      assert.fail('Should have thrown an error')
    } catch (err) {
      // Expected error
      assert.ok(err instanceof Error)
    }
    
    // Verify target directory doesn't have .git or .ungit-tmp
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
    assert.strictEqual(await fs.exists(join(dir, '.ungit-tmp')), false)
  })

  await t.test('ungit with progress callback', async () => {
    Repository.clearInstanceCache()
    
    // Create a source repository
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-ungit-progress-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'file1.txt'), 'Content 1\n')
    await sourceFs.write(join(sourceDir, 'file2.txt'), 'Content 2\n')
    execSync('git add .', { cwd: sourceDir })
    execSync('git commit -m "Initial"', { cwd: sourceDir })
    
    // Use ungit with progress callback
    const { fs, dir } = await makeFixture('test-ungit-progress')
    const progressEvents: Array<{ phase: string; loaded: number; total?: number }> = []
    
    await ungit({
      fs,
      http,
      dir,
      url: sourceDir,
      ref: 'HEAD',
      onProgress: (event) => {
        progressEvents.push(event)
      },
    })
    
    // Verify progress events were called
    assert.ok(progressEvents.length > 0, 'Progress events should be called')
    
    // Verify files were extracted
    assert.strictEqual(await fs.exists(join(dir, 'file1.txt')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file2.txt')), true)
    
    // Verify NO .git directory
    assert.strictEqual(await fs.exists(join(dir, '.git')), false)
  })
})

