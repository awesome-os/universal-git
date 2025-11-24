import { describe, it } from 'node:test'
import assert from 'node:assert'
import { merge, setConfig, commit, add, resolveRef } from '@awesome-os/universal-git-src/index.ts'
import { createTestRepo, createInitialCommit, createBranch, createCommit, nativeMerge } from '@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts'
import type { TestRepo } from '@awesome-os/universal-git-test-helpers/helpers/nativeGit.ts'

describe('merge edge cases - bisection tests', () => {
  // Helper to set up user config
  async function setupUserConfig(repo: TestRepo) {
    await setConfig({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, path: 'user.name', value: 'Test User' })
    await setConfig({ fs: repo.fs, dir: repo.path, gitdir: repo.gitdir, path: 'user.email', value: 'test@example.com' })
  }

  describe('file addition/deletion edge cases', () => {
    it('edge case: file added in ours, not in theirs or base', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has .gitkeep to allow empty commit
        await createInitialCommit(repo, { '.gitkeep': '' })
        
        // Ours: add file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'content1' })
        
        // Theirs: no changes (still has .gitkeep)
        createBranch(repo, 'theirs', 'master')
        // No commit on theirs - stays at base
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should be in merged tree
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file added in theirs, not in ours or base', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has .gitkeep to allow empty commit
        await createInitialCommit(repo, { '.gitkeep': '' })
        
        // Ours: no changes (still has .gitkeep)
        createBranch(repo, 'ours', 'master')
        // No commit on ours - stays at base
        
        // Theirs: add file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', { 'file1.txt': 'content1' })
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should be in merged tree
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file deleted in ours, exists in base and theirs', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: delete file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', {}, ['file1.txt'])
        
        // Theirs: no changes (still has file1.txt)
        createBranch(repo, 'theirs', 'master')
        // No commit on theirs - stays at base
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should be deleted in merged tree
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file deleted in theirs, exists in base and ours', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: no changes (still has file1.txt)
        createBranch(repo, 'ours', 'master')
        // No commit on ours - stays at base
        
        // Theirs: delete file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', {}, ['file1.txt'])
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should be deleted in merged tree
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file deleted in both ours and theirs', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: delete file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', {}, ['file1.txt'])
        
        // Theirs: delete file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', {}, ['file1.txt'])
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should be deleted in merged tree
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('file modification edge cases', () => {
    it('edge case: file modified in ours only, unchanged in theirs', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: modify file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'ours content' })
        
        // Theirs: no changes (still has base content)
        createBranch(repo, 'theirs', 'master')
        // No commit on theirs - stays at base
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should have ours content
        assert.ok(result.tree)
        const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
        assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file modified in theirs only, unchanged in ours', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: no changes (still has base content)
        createBranch(repo, 'ours', 'master')
        // No commit on ours - stays at base
        
        // Theirs: modify file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', { 'file1.txt': 'theirs content' })
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - file1.txt should have theirs content
        assert.ok(result.tree)
        const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
        assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file modified in both ours and theirs (conflict)', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content\n' })
        
        // Ours: modify file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'base content\nours change\n' })
        
        // Theirs: modify file1.txt differently
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', { 'file1.txt': 'base content\ntheirs change\n' })
        
        // Merge theirs into ours - should have conflict
        let error: unknown = null
        try {
          await merge({
            fs: repo.fs,
            gitdir: repo.gitdir,
            ours: 'ours',
            theirs: 'theirs',
            abortOnConflict: true,
            author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
          })
        } catch (e) {
          error = e
        }
        
        // Should throw MergeConflictError
        assert.notStrictEqual(error, null, 'Should throw conflict error')
        const { Errors } = await import('@awesome-os/universal-git-src/index.ts')
        assert.ok(
          error instanceof Errors.MergeConflictError ||
          (error as any)?.code === Errors.MergeConflictError.code ||
          (error as any)?.name === 'MergeConflictError',
          `Expected MergeConflictError, got: ${(error as any)?.code || (error as any)?.name}`
        )
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('mixed operations edge cases', () => {
    it('edge case: file deleted in ours, modified in theirs (conflict)', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: delete file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', {}, ['file1.txt'])
        
        // Theirs: modify file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', { 'file1.txt': 'theirs modified content' })
        
        // Merge theirs into ours - should have conflict
        let error: unknown = null
        try {
          await merge({
            fs: repo.fs,
            gitdir: repo.gitdir,
            ours: 'ours',
            theirs: 'theirs',
            abortOnConflict: true,
            author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
          })
        } catch (e) {
          error = e
        }
        
        // Should throw MergeConflictError
        assert.notStrictEqual(error, null, 'Should throw conflict error')
        const { Errors } = await import('@awesome-os/universal-git-src/index.ts')
        assert.ok(
          error instanceof Errors.MergeConflictError ||
          (error as any)?.code === Errors.MergeConflictError.code ||
          (error as any)?.name === 'MergeConflictError',
          `Expected MergeConflictError, got: ${(error as any)?.code || (error as any)?.name}`
        )
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: file modified in ours, deleted in theirs (conflict)', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base content' })
        
        // Ours: modify file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'ours modified content' })
        
        // Theirs: delete file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', {}, ['file1.txt'])
        
        // Merge theirs into ours - should have conflict
        let error: unknown = null
        try {
          await merge({
            fs: repo.fs,
            gitdir: repo.gitdir,
            ours: 'ours',
            theirs: 'theirs',
            abortOnConflict: true,
            author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
          })
        } catch (e) {
          error = e
        }
        
        // Should throw MergeConflictError
        assert.notStrictEqual(error, null, 'Should throw conflict error')
        const { Errors } = await import('@awesome-os/universal-git-src/index.ts')
        assert.ok(
          error instanceof Errors.MergeConflictError ||
          (error as any)?.code === Errors.MergeConflictError.code ||
          (error as any)?.name === 'MergeConflictError',
          `Expected MergeConflictError, got: ${(error as any)?.code || (error as any)?.name}`
        )
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: multiple files - some added, some deleted, some modified', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt, file2.txt, file3.txt
        await createInitialCommit(repo, {
          'file1.txt': 'base1',
          'file2.txt': 'base2',
          'file3.txt': 'base3',
        })
        
        // Ours: modify file1, delete file2, add file4
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', {
          'file1.txt': 'ours1',
          'file4.txt': 'ours4',
        }, ['file2.txt'])
        
        // Theirs: modify file3, delete file2, add file5
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', {
          'file3.txt': 'theirs3',
          'file5.txt': 'theirs5',
        }, ['file2.txt'])
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('directory edge cases', () => {
    it('edge case: directory added in ours, not in theirs', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has .gitkeep to allow empty commit
        await createInitialCommit(repo, { '.gitkeep': '' })
        
        // Ours: add dir/file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'dir/file1.txt': 'content1' })
        
        // Theirs: no changes (still has .gitkeep)
        createBranch(repo, 'theirs', 'master')
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: directory deleted in ours, exists in theirs', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has dir/file1.txt
        await createInitialCommit(repo, { 'dir/file1.txt': 'content1' })
        
        // Ours: delete dir/file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', {}, ['dir/file1.txt'])
        
        // Theirs: no changes
        createBranch(repo, 'theirs', 'master')
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - dir/file1.txt should be deleted
        assert.ok(result.tree)
        const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
        assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('empty tree edge cases', () => {
    it('edge case: merge with empty base tree', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has .gitkeep to allow empty commit
        await createInitialCommit(repo, { '.gitkeep': '' })
        
        // Ours: add file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'ours1' })
        
        // Theirs: add file2.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', { 'file2.txt': 'theirs2' })
        
        // Merge theirs into ours
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed - both files should be in merged tree
        assert.ok(result.tree || result.alreadyMerged, 'Merge should return tree or alreadyMerged')
        if (result.tree) {
          const nativeResult = await nativeMerge(repo, 'ours', 'theirs')
          assert.strictEqual(result.tree, nativeResult.tree, 'Tree OID should match native git')
        }
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: merge with empty ours tree', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base1' })
        
        // Ours: delete file1.txt (empty tree)
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', {}, ['file1.txt'])
        
        // Theirs: modify file1.txt
        createBranch(repo, 'theirs', 'master')
        await createCommit(repo, 'theirs', { 'file1.txt': 'theirs1' })
        
        // Merge theirs into ours - should have conflict
        let error: unknown = null
        try {
          await merge({
            fs: repo.fs,
            gitdir: repo.gitdir,
            ours: 'ours',
            theirs: 'theirs',
            abortOnConflict: true,
            author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
          })
        } catch (e) {
          error = e
        }
        
        // Should throw MergeConflictError
        assert.notStrictEqual(error, null, 'Should throw conflict error')
        const { Errors } = await import('@awesome-os/universal-git-src/index.ts')
        assert.ok(
          error instanceof Errors.MergeConflictError ||
          (error as any)?.code === Errors.MergeConflictError.code ||
          (error as any)?.name === 'MergeConflictError',
          `Expected MergeConflictError, got: ${(error as any)?.code || (error as any)?.name}`
        )
      } finally {
        await repo.cleanup()
      }
    })
  })

  describe('fast-forward edge cases', () => {
    it('edge case: fast-forward merge (ours is ancestor of theirs)', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base1' })
        
        // Ours: modify file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'ours1' })
        
        // Theirs: based on ours, modify file1.txt again
        createBranch(repo, 'theirs', 'ours')
        await createCommit(repo, 'theirs', { 'file1.txt': 'theirs1' })
        
        // Merge theirs into ours - should be fast-forward
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed and be fast-forward
        assert.ok(result.tree)
        assert.strictEqual(result.fastForward, true, 'Should be fast-forward merge')
      } finally {
        await repo.cleanup()
      }
    })

    it('edge case: already merged (theirs is ancestor of ours)', async () => {
      const repo = await createTestRepo('sha1')
      await setupUserConfig(repo)
      
      try {
        // Base: has file1.txt
        await createInitialCommit(repo, { 'file1.txt': 'base1' })
        
        // Ours: modify file1.txt
        createBranch(repo, 'ours', 'master')
        await createCommit(repo, 'ours', { 'file1.txt': 'ours1' })
        
        // Theirs: no changes (stays at base)
        createBranch(repo, 'theirs', 'master')
        
        // Merge theirs into ours - should be already merged
        const result = await merge({
          fs: repo.fs,
          gitdir: repo.gitdir,
          ours: 'ours',
          theirs: 'theirs',
          author: { name: 'Test', email: 'test@test.com', timestamp: 1262356920, timezoneOffset: 0 },
        })
        
        // Should succeed and be already merged
        assert.ok(result.alreadyMerged || result.tree, 'Merge should return alreadyMerged or tree')
        if (result.alreadyMerged) {
          assert.strictEqual(result.alreadyMerged, true, 'Should be already merged')
        }
      } finally {
        await repo.cleanup()
      }
    })
  })
})

