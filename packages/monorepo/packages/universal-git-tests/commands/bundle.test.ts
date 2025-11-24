import { test } from 'node:test'
import assert from 'node:assert'
import { bundle, verifyBundle, unbundle, init, add, commit, branch, tag, readObject, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import { readRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'
import * as os from 'os'
import * as path from 'path'
import { promises as nodeFs } from 'fs'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('bundle', async (t) => {
  await t.test('creates bundle with specific refs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-bundle')
    
    // Create some commits and branches
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    const commit1 = await commit({
      fs,
      dir,
      gitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ fs, dir, gitdir, ref: 'feature', checkout: true })
    await nodeFs.writeFile(join(dir, 'file2.txt'), 'content2')
    await add({ fs, dir, gitdir, filepath: 'file2.txt' })
    const commit2 = await commit({
      fs,
      dir,
      gitdir,
      message: 'Second commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a tag (lightweight tag)
    await tag({
      fs,
      dir,
      gitdir,
      ref: 'v1.0.0',
      object: commit1,
      force: true,
    })
    
    // Create bundle with specific refs
    const bundlePath = join(os.tmpdir(), `bundle-test-${Date.now()}.bundle`)
    try {
      const result = await bundle({
        fs,
        gitdir,
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
      const exists = await fs.exists(bundlePath)
      assert.strictEqual(exists, true, 'Bundle file should exist')
      
      // Verify bundle file is not empty
      const bundleData = await fs.read(bundlePath)
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
    const { fs, dir, gitdir } = await makeFixture('test-bundle')
    
    // Create commits and branches
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ fs, dir, gitdir, ref: 'feature', checkout: false })
    await tag({
      fs,
      dir,
      gitdir,
      ref: 'v1.0.0',
      object: 'refs/heads/master',
    })
    
    // Create bundle with all refs
    const bundlePath = join(os.tmpdir(), `bundle-all-${Date.now()}.bundle`)
    try {
      const result = await bundle({
        fs,
        gitdir,
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
    const { fs, dir, gitdir } = await makeFixture('test-bundle')
    
    // Create a commit
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    const commitOid = await commit({
      fs,
      dir,
      gitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle without specifying refs (should use HEAD)
    const bundlePath = join(os.tmpdir(), `bundle-head-${Date.now()}.bundle`)
    try {
      const result = await bundle({
        fs,
        gitdir,
        filepath: bundlePath,
      })
      
      assert.ok(result, 'Bundle result should be present')
      assert.ok(result.refs.size >= 1, 'Should have at least 1 ref')
      assert.ok(result.objectCount > 0, 'Should have objects')
      
      // Verify the HEAD ref is included
      const headRef = await readRef({ fs, gitdir, ref: 'HEAD' })
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
    const { fs, gitdir } = await makeFixture('test-empty')
    
    const bundlePath = join(os.tmpdir(), `bundle-empty-${Date.now()}.bundle`)
    try {
      await assert.rejects(
        async () => {
          await bundle({
            fs,
            gitdir,
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
    const { fs, dir, gitdir } = await makeFixture('test-bundle')
    
    // Create a commit
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-verify-${Date.now()}.bundle`)
    try {
      await bundle({
        fs,
        gitdir,
        filepath: bundlePath,
      })
      
      // Verify bundle
      const result = await verifyBundle({
        fs,
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
    const { fs } = await makeFixture('test-empty')
    
    // Create invalid bundle file
    const bundlePath = join(os.tmpdir(), `bundle-invalid-${Date.now()}.bundle`)
    try {
      await nodeFs.writeFile(bundlePath, 'invalid bundle content')
      
      const result = await verifyBundle({
        fs,
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
    const { fs } = await makeFixture('test-empty')
    
    const bundlePath = join(os.tmpdir(), `bundle-nonexistent-${Date.now()}.bundle`)
    
    const result = await verifyBundle({
      fs,
      filepath: bundlePath,
    })
    
    assert.strictEqual(result.valid, false, 'Bundle should be invalid')
    assert.ok(result.error, 'Should have error message')
  })
})

test('unbundle', async (t) => {
  await t.test('unbundles bundle into repository', async () => {
    const { fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir } = await makeFixture('test-bundle')
    
    // Create commits and branches in source repo
    await nodeFs.writeFile(join(sourceDir, 'file1.txt'), 'content1')
    await add({ fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir, filepath: 'file1.txt' })
    const commit1 = await commit({
      fs: sourceFs,
      dir: sourceDir,
      gitdir: sourceGitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir, ref: 'feature', checkout: true })
    await nodeFs.writeFile(join(sourceDir, 'file2.txt'), 'content2')
    await add({ fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir, filepath: 'file2.txt' })
    const commit2 = await commit({
      fs: sourceFs,
      dir: sourceDir,
      gitdir: sourceGitdir,
      message: 'Second commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create a tag (lightweight tag)
    await tag({
      fs: sourceFs,
      dir: sourceDir,
      gitdir: sourceGitdir,
      ref: 'v1.0.0',
      object: commit1,
      force: true,
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-unbundle-${Date.now()}.bundle`)
    try {
      await bundle({
        fs: sourceFs,
        gitdir: sourceGitdir,
        filepath: bundlePath,
        refs: ['refs/heads/master', 'refs/heads/feature', 'refs/tags/v1.0.0'],
      })
      
      // Create destination repository
      const destDir = join(os.tmpdir(), `unbundle-dest-${Date.now()}`)
      const destGitdir = join(destDir, '.git')
      try {
        await init({ fs: sourceFs, dir: destDir })
        
        // Unbundle into destination
        const result = await unbundle({
          fs: sourceFs,
          dir: destDir,
          gitdir: destGitdir,
          filepath: bundlePath,
        })
        
        assert.ok(result, 'Unbundle result should be present')
        assert.ok(result.imported.size > 0, 'Should have imported refs')
        assert.strictEqual(result.imported.size, 3, 'Should have imported 3 refs')
        assert.ok(result.imported.has('refs/heads/master'), 'Should have imported master')
        assert.ok(result.imported.has('refs/heads/feature'), 'Should have imported feature')
        assert.ok(result.imported.has('refs/tags/v1.0.0'), 'Should have imported tag')
        
        // Verify refs were imported correctly
        const masterOid = await readRef({ fs: sourceFs, gitdir: destGitdir, ref: 'refs/heads/master' })
        const featureOid = await readRef({ fs: sourceFs, gitdir: destGitdir, ref: 'refs/heads/feature' })
        const tagOid = await readRef({ fs: sourceFs, gitdir: destGitdir, ref: 'refs/tags/v1.0.0' })
        
        assert.ok(masterOid, 'Master ref should exist')
        assert.ok(featureOid, 'Feature ref should exist')
        assert.ok(tagOid, 'Tag ref should exist')
        
        // Verify objects are accessible
        const masterCommit = await readObject({ fs: sourceFs, gitdir: destGitdir, oid: masterOid! })
        assert.ok(masterCommit, 'Master commit should be readable')
        
        const featureCommit = await readObject({ fs: sourceFs, gitdir: destGitdir, oid: featureOid! })
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
    const { fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir } = await makeFixture('test-bundle')
    
    // Create commits
    await nodeFs.writeFile(join(sourceDir, 'file1.txt'), 'content1')
    await add({ fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir, filepath: 'file1.txt' })
    await commit({
      fs: sourceFs,
      dir: sourceDir,
      gitdir: sourceGitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    await branch({ fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir, ref: 'feature', checkout: false })
    
    // Create bundle with multiple refs
    const bundlePath = join(os.tmpdir(), `bundle-specific-${Date.now()}.bundle`)
    try {
      await bundle({
        fs: sourceFs,
        gitdir: sourceGitdir,
        filepath: bundlePath,
        refs: ['refs/heads/master', 'refs/heads/feature'],
      })
      
      // Create destination repository
      const destDir = join(os.tmpdir(), `unbundle-specific-${Date.now()}`)
      const destGitdir = join(destDir, '.git')
      try {
        await init({ fs: sourceFs, dir: destDir })
        
        // Unbundle only master
        const result = await unbundle({
          fs: sourceFs,
          dir: destDir,
          gitdir: destGitdir,
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
    const { fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir } = await makeFixture('test-bundle')
    
    // Create commit in source
    await nodeFs.writeFile(join(sourceDir, 'file1.txt'), 'content1')
    await add({ fs: sourceFs, dir: sourceDir, gitdir: sourceGitdir, filepath: 'file1.txt' })
    const commit1 = await commit({
      fs: sourceFs,
      dir: sourceDir,
      gitdir: sourceGitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-conflict-${Date.now()}.bundle`)
    try {
      await bundle({
        fs: sourceFs,
        gitdir: sourceGitdir,
        filepath: bundlePath,
        refs: ['refs/heads/master'],
      })
      
      // Create destination repository with different commit
      const destDir = join(os.tmpdir(), `unbundle-conflict-${Date.now()}`)
      const destGitdir = join(destDir, '.git')
      try {
        await init({ fs: sourceFs, dir: destDir })
        
        // Create a different commit in destination
        await nodeFs.writeFile(join(destDir, 'file2.txt'), 'different content')
        await add({ fs: sourceFs, dir: destDir, gitdir: destGitdir, filepath: 'file2.txt' })
        await commit({
          fs: sourceFs,
          dir: destDir,
          gitdir: destGitdir,
          message: 'Different commit',
          author: { name: 'Test', email: 'test@example.com' },
        })
        
        // Try to unbundle (should reject master since it exists with different OID)
        const result = await unbundle({
          fs: sourceFs,
          dir: destDir,
          gitdir: destGitdir,
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
    const { fs, gitdir } = await makeFixture('test-empty')
    
    const bundlePath = join(os.tmpdir(), `bundle-nonexistent-${Date.now()}.bundle`)
    
    await assert.rejects(
      async () => {
        await unbundle({
          fs,
          gitdir,
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
    const { fs, dir, gitdir } = await makeFixture('test-bundle')
    
    // Create a commit
    await nodeFs.writeFile(join(dir, 'file1.txt'), 'content1')
    await add({ fs, dir, gitdir, filepath: 'file1.txt' })
    await commit({
      fs,
      dir,
      gitdir,
      message: 'First commit',
      author: { name: 'Test', email: 'test@example.com' },
    })
    
    // Create bundle
    const bundlePath = join(os.tmpdir(), `bundle-parse-${Date.now()}.bundle`)
    try {
      await bundle({
        fs,
        gitdir,
        filepath: bundlePath,
      })
      
      // Read and parse bundle
      const bundleData = await fs.read(bundlePath)
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

