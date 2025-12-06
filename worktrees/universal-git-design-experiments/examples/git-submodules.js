async function main() {
  const parentStorage = new MemoryStorage();

  // A factory to create separate storage for each submodule
  const submoduleStorageFactory = (path) => {
    console.log(`Creating new MemoryStorage for submodule at '${path}'`);
    return new MemoryStorage();
  };

  // --- 1. Clone the parent repository ---
  const bareRepo = await GitBareRepository.clone({
    url: 'https://github.com/parent/repo-with-submodules.git',
    storage: parentStorage,
  });

  // --- 2. Create the main worktree ---
  const mainWorktree = await bareRepo.createWorktree('main');

  // --- 3. Initialize and Update Submodules ---
  await mainWorktree.submoduleInit();
  await mainWorktree.submoduleUpdate({ storageFactory: submoduleStorageFactory });

  console.log("\nSubmodules have been cloned and checked out.");

  // --- 4. Interact with a submodule ---
  const mySubmodule = mainWorktree.submodules.get('src/my-library');
  if (mySubmodule) {
    console.log("\nInspecting 'src/my-library' submodule:");
    const subStatus = await mySubmodule.status();
    console.log("  - Submodule status is clean:", subStatus.unstagedChanges.length === 0);

    // Make a change inside the submodule
    await mySubmodule.writeFile('index.js', new TextEncoder().encode('// new version'));
    await mySubmodule.add('index.js');
    await mySubmodule.commit({ message: 'Update library', author: { name: 'Dev' } });
  }

  // --- 5. Check the parent's status ---
  // The parent will now see that the submodule has new commits.
  console.log("\nChecking status of the parent repository...");
  const parentStatus = await mainWorktree.status();
  console.log(parentStatus.unstagedChanges);
  // Expected output:
  // [{
  //   path: 'src/my-library',
  //   type: 'submodule-new-commits',
  //   from: 'old_commit_oid...',
  //   to: 'new_commit_oid...'
  // }]
}

main();