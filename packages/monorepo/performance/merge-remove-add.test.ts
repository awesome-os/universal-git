/**
 * Isolated performance test for: merge 'remove-files' and 'add-files'
 * 
 * This is one of the slowest merge operations (23.93s timeout).
 * Isolated here for focused profiling and optimization.
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { merge, log } from '@awesome-os/universal-git-src/index.ts'
import { createTestRepo, createInitialCommit, createBranch, createCommit, nativeMerge, isGitAvailable } from '../packages/test-helpers/helpers/nativeGit.ts'
import { execSync } from 'child_process'

test("merge 'remove-files' and 'add-files'", async () => {
  // Setup: Create repo with native git
  if (!isGitAvailable()) {
    console.warn('Native git not available, skipping test')
    return
  }

  const cache: Record<string, unknown> = {}
  const repo = await createTestRepo('sha1')
  
  try {
    // Create initial commit
    await createInitialCommit(repo, { 'o.txt': 'original content\n' }, 'initial commit')
    const defaultBranch = execSync('git branch --show-current', { 
      cwd: repo.path, 
      encoding: 'utf-8' 
    }).trim() || 'master'
    
    // Create remove-files branch
    createBranch(repo, 'remove-files', defaultBranch)
    await createCommit(repo, 'remove-files', {}, ['o.txt'], 'remove o.txt', 1262356927)
    
    // Create add-files branch
    createBranch(repo, 'add-files', defaultBranch)
    await createCommit(repo, 'add-files', {
      'file1.txt': 'file1\n',
      'file2.txt': 'file2\n',
    }, [], 'add files', 1262356926)
    
    // Perform merge with native git first to get expected result
    const nativeResult = await nativeMerge(repo, 'remove-files', 'add-files', {
      message: "Merge branch 'add-files' into remove-files",
    })
    
    // Reset to before merge for universal-git test
    const beforeMergeOid = execSync('git rev-parse remove-files', { 
      cwd: repo.path, 
      encoding: 'utf-8' 
    }).trim()
    execSync(`git reset --hard ${beforeMergeOid}`, { cwd: repo.path, stdio: 'pipe' })
    
    // Perform merge with universal-git
    const report = await merge({
      fs: repo.fs,
      gitdir: repo.gitdir,
      cache,
      ours: 'remove-files',
      theirs: 'add-files',
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
    })
    
    // Verify merge commit structure
    const mergeCommit = (
      await log({
        cache,
        fs: repo.fs,
        gitdir: repo.gitdir,
        ref: 'remove-files',
        depth: 1,
      })
    )[0].commit
    
    assert.ok(mergeCommit.tree, 'Merge commit should have a tree OID')
    assert.ok(nativeResult.tree, 'Native merge should have a tree OID')
    assert.strictEqual(mergeCommit.tree, nativeResult.tree, 'Merge commit tree should match native git')
  } finally {
    await repo.cleanup()
  }
})

