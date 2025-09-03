async function main() {
  const storage = new MemoryStorage();
  const repoUrl = 'https://github.com/some/large-repo.git';

  // --- STEP 1: Perform a fast, single-branch clone ---
  // We only download the history for the 'main' branch.
  const bareRepo = await GitBareRepository.clone({
    url: repoUrl,
    storage: storage,
    singleBranch: 'main'
  });
  console.log("\nBare repository cloned with only the 'main' branch data.");

  // At this point, `storage` contains all the objects for `main`, but nothing else.

  // --- STEP 2: Create a sparse worktree from the downloaded data ---
  // We only want to "see" the documentation and the main config file.
  const sparseWorktree = await bareRepo.createWorktree('main', {
    sparsePaths: [
      'docs/',          // The whole docs directory
      'package.json'    // A single file at the root
    ]
  });
  console.log("\nCreated a sparse worktree for 'main'.");

  // --- STEP 3: Verify the result ---
  // Let's inspect the virtual WORKTREE state in our storage.
  const virtualWorktree = await storage.read(sparseWorktree._worktreeKey());
  
  console.log("\nContents of the virtual sparse worktree:");
  for (const entry of virtualWorktree) {
    console.log(`  - ${entry.path} (oid: ${entry.oid.slice(0, 7)})`);
  }
  // This list will ONLY contain files and directories matching our sparsePaths filter.
  // Files like 'src/index.js' will be absent, even though their objects exist in storage.

  // --- STEP 4: Export (materialize) the sparse checkout ---
  const mockFs = new MockFileSystem();
  await sparseWorktree.export(mockFs, '/app');

  console.log("\nExported files to mock filesystem:");
  console.log(mockFs.listFiles('/app'));
  // The output will be a list like: ['/app/docs/guide.md', '/app/package.json']
  // It will NOT contain the full repository content.
}

main();