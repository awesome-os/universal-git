import { test } from 'node:test'
import assert from 'node:assert'
import { bundle, verifyBundle, unbundle, add, commit, branch, tag, readObject, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import { readRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import * as os from 'os'
import * as path from 'path'
import { promises as nodeFs } from 'fs'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { createBackend } from '@awesome-os/universal-git-src/backends/index.ts'
import { createGitWorktreeBackend } from '@awesome-os/universal-git-src/git/worktree/index.ts'

test('bundle', async (t) => {
  await t.test('creates bundle with specific refs', async () => {
    const { repo } = await makeFixture('test-bundle', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    
    // Create some commits and branches
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ repo, filepath: 'file1.txt' })
    const commit1 = await commit({
      repo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ repo, ref: 'feature', checkout: true })
    await nodeFs.writeFile(join(dir, 'file2.txt'), 'content2')
    await add({ repo, filepath: 'file2.txt' })
    const commit2 = await commit({
      repo,
      message: 'Second commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a tag (lightweight tag)
    await tag({
      repo,
      ref: 'v1.0.0',
      object: commit1,
      force: true,
    })
    
    // Create bundle with specific refs
    const bundlePath = join(os.tmpdir(), `bundle-test-${Date.now()}.bundle`)
    try {
      const result = await bundle({
        repo,
        filepath: bundlePath,
        refs: ['refs/heads/master', 'refs/tags/v1.0.0'],
      })
      
      assert.ok(result, 'Bundle result should be present')
      assert.strictEqual(result.filepath, bundlePath, 'Bundle path should match')
      assert.strictEqual(result.refs.size, 2, 'Should have 2 refs')
      assert.ok(result.refs.has('refs/heads/master'), 'Should include master branch')
      assert.ok(result.refs.has('refs/tags/v1.0.0'), 'Should include v1.0.0 tag')
      assert.ok(result.objectCount > 0, 'Should have objects')
      
      // Verify bundle file exists
      const exists = await repo.fs.exists(bundlePath)
      assert.strictEqual(exists, true, 'Bundle file should exist')
      
      // Verify bundle file is not empty
      const bundleData = await repo.fs.read(bundlePath)
      assert.ok(bundleData, 'Bundle file should have content')
      assert.ok(UniversalBuffer.isBuffer(bundleData) ? bundleData.length > 0 : (bundleData as string).length > 0, 'Bundle file should not be empty')
    } finally {
      // Cleanup
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('creates bundle with all refs', async () => {
    const { repo } = await makeFixture('test-bundle', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    
    // Create commits and branches
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ repo, filepath: 'file1.txt' })
    await commit({
      repo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ repo, ref: 'feature', checkout: false })
    await tag({
      repo,
      ref: 'v1.0.0',
      object: 'refs/heads/master',
    })
    
    // Create bundle with all refs
    const bundlePath = join(os.tmpdir(), `bundle-all-${Date.now()}.bundle`)
    try {
      const result = await bundle({
        repo,
        filepath: bundlePath,
        all: true,
      })
      
      assert.ok(result, 'Bundle result should be present')
      assert.ok(result.refs.size >= 2, 'Should have at least 2 refs (master and feature)')
      assert.ok(result.objectCount > 0, 'Should have objects')
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('creates bundle with default HEAD', async () => {
    const { repo } = await makeFixture('test-bundle', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    
    // Create a commit
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ repo, filepath: 'file1.txt' })
    const commitOid = await commit({
      repo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle without specifying refs (should use HEAD)
    const bundlePath = join(os.tmpdir(), `bundle-head-${Date.now()}.bundle`)
    try {
      const result = await bundle({
        repo,
        filepath: bundlePath,
      })
      
      assert.ok(result, 'Bundle result should be present')
      assert.ok(result.refs.size >= 1, 'Should have at least 1 ref')
      assert.ok(result.objectCount > 0, 'Should have objects')
      
      // Verify the HEAD ref is included
      const headRef = await repo.gitBackend!.readRef('HEAD')
      if (headRef && !headRef.startsWith('ref: ')) {
        // Detached HEAD
        assert.ok(result.refs.has('HEAD') || result.refs.has(headRef), 'Should include HEAD')
      } else if (headRef && headRef.startsWith('ref: ')) {
        // Symbolic HEAD
        const branchRef = headRef.slice(5)
        assert.ok(result.refs.has(branchRef), `Should include ${branchRef}`)
      }
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('throws error when no refs found', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    
    const bundlePath = join(os.tmpdir(), `bundle-empty-${Date.now()}.bundle`)
    try {
      await assert.rejects(
        async () => {
          await bundle({
            repo,
            filepath: bundlePath,
            refs: ['refs/heads/nonexistent'],
          })
        },
        {
          message: /Ref not found/,
        }
      )
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
})

test('verifyBundle', async (t) => {
  await t.test('verifies valid bundle', async () => {
    const { repo } = await makeFixture('test-bundle', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    
    // Create a commit
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ repo, filepath: 'file1.txt' })
    await commit({
      repo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-verify-${Date.now()}.bundle`)
    try {
      await bundle({
        repo,
        filepath: bundlePath,
      })
      
      // Verify bundle
      const result = await verifyBundle({
        fs: repo.fs,
        filepath: bundlePath,
      })
      
      assert.strictEqual(result.valid, true, 'Bundle should be valid')
      assert.ok(result.version === 2 || result.version === 3, 'Should have valid version')
      assert.ok(result.refs.length > 0, 'Should have refs')
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('rejects invalid bundle format', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    
    // Create invalid bundle file
    const bundlePath = join(os.tmpdir(), `bundle-invalid-${Date.now()}.bundle`)
    try {
      await nodeFs.writeFile(bundlePath, 'invalid bundle content')
      
      const result = await verifyBundle({
        fs: repo.fs,
        filepath: bundlePath,
      })
      
      assert.strictEqual(result.valid, false, 'Bundle should be invalid')
      assert.ok(result.error, 'Should have error message')
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('rejects non-existent bundle file', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    
    const bundlePath = join(os.tmpdir(), `bundle-nonexistent-${Date.now()}.bundle`)
    
    const result = await verifyBundle({
      fs: repo.fs,
      filepath: bundlePath,
    })
    
    assert.strictEqual(result.valid, false, 'Bundle should be invalid')
    assert.ok(result.error, 'Should have error message')
  })
})

test('unbundle', async (t) => {
  await t.test('unbundles bundle into repository', async () => {
    const { repo: sourceRepo } = await makeFixture('test-bundle', { init: true })
    const sourceDir = (await sourceRepo.getDir())!
    const sourceGitdir = await sourceRepo.getGitdir()
    
    // Create commits and branches in source repo
    await nodeFs.writeFile(join(sourceDir, 'file1.txt'), 'content1')
    await add({ repo: sourceRepo, filepath: 'file1.txt' })
    const commit1 = await commit({
      repo: sourceRepo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ repo: sourceRepo, ref: 'feature', checkout: true })
    await nodeFs.writeFile(join(sourceDir, 'file2.txt'), 'content2')
    await add({ repo: sourceRepo, filepath: 'file2.txt' })
    const commit2 = await commit({
      repo: sourceRepo,
      message: 'Second commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a tag (lightweight tag)
    await tag({
      repo: sourceRepo,
      ref: 'v1.0.0',
      object: commit1,
      force: true,
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-unbundle-${Date.now()}.bundle`)
    try {
      await bundle({
        repo: sourceRepo,
        filepath: bundlePath,
        refs: ['refs/heads/master', 'refs/heads/feature', 'refs/tags/v1.0.0'],
      })
      
      // Create destination repository
      const destDir = join(os.tmpdir(), `unbundle-dest-${Date.now()}`)
      await nodeFs.mkdir(destDir, { recursive: true })
      try {
        const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
        const destRepo = await Repository.open({
          fs: sourceRepo.fs,
          dir: destDir,
          init: true,
          cache: {},
          autoDetectConfig: true,
        })
        const destGitdir = await destRepo.getGitdir()
        
        // Create backends for destination repo
        const destGitBackend = createBackend({
          type: 'filesystem',
          fs: sourceRepo.fs,
          gitdir: destGitdir,
        })
        const destWorktree = createGitWorktreeBackend({
          fs: sourceRepo.fs,
          dir: destDir,
        })
        
        // Unbundle into destination
        const result = await unbundle({
          gitBackend: destGitBackend,
          worktree: destWorktree,
          filepath: bundlePath,
        })
        
        assert.ok(result, 'Unbundle result should be present')
        assert.ok(result.imported.size > 0, 'Should have imported refs')
        assert.strictEqual(result.imported.size, 3, 'Should have imported 3 refs')
        assert.ok(result.imported.has('refs/heads/master'), 'Should have imported master')
        assert.ok(result.imported.has('refs/heads/feature'), 'Should have imported feature')
        assert.ok(result.imported.has('refs/tags/v1.0.0'), 'Should have imported tag')
        
        // Verify refs were imported correctly
        const masterOid = await destRepo.gitBackend!.readRef('refs/heads/master')
        const featureOid = await destRepo.gitBackend!.readRef('refs/heads/feature')
        const tagOid = await destRepo.gitBackend!.readRef('refs/tags/v1.0.0')
        
        assert.ok(masterOid, 'Master ref should exist')
        assert.ok(featureOid, 'Feature ref should exist')
        assert.ok(tagOid, 'Tag ref should exist')
        
        // Verify objects are accessible
        const masterCommit = await destRepo.gitBackend!.readObject(masterOid!)
        assert.ok(masterCommit, 'Master commit should be readable')
        
        const featureCommit = await destRepo.gitBackend!.readObject(featureOid!)
        assert.ok(featureCommit, 'Feature commit should be readable')
      } finally {
        // Cleanup destination
        try {
          await nodeFs.rm(destDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    } finally {
      // Cleanup bundle
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('unbundles specific refs only', async () => {
    const { repo: sourceRepo } = await makeFixture('test-bundle', { init: true })
    const sourceDir = (await sourceRepo.getDir())!
    const sourceGitdir = await sourceRepo.getGitdir()
    
    // Create commits
    await nodeFs.writeFile(join(sourceDir, 'file1.txt'), 'content1')
    await add({ repo: sourceRepo, filepath: 'file1.txt' })
    await commit({
      repo: sourceRepo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ repo: sourceRepo, ref: 'feature', checkout: false })
    
    // Create bundle with multiple refs
    const bundlePath = join(os.tmpdir(), `bundle-specific-${Date.now()}.bundle`)
    try {
      await bundle({
        repo: sourceRepo,
        filepath: bundlePath,
        refs: ['refs/heads/master', 'refs/heads/feature'],
      })
      
      // Create destination repository
      const destDir = join(os.tmpdir(), `unbundle-specific-${Date.now()}`)
      await nodeFs.mkdir(destDir, { recursive: true })
      try {
        const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
        const destRepo = await Repository.open({
          fs: sourceRepo.fs,
          dir: destDir,
          init: true,
          cache: {},
          autoDetectConfig: true,
        })
        const destGitdir = await destRepo.getGitdir()
        
        // Create backends for destination repo
        const destGitBackend = createBackend({
          type: 'filesystem',
          fs: sourceRepo.fs,
          gitdir: destGitdir,
        })
        const destWorktree = createGitWorktreeBackend({
          fs: sourceRepo.fs,
          dir: destDir,
        })
        
        // Unbundle only master
        const result = await unbundle({
          gitBackend: destGitBackend,
          worktree: destWorktree,
          filepath: bundlePath,
          refs: ['refs/heads/master'],
        })
        
        assert.ok(result, 'Unbundle result should be present')
        assert.strictEqual(result.imported.size, 1, 'Should have imported 1 ref')
        assert.ok(result.imported.has('refs/heads/master'), 'Should have imported master')
        assert.ok(!result.imported.has('refs/heads/feature'), 'Should not have imported feature')
      } finally {
        try {
          await nodeFs.rm(destDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('rejects refs that already exist with different OID', async () => {
    const { repo: sourceRepo } = await makeFixture('test-bundle', { init: true })
    const sourceDir = (await sourceRepo.getDir())!
    const sourceGitdir = await sourceRepo.getGitdir()
    
    // Create commit in source
    await nodeFs.writeFile(join(sourceDir, 'file1.txt'), 'content1')
    await add({ repo: sourceRepo, filepath: 'file1.txt' })
    const commit1 = await commit({
      repo: sourceRepo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-conflict-${Date.now()}.bundle`)
    try {
      await bundle({
        repo: sourceRepo,
        filepath: bundlePath,
        refs: ['refs/heads/master'],
      })
      
      // Create destination repository with different commit
      const destDir = join(os.tmpdir(), `unbundle-conflict-${Date.now()}`)
      await nodeFs.mkdir(destDir, { recursive: true })
      try {
        const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
        const destRepo = await Repository.open({
          fs: sourceRepo.fs,
          dir: destDir,
          init: true,
          cache: {},
          autoDetectConfig: true,
        })
        const destGitdir = await destRepo.getGitdir()
        
        await nodeFs.writeFile(join(destDir, 'file2.txt'), 'different content')
        await add({ repo: destRepo, filepath: 'file2.txt' })
        await commit({
          repo: destRepo,
          message: 'Different commit',
          author: { name: 'Test', email: 'test@example.com' },
        })
        
        // Create backends for destination repo
        const destGitBackend = createBackend({
          type: 'filesystem',
          fs: sourceRepo.fs,
          gitdir: destGitdir,
        })
        const destWorktree = createGitWorktreeBackend({
          fs: sourceRepo.fs,
          dir: destDir,
        })
        
        // Try to unbundle (should reject master since it exists with different OID)
        const result = await unbundle({
          gitBackend: destGitBackend,
          worktree: destWorktree,
          filepath: bundlePath,
        })
        
        // The ref should be rejected
        assert.ok(result.rejected.size > 0 || result.imported.size === 0, 'Should reject conflicting ref')
      } finally {
        try {
          await nodeFs.rm(destDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
  
  await t.test('throws error when bundle file does not exist', async () => {
    const { repo } = await makeFixture('test-empty', { init: true })
    const gitdir = await repo.getGitdir()
    
    const bundlePath = join(os.tmpdir(), `bundle-nonexistent-${Date.now()}.bundle`)
    
    await assert.rejects(
      async () => {
        await unbundle({
          repo,
          filepath: bundlePath,
        })
      },
      {
        message: /ENOENT|not found|does not exist/i,
      }
    )
  })
})

test('bundle format parsing', async (t) => {
  await t.test('parses bundle header correctly', async () => {
    const { repo } = await makeFixture('test-bundle', { init: true })
    const dir = (await repo.getDir())!
    const gitdir = await repo.getGitdir()
    
    // Create a commit
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ repo, filepath: 'file1.txt' })
    await commit({
      repo,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-parse-${Date.now()}.bundle`)
    try {
      await bundle({
        repo,
        filepath: bundlePath,
      })
      
      // Read and parse bundle
      const bundleData = await repo.fs.read(bundlePath)
      const buffer = UniversalBuffer.isBuffer(bundleData) ? bundleData : UniversalBuffer.from(bundleData)
      
      const { parseBundleHeader, extractPackfileFromBundle } = await import('@awesome-os/universal-git-src/git/bundle/parseBundle.ts')
      const header = await parseBundleHeader(buffer)
      
      assert.ok(header.version === 2 || header.version === 3, 'Should have valid version')
      assert.ok(header.refs.length > 0, 'Should have refs')
      
      // Extract packfile
      const packfile = await extractPackfileFromBundle(buffer)
      assert.ok(packfile, 'Packfile should be extracted')
      assert.ok(packfile.length > 0, 'Packfile should not be empty')
      
      // Verify packfile starts with "PACK"
      const packfileStart = packfile.subarray(0, 4).toString('utf8')
      assert.strictEqual(packfileStart, 'PACK', 'Packfile should start with PACK')
    } finally {
      try {
        await nodeFs.unlink(bundlePath)
      } catch {
        // Ignore cleanup errors
      }
    }
  })
})

