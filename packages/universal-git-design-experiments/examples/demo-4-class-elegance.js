async function main() {
  const storage = new MemoryStorage(); // A single, shared key-value store

  // --- STEP 1: Clone the bare repository ---
  const bareRepo = await GitBareRepository.clone({
    url: 'https://github.com/user/repo.git',
    storage: storage
  });
  console.log("Bare repository cloned successfully.");

  // --- STEP 2: Create two isolated worktrees ---
  const mainWorktree = await bareRepo.createWorktree('main');
  console.log("Created worktree for 'main' branch.");

  // Let's create a new branch in the bare repo first
  const mainOid = await bareRepo.resolveRef('refs/heads/main');
  await bareRepo.writeRef('refs/heads/feature-A', mainOid);
  
  const featureWorktree = await bareRepo.createWorktree('feature-A');
  console.log("Created worktree for 'feature-A' branch.");

  // --- STEP 3: Make a change in one worktree ---
  console.log("\nModifying 'README.md' in the feature worktree...");
  await featureWorktree.writeFile('README.md', new TextEncoder().encode('New feature content!'));
  await featureWorktree.add('README.md');
  const newCommitOid = await featureWorktree.commit({
    message: 'Add new feature',
    author: { name: 'Dev' }
  });
  console.log(`Committed ${newCommitOid.slice(0, 7)} to branch feature-A.`);

  // --- STEP 4: Verify isolation ---
  const mainStatus = await mainWorktree.status();
  console.log("\nStatus of 'main' worktree:");
  console.log("  - Staged Changes:", mainStatus.stagedChanges.length);   // Will be 0
  console.log("  - Unstaged Changes:", mainStatus.unstagedChanges.length); // Will be 0
  // The 'main' worktree is completely unaffected by the commit in the 'feature-A' worktree.

  // --- STEP 5: Switch a branch in a worktree ---
  console.log("\nSwitching 'main' worktree to branch 'feature-A'...");
  await mainWorktree.switchBranch('feature-A');
  
  // Now, if we read the README from this worktree, it will have the new content.
  const worktreeState = await storage.read(mainWorktree._worktreeKey());
  const readmeEntry = worktreeState.find(e => e.path === 'README.md');
  const readmeContent = await storage.read(readmeEntry.oid);
  console.log("Content of README.md in 'main' worktree is now:", new TextDecoder().decode(readmeContent.object));
}

main();