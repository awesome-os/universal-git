/**
 * Isolated performance test for: merge 'add-files' and 'remove-files'
 * 
 * This is one of the slowest merge operations (28.63s timeout).
 * Isolated here for focused profiling and optimization.
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { merge, log } from '@awesome-os/universal-git-src/index.ts'
import { createTestRepo, createInitialCommit, createBranch, createCommit, nativeMerge, isGitAvailable } from '../packages/test-helpers/helpers/nativeGit.ts'
import { execSync } from 'child_process'

test("merge 'add-files' and 'remove-files'", async () => {
  // Setup: Create repo with native git
  if (!isGitAvailable()) {
    console.warn('Native git not available, skipping test')
    return
  }

  const cache: Record<string, unknown> = {}
  const repo = await createTestRepo('sha1')
  
  try {
    // Create initial commit (this will create 'master' branch)
    await createInitialCommit(repo, { 'o.txt': 'original content\n' }, 'initial commit')
    
    // Get the actual branch name (might be 'master' or 'main')
    const defaultBranch = execSync('git branch --show-current', { 
      cwd: repo.path, 
      encoding: 'utf-8' 
    }).trim() || 'master'
    
    // Create add-files branch
    createBranch(repo, 'add-files', defaultBranch)
    await createCommit(repo, 'add-files', {
      'file1.txt': 'file1\n',
      'file2.txt': 'file2\n',
    }, [], 'add files', 1262356926)
    
    // Create remove-files branch
    createBranch(repo, 'remove-files', defaultBranch)
    await createCommit(repo, 'remove-files', {}, ['o.txt'], 'remove o.txt', 1262356927)
    
    // Perform merge with native git first to get expected result
    const nativeResult = await nativeMerge(repo, 'add-files', 'remove-files', {
      message: "Merge branch 'remove-files' into add-files",
    })
    
    // Reset to before merge for universal-git test
    // Get the commit OID before the merge
    const beforeMergeOid = execSync('git rev-parse add-files', { 
      cwd: repo.path, 
      encoding: 'utf-8' 
    }).trim()
    execSync(`git reset --hard ${beforeMergeOid}`, { cwd: repo.path, stdio: 'pipe' })
    
    // Perform merge with universal-git
    const { performance } = await import('perf_hooks')
    performance.mark('merge-start')
    const report = await merge({
      fs: repo.fs,
      gitdir: repo.gitdir,
      cache,
      ours: 'add-files',
      theirs: 'remove-files',
      author: {
        name: 'Mr. Test',
        email: 'mrtest@example.com',
        timestamp: 1262356920,
        timezoneOffset: -0,
      },
    })
    
    performance.mark('merge-end')
    performance.measure('merge-operation', 'merge-start', 'merge-end')
    const measure = performance.getEntriesByName('merge-operation')[0]
    console.log(`\n⏱️  Merge operation took: ${measure.duration.toFixed(2)}ms\n`)
    
    // Compare results
    assert.ok(report.oid, 'Merge should produce a commit OID')
    assert.ok(nativeResult.oid, 'Native merge should produce a commit OID')
    
    // Verify merge commit structure
    const mergeCommit = (
      await log({
        cache,
        fs: repo.fs,
        gitdir: repo.gitdir,
        ref: 'add-files',
        depth: 1,
      })
    )[0].commit
    
    // Compare tree OIDs - use mergeCommit.tree since report.tree might not be set
    assert.ok(mergeCommit.tree, 'Merge commit should have a tree OID')
    assert.ok(nativeResult.tree, 'Native merge should have a tree OID')
    assert.strictEqual(mergeCommit.tree, nativeResult.tree, 'Merge commit tree should match native git')
    
    // If report has tree, it should also match
    if (report.tree) {
      assert.strictEqual(report.tree, nativeResult.tree, 'Report tree OID should match native git')
    }
  } finally {
    await repo.cleanup()
  }
})

