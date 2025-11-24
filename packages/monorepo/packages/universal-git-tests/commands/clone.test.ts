import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import {
  clone,
  resolveRef,
  currentBranch,
  listBranches,
  listTags,
  readCommit,
  readBlob,
} from '@awesome-os/universal-git-src/index.ts'
import http from '@awesome-os/universal-git-src/http/node/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import { ConfigAccess } from '@awesome-os/universal-git-src/utils/configAccess.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

test('clone from file system', async (t) => {
  await t.test('ok:clone-basic-repository', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository using native git CLI
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-source')
    
    // Initialize repository with native git
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Create initial commit
    await sourceFs.write(join(sourceDir, 'README.md'), '# Test Repository\n')
    execSync('git add README.md', { cwd: sourceDir })
    execSync('git commit -m "Initial commit"', { cwd: sourceDir })
    
    // Create additional files
    await sourceFs.write(join(sourceDir, 'file1.txt'), 'Content 1\n')
    execSync('git add file1.txt', { cwd: sourceDir })
    execSync('git commit -m "Add file1"', { cwd: sourceDir })
    
    // Get the commit SHA
    const mainSha = execSync('git rev-parse HEAD', { 
      cwd: sourceDir,
      encoding: 'utf8'
    }).trim()
    
    // Now clone the local repository
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs')
    
    await clone({
      fs,
      http, // Required by function signature but not used for local clones
      dir,
      gitdir,
      url: sourceDir,
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify repository was cloned
    assert.strictEqual(await fs.exists(dir), true)
    assert.strictEqual(await fs.exists(join(gitdir, 'objects')), true)
    assert.strictEqual(await fs.exists(join(gitdir, 'config')), true)
    
    // Verify remote was added
    const configService = new ConfigAccess(fs, gitdir)
    const remoteUrl = await configService.getConfigValue('remote.origin.url')
    assert.ok(remoteUrl, 'Remote should be configured')
    
    // Verify HEAD points to the correct commit
    const head = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.strictEqual(head, mainSha, 'HEAD should point to main commit')
    
    // Verify we can read the files
    assert.strictEqual(await fs.exists(join(dir, 'README.md')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file1.txt')), true)
    
    // Verify file contents
    const readme = await fs.read(join(dir, 'README.md'), 'utf8')
    assert.strictEqual(readme, '# Test Repository\n')
    
    const file1 = await fs.read(join(dir, 'file1.txt'), 'utf8')
    assert.strictEqual(file1, 'Content 1\n')
  })

  await t.test('ok:clone-with-noCheckout', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-noCheckout-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'README.md'), '# Test\n')
    execSync('git add README.md', { cwd: sourceDir })
    execSync('git commit -m "Initial"', { cwd: sourceDir })
    
    // Clone with noCheckout
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-noCheckout')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: sourceDir,
      depth: 1,
      singleBranch: true,
      noCheckout: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify repository structure exists
    assert.strictEqual(await fs.exists(dir), true)
    assert.strictEqual(await fs.exists(join(gitdir, 'objects')), true)
    
    // Verify working directory files are NOT checked out
    assert.strictEqual(await fs.exists(join(dir, 'README.md')), false)
    
    // Verify HEAD is set
    const head = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.ok(head, 'HEAD should be set')
    assert.strictEqual(head.length, 40, 'HEAD should be a valid SHA')
  })

  await t.test('ok:clone-specific-branch', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository with multiple branches
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-branch-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Create main branch
    await sourceFs.write(join(sourceDir, 'main.txt'), 'Main content\n')
    execSync('git add main.txt', { cwd: sourceDir })
    execSync('git commit -m "Main commit"', { cwd: sourceDir })
    
    // Create feature branch
    execSync('git checkout -b feature-branch', { cwd: sourceDir })
    await sourceFs.write(join(sourceDir, 'feature.txt'), 'Feature content\n')
    execSync('git add feature.txt', { cwd: sourceDir })
    execSync('git commit -m "Feature commit"', { cwd: sourceDir })
    
    // Get feature branch SHA
    const featureSha = execSync('git rev-parse feature-branch', { 
      cwd: sourceDir,
      encoding: 'utf8'
    }).trim()
    
    // Clone the feature branch
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-branch')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: sourceDir,
      ref: 'feature-branch',
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify HEAD points to feature branch
    const head = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.strictEqual(head, featureSha, 'HEAD should point to feature-branch')
    
    // Verify current branch
    const branch = await currentBranch({ fs, gitdir })
    assert.strictEqual(branch, 'feature-branch', 'Current branch should be feature-branch')
    
    // Verify feature branch files are checked out
    assert.strictEqual(await fs.exists(join(dir, 'feature.txt')), true)
    const featureContent = await fs.read(join(dir, 'feature.txt'), 'utf8')
    assert.strictEqual(featureContent, 'Feature content\n')
    
    // Verify main branch file is also present (since we cloned the whole repo)
    assert.strictEqual(await fs.exists(join(dir, 'main.txt')), true)
  })

  await t.test('ok:clone-a-tag', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository with tags
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-tag-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'version.txt'), 'v1.0.0\n')
    execSync('git add version.txt', { cwd: sourceDir })
    execSync('git commit -m "Version 1.0.0"', { cwd: sourceDir })
    execSync('git tag v1.0.0', { cwd: sourceDir })
    
    // Get tag SHA
    const tagSha = execSync('git rev-parse v1.0.0', { 
      cwd: sourceDir,
      encoding: 'utf8'
    }).trim()
    
    // Clone the tag
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-tag')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: sourceDir,
      ref: 'v1.0.0',
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify HEAD points to tag (detached HEAD)
    const head = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.strictEqual(head, tagSha, 'HEAD should point to tag')
    
    // Verify tag exists
    const tags = await listTags({ fs, gitdir })
    assert.ok(tags.includes('v1.0.0'), 'Tag should exist')
    
    // Verify files are checked out
    assert.strictEqual(await fs.exists(join(dir, 'version.txt')), true)
    const versionContent = await fs.read(join(dir, 'version.txt'), 'utf8')
    assert.strictEqual(versionContent, 'v1.0.0\n')
  })

  await t.test('clone with file:// URL', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-fileurl-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    await sourceFs.write(join(sourceDir, 'test.txt'), 'Test content\n')
    execSync('git add test.txt', { cwd: sourceDir })
    execSync('git commit -m "Test commit"', { cwd: sourceDir })
    
    // Clone using file:// URL
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-fileurl')
    
    // Normalize path for file:// URL (handle Windows paths)
    let fileUrl = sourceDir
    if (process.platform === 'win32') {
      // Windows: C:\path -> file:///C:/path
      fileUrl = `file:///${fileUrl.replace(/\\/g, '/')}`
    } else {
      // Unix: /path -> file:///path
      fileUrl = `file://${fileUrl}`
    }
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: fileUrl,
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify clone worked
    assert.strictEqual(await fs.exists(dir), true)
    assert.strictEqual(await fs.exists(join(gitdir, 'objects')), true)
    assert.strictEqual(await fs.exists(join(dir, 'test.txt')), true)
    
    const content = await fs.read(join(dir, 'test.txt'), 'utf8')
    assert.strictEqual(content, 'Test content\n')
  })

  await t.test('ok:clone-repository-with-multiple-commits-and-verify-history', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository with multiple commits
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-history-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // First commit
    await sourceFs.write(join(sourceDir, 'file1.txt'), 'First\n')
    execSync('git add file1.txt', { cwd: sourceDir })
    execSync('git commit -m "First commit"', { cwd: sourceDir })
    const firstSha = execSync('git rev-parse HEAD', { cwd: sourceDir, encoding: 'utf8' }).trim()
    
    // Second commit
    await sourceFs.write(join(sourceDir, 'file2.txt'), 'Second\n')
    execSync('git add file2.txt', { cwd: sourceDir })
    execSync('git commit -m "Second commit"', { cwd: sourceDir })
    const secondSha = execSync('git rev-parse HEAD', { cwd: sourceDir, encoding: 'utf8' }).trim()
    
    // Third commit
    await sourceFs.write(join(sourceDir, 'file3.txt'), 'Third\n')
    execSync('git add file3.txt', { cwd: sourceDir })
    execSync('git commit -m "Third commit"', { cwd: sourceDir })
    const thirdSha = execSync('git rev-parse HEAD', { cwd: sourceDir, encoding: 'utf8' }).trim()
    
    // Clone the repository
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-history')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: sourceDir,
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify HEAD points to latest commit
    const head = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    assert.strictEqual(head, thirdSha, 'HEAD should point to latest commit')
    
    // Verify all files are present
    assert.strictEqual(await fs.exists(join(dir, 'file1.txt')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file2.txt')), true)
    assert.strictEqual(await fs.exists(join(dir, 'file3.txt')), true)
    
    // Verify we can read commits
    const commit1 = await readCommit({ fs, gitdir, oid: firstSha })
    assert.ok(commit1, 'Should be able to read first commit')
    assert.ok(commit1.commit.message.includes('First commit'), 'First commit message should match')
    
    const commit2 = await readCommit({ fs, gitdir, oid: secondSha })
    assert.ok(commit2, 'Should be able to read second commit')
    assert.ok(commit2.commit.message.includes('Second commit'), 'Second commit message should match')
    
    const commit3 = await readCommit({ fs, gitdir, oid: thirdSha })
    assert.ok(commit3, 'Should be able to read third commit')
    assert.ok(commit3.commit.message.includes('Third commit'), 'Third commit message should match')
  })

  await t.test('ok:clone-repository-with-tags-and-branches', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository with tags and branches
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-tags-branches-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Main branch with commits
    await sourceFs.write(join(sourceDir, 'main.txt'), 'Main\n')
    execSync('git add main.txt', { cwd: sourceDir })
    execSync('git commit -m "Main commit"', { cwd: sourceDir })
    execSync('git tag v1.0.0', { cwd: sourceDir })
    
    // Feature branch
    execSync('git checkout -b feature', { cwd: sourceDir })
    await sourceFs.write(join(sourceDir, 'feature.txt'), 'Feature\n')
    execSync('git add feature.txt', { cwd: sourceDir })
    execSync('git commit -m "Feature commit"', { cwd: sourceDir })
    execSync('git tag v2.0.0', { cwd: sourceDir })
    
    // Clone the repository
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-tags-branches')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: sourceDir,
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify branches exist
    const branches = await listBranches({ fs, gitdir })
    assert.ok(branches.includes('main'), 'Main branch should exist')
    assert.ok(branches.includes('feature'), 'Feature branch should exist')
    
    // Verify tags exist
    const tags = await listTags({ fs, gitdir })
    assert.ok(tags.includes('v1.0.0'), 'v1.0.0 tag should exist')
    assert.ok(tags.includes('v2.0.0'), 'v2.0.0 tag should exist')
    
    // Verify we can resolve tag refs
    const v1Ref = await resolveRef({ fs, gitdir, ref: 'refs/tags/v1.0.0' })
    assert.ok(v1Ref, 'Should be able to resolve v1.0.0 tag')
    
    const v2Ref = await resolveRef({ fs, gitdir, ref: 'refs/tags/v2.0.0' })
    assert.ok(v2Ref, 'Should be able to resolve v2.0.0 tag')
  })

  await t.test('ok:clone-repository-and-verify-objects-are-copied', async () => {
    Repository.clearInstanceCache()
    
    // Create isolated cache for this test to prevent parallel execution conflicts
    const cache: Record<string, unknown> = {}
    
    // Create a source repository
    const { fs: sourceFs, dir: sourceDir } = await makeFixture('test-clone-fs-objects-source')
    
    execSync('git init', { cwd: sourceDir })
    execSync('git config user.name "Test User"', { cwd: sourceDir })
    execSync('git config user.email "test@example.com"', { cwd: sourceDir })
    
    // Create a file with specific content
    const content = 'This is test content that will be stored as a blob object\n'
    await sourceFs.write(join(sourceDir, 'test.txt'), content)
    execSync('git add test.txt', { cwd: sourceDir })
    execSync('git commit -m "Test commit"', { cwd: sourceDir })
    
    // Get the blob SHA from source
    const blobSha = execSync('git hash-object test.txt', { 
      cwd: sourceDir,
      encoding: 'utf8'
    }).trim()
    
    // Clone the repository
    const { fs, dir, gitdir } = await makeFixture('test-clone-fs-objects')
    
    await clone({
      fs,
      http,
      dir,
      gitdir,
      url: sourceDir,
      depth: 1,
      singleBranch: true,
      cache, // Use isolated cache for this test
    })
    
    // Verify we can read the blob from the cloned repository
    const blob = await readBlob({ fs, gitdir, oid: blobSha })
    assert.ok(blob, 'Should be able to read blob from cloned repository')
    
    const blobContent = new TextDecoder().decode(blob.blob)
    assert.strictEqual(blobContent, content, 'Blob content should match')
  })
})

