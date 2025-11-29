import { test } from 'node:test'
import assert from 'node:assert'
import { rebase, resolveRef, currentBranch, commit, add, branch, checkout, worktree } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { verifyReflogEntry } from '@awesome-os/universal-git-test-helpers/helpers/reflogHelpers.ts'
import { cleanupWorktrees, createWorktreePath, commitInWorktree } from '@awesome-os/universal-git-test-helpers/helpers/worktreeHelpers.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'

test('rebase', async (t) => {
  await t.test('ok:rebase-creates-start-and-finish-reflog-entries', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-branch')
    !
    
    // Get initial branch state
    let branchName = await currentBranch({ repo })
    if (!branchName) {
      // If no branch, use 'master' as default
      branchName = 'master'
    }
    const fullBranchRef = `refs/heads/${branchName}`
    const initialBranchOid = await resolveRef({ repo, ref: fullBranchRef })
    
    // Create an upstream branch using worktree
    const upstreamWorktreePath = createWorktreePath(dir, 'upstream-worktree')
    try {
      // Create upstream branch without checking out
      await branch({ repo, ref: 'upstream', object: initialBranchOid, checkout: false })
      
      // Create worktree for upstream branch
      await worktree({ repo, add: true, path: upstreamWorktreePath, ref: 'upstream' })
      
      // Make commit in upstream worktree
      await fs.write(`${upstreamWorktreePath}/upstream-file.txt`, 'upstream content')
      // Create worktree backend for the worktree path
      const { createGitWorktreeBackend } = await import('@awesome-os/universal-git-src/git/worktree/index.ts')
      const upstreamWorktreeBackend = createGitWorktreeBackend({ fs, dir: upstreamWorktreePath })
      
      await add({ gitBackend: repo.gitBackend, worktree: upstreamWorktreeBackend, filepath: 'upstream-file.txt', cache: repo.cache })
      
      const upstreamCommitOid = await commitInWorktree({
        repo,
        worktreePath: upstreamWorktreePath,
        message: 'Upstream commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        branch: 'upstream',
      })
      
      // Make a commit on the original branch (in main dir - needed for rebase)
      // Ensure HEAD is pointing to the branch before committing
      await checkout({ repo, ref: branchName })
      
      await fs.write(`${dir}/feature-file.txt`, 'feature content')
      await add({ repo, filepath: 'feature-file.txt' })
      const featureCommitOid = await commit({
        repo,
        message: 'Feature commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1262356921,
          timezoneOffset: -0,
        },
      })
      
      // Get the actual branch OID right before rebase (should be featureCommitOid)
      const branchOidBeforeRebase = await resolveRef({ repo, ref: fullBranchRef })
      assert.strictEqual(branchOidBeforeRebase, featureCommitOid, 'Branch should point to feature commit before rebase')
      
      // Perform rebase onto upstream
      const result = await rebase({
        repo,
        upstream: 'upstream',
        branch: branchName,
      })
      
      // Verify rebase reflog entries were created
      // Read the actual reflog to see what entries are there
      const { readLog } = await import('@awesome-os/universal-git-src/git/logs/readLog.ts')
      const reflog = await readLog({ fs, gitdir, ref: fullBranchRef, parsed: true })
      const reversed = [...reflog].reverse() // Most recent is index 0 (copy array to avoid mutation)
      
      // Find rebase start and finish entries (they might not be at specific indices due to other reflog entries)
      const rebaseStartEntry = reversed.find((entry: any) => entry.message.includes('rebase: rebasing onto'))
      const rebaseFinishEntry = reversed.find((entry: any) => entry.message.includes('rebase finished'))
      
      // Verify rebase start entry exists
      assert.ok(rebaseStartEntry, `Should have rebase start reflog entry. Reflog entries: ${reversed.map((e: any) => e.message).join(', ')}`)
      assert.strictEqual(rebaseStartEntry.newOid, upstreamCommitOid, 'Rebase start newOid should be upstream commit')
      
      // Verify rebase finish entry exists
      assert.ok(rebaseFinishEntry, `Should have rebase finish reflog entry. Reflog entries: ${reversed.map((e: any) => e.message).join(', ')}`)
      assert.strictEqual(rebaseFinishEntry.oldOid, upstreamCommitOid, 'Rebase finish oldOid should be upstream commit')
      assert.strictEqual(rebaseFinishEntry.newOid, result.oid, 'Rebase finish newOid should be result OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:rebase-with-abbreviated-ref-creates-correct-reflog-messages', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-branch')
    !
    
    // Get initial branch state
    let branchName = await currentBranch({ repo })
    if (!branchName) {
      // If no branch, use 'master' as default
      branchName = 'master'
    }
    const fullBranchRef = `refs/heads/${branchName}`
    const initialBranchOid = await resolveRef({ repo, ref: fullBranchRef })
    
    // Create an upstream branch using worktree
    const upstreamWorktreePath = createWorktreePath(dir, 'upstream-branch-worktree')
    try {
      // Create upstream branch without checking out
      await branch({ repo, ref: 'upstream-branch', object: initialBranchOid, checkout: false })
      
      // Create worktree for upstream branch
      await worktree({ repo, add: true, path: upstreamWorktreePath, ref: 'upstream-branch' })
      
      // Make commit in upstream worktree
      await fs.write(`${upstreamWorktreePath}/upstream-file.txt`, 'upstream content')
      // Create worktree backend for the worktree path
      const { createGitWorktreeBackend } = await import('@awesome-os/universal-git-src/git/worktree/index.ts')
      const upstreamWorktreeBackend3 = createGitWorktreeBackend({ fs, dir: upstreamWorktreePath })
      
      await add({ gitBackend: repo.gitBackend, worktree: upstreamWorktreeBackend3, filepath: 'upstream-file.txt', cache: repo.cache })
      
      const upstreamCommitOid = await commitInWorktree({
        repo,
        worktreePath: upstreamWorktreePath,
        message: 'Upstream commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        branch: 'upstream-branch',
      })
      
      // Make a commit on the original branch (in main dir - needed for rebase)
      // Ensure HEAD is pointing to the branch before committing
      await checkout({ repo, ref: branchName })
      
      await fs.write(`${dir}/feature-file.txt`, 'feature content')
      await add({ repo, filepath: 'feature-file.txt' })
      const featureCommitOid = await commit({
        repo,
        message: 'Feature commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1262356921,
          timezoneOffset: -0,
        },
      })
    
      // Perform rebase using full ref path (should be abbreviated in message)
      const result = await rebase({
        repo,
        upstream: 'refs/heads/upstream-branch',
        branch: branchName,
      })
      
      // Verify rebase start reflog entry uses abbreviated ref
      const { readLog } = await import('@awesome-os/universal-git-src/git/logs/readLog.ts')
      const reflog = await readLog({ fs, gitdir, ref: fullBranchRef, parsed: true })
      const reversed = [...reflog].reverse() // Most recent is index 0 (copy array to avoid mutation)
      
      // Find rebase start and finish entries (they might not be at specific indices due to other reflog entries)
      const rebaseStartEntry = reversed.find((entry: any) => entry.message.includes('rebase: rebasing onto'))
      const rebaseFinishEntry = reversed.find((entry: any) => entry.message.includes('rebase finished'))
      
      // Verify rebase start entry exists and uses abbreviated ref
      assert.ok(rebaseStartEntry, `Should have rebase start reflog entry. Reflog entries: ${reversed.map((e: any) => e.message).join(', ')}`)
      assert.ok(rebaseStartEntry.message.includes('upstream-branch'), `Rebase start message should contain 'upstream-branch', got: ${rebaseStartEntry.message}`)
      assert.strictEqual(rebaseStartEntry.newOid, upstreamCommitOid, 'Rebase start newOid should be upstream commit')
      
      // Verify rebase finish entry exists
      assert.ok(rebaseFinishEntry, `Should have rebase finish reflog entry. Reflog entries: ${reversed.map((e: any) => e.message).join(', ')}`)
      assert.strictEqual(rebaseFinishEntry.oldOid, upstreamCommitOid, 'Rebase finish oldOid should be upstream commit')
      assert.strictEqual(rebaseFinishEntry.newOid, result.oid, 'Rebase finish newOid should be result OID')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })

  await t.test('ok:rebase-with-conflicts-creates-start-reflog-entry-but-no-finish', async () => {
    const { repo, fs, dir, gitdir } = await makeFixture('test-branch')
    !
    
    // Get initial branch state
    let branchName = await currentBranch({ repo })
    if (!branchName) {
      // If no branch, use 'master' as default
      branchName = 'master'
    }
    const fullBranchRef = `refs/heads/${branchName}`
    
    // Create an upstream branch using worktree
    const upstreamWorktreePath = createWorktreePath(dir, 'upstream-worktree')
    try {
      // Get initial branch OID for upstream branch
      const initialBranchOid = await resolveRef({ repo, ref: fullBranchRef })
      
      // Create upstream branch without checking out
      await branch({ repo, ref: 'upstream', object: initialBranchOid, checkout: false })
      
      // Create worktree for upstream branch
      await worktree({ repo, add: true, path: upstreamWorktreePath, ref: 'upstream' })
      
      // Make commit in upstream worktree
      await fs.write(`${upstreamWorktreePath}/conflict-file.txt`, 'upstream version')
      // Create worktree backend for the worktree path
      const { createGitWorktreeBackend: createGitWorktreeBackend2 } = await import('@awesome-os/universal-git-src/git/worktree/index.ts')
      const upstreamWorktreeBackend2 = createGitWorktreeBackend2({ fs, dir: upstreamWorktreePath })
      
      await add({ gitBackend: repo.gitBackend, worktree: upstreamWorktreeBackend2, filepath: 'conflict-file.txt', cache: repo.cache })
      
      const upstreamCommitOid = await commitInWorktree({
        repo,
        worktreePath: upstreamWorktreePath,
        message: 'Upstream commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1262356920,
          timezoneOffset: -0,
        },
        branch: 'upstream',
      })
      
      // Make a commit on the original branch that modifies the same file differently (in main dir - needed for rebase)
      // Ensure HEAD is pointing to the branch before committing
      await checkout({ repo, ref: branchName })
      
      await fs.write(`${dir}/conflict-file.txt`, 'feature version')
      await add({ repo, filepath: 'conflict-file.txt' })
      const featureCommitOid = await commit({
        repo,
        message: 'Feature commit',
        author: {
          name: 'Test',
          email: 'test@example.com',
          timestamp: 1262356921,
          timezoneOffset: -0,
        },
      })
    
      // Get the actual branch OID right before rebase (should be featureCommitOid)
      const branchOidBeforeRebase = await resolveRef({ repo, ref: fullBranchRef })
      
      // Perform rebase - should result in conflicts
      const result = await rebase({
        repo,
        upstream: 'upstream',
        branch: branchName,
      })
      
      // Verify rebase start reflog entry was created
      const { readLog } = await import('@awesome-os/universal-git-src/git/logs/readLog.ts')
      const reflog = await readLog({ fs, gitdir, ref: fullBranchRef, parsed: true })
      const reversed = [...reflog].reverse() // Most recent is index 0 (copy array to avoid mutation)
      
      // Find rebase start entry (it might not be at index 0 due to other reflog entries)
      const rebaseStartEntry = reversed.find((entry: any) => entry.message.includes('rebase: rebasing onto'))
      
      // Verify rebase start entry exists
      assert.ok(rebaseStartEntry, `Should have rebase start reflog entry. Reflog entries: ${reversed.map((e: any) => e.message).join(', ')}`)
      assert.strictEqual(rebaseStartEntry.newOid, upstreamCommitOid, 'Rebase start newOid should be upstream commit')
      
      // Verify conflicts were detected
      assert.ok(result.conflicts && result.conflicts.length > 0, 'Should have conflicts')
      
      // Verify no finish reflog entry (rebase not completed due to conflicts)
      const finishEntries = reflog.filter((entry: any) => entry.message.includes('rebase finished'))
      assert.strictEqual(finishEntries.length, 0, 'Should have no finish reflog entry when rebase has conflicts')
    } finally {
      // Cleanup worktrees to ensure test isolation
      await cleanupWorktrees(fs, dir, gitdir)
    }
  })
})

