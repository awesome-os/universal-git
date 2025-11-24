# Test Fixtures Documentation

## Overview

Test fixtures are pre-configured Git repositories and working directories stored in `tests/__fixtures__/`. They provide isolated, reproducible test environments.

## Fixture Structure

Fixtures are organized in `tests/__fixtures__/` with two types:

1. **Working Directory Fixtures**: Directories like `test-add/`, `test-status/`, etc.
   - Contain files and directories that represent a working tree
   - Used for testing operations on files in the working directory

2. **Git Repository Fixtures**: Directories ending with `.git` like `test-commit.git/`, `test-merge.git/`, etc.
   - Contain complete Git repositories with objects, refs, config, etc.
   - Used for testing Git operations

## Using Fixtures in Tests

### Basic Usage

```typescript
import { makeFixture } from '../helpers/fixture.ts'

test('my test', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-name')
  // Use fs, dir, and gitdir for your test
})
```

### How `makeFixture` Works

1. **Location**: `tests/helpers/fixture.ts` wraps `makeNodeFixture` from `tests/helpers/makeNodeFixture.ts`

2. **Fixture Resolution**: 
   - Uses `findUp` to search for `__fixtures__/test-name` starting from `tests/` directory
   - Creates temporary copies of fixtures in the system temp directory
   - Returns `{ fs, dir, gitdir }` where:
     - `fs`: FileSystem instance for file operations
     - `dir`: Path to working directory fixture (if exists)
     - `gitdir`: Path to git repository fixture (if exists)

3. **Cleanup**: Temporary directories are automatically cleaned up on process exit

### Fixture Naming Convention

- Working directory: `test-{name}/`
- Git repository: `test-{name}.git/`
- Both are copied to temp directories when `makeFixture('test-{name}')` is called

## On-Demand Fixture Generation with Native Git

For merge tests, we're transitioning to on-demand fixture generation using native git. This approach:

1. **Ensures Feature Parity**: Tests compare isomorphic-git results directly against native git
2. **Eliminates Fixture Issues**: No dependency on pre-generated fixtures that may be incorrect
3. **Improves Maintainability**: Tests are self-contained and easier to understand

### Using Native Git Helpers

```typescript
import { createTestRepo, createInitialCommit, createBranch, createCommit, nativeMerge } from '../helpers/nativeGit.ts'

test('merge test', async () => {
  const repo = await createTestRepo('sha1')
  try {
    // Create initial commit
    await createInitialCommit(repo, { 'file.txt': 'content' })
    
    // Create branches
    createBranch(repo, 'branch1', 'master')
    await createCommit(repo, 'branch1', { 'file.txt': 'modified' })
    
    // Perform merge with isomorphic-git
    const result = await merge({ fs: repo.fs, gitdir: repo.gitdir, ... })
    
    // Compare with native git
    const nativeResult = await nativeMerge(repo, 'master', 'branch1')
    assert.strictEqual(result.tree, nativeResult.tree)
  } finally {
    await repo.cleanup()
  }
})
```

### Fixture Validation

You can validate existing fixtures to check for missing objects:

```bash
node scripts/generate-fixtures.mjs --validate --fixture test-merge
```

This will check that all tree entries reference valid objects in the repository.

## Special Fixture Files

### `pgp-keys.mjs`

Located at `tests/__fixtures__/pgp-keys.mjs`, contains PGP keys for testing signed commits and tags.

**Import in tests:**
```typescript
// From tests/tags/ directory
const { privateKey, publicKey } = await import('../__fixtures__/pgp-keys.mjs')
```

## Fixture Creation

Fixtures can be created in two ways:

### 1. Manual Creation
Fixtures can be created manually by setting up Git repositories and working directories.

### 2. Automated Generation
Use the fixture generation system to build fixtures from scratch:

```bash
npm run generate-fixtures -- --fixture <fixture-name>
npm run generate-fixtures -- --fixture <fixture-name> --object-format sha256
```

The generation system:
- Analyzes test files to determine required branches and commits
- Uses native git CLI commands to build fixtures from scratch
- Creates all necessary branches, commits, and merge result branches
- Supports both SHA-1 (default) and SHA-256 object formats
- Outputs fixtures to `tests/__fixtures__/`

#### Object Format Support
Fixtures can be generated with either SHA-1 (40-char OIDs) or SHA-256 (64-char OIDs) hash algorithms:
- **SHA-1** (default): Traditional Git format, compatible with all Git versions
- **SHA-256**: Newer format supported by Git 2.29+, uses longer OIDs

Tests automatically detect the object format from fixture config and validate OIDs accordingly.

### 3. Regenerating Existing Fixtures
The `regenerate-fixtures.mjs` script can fix existing fixtures:
- Reads tree objects from fixtures
- Re-serializes them with correct sorting
- Updates objects in place

## Browser vs Node Fixtures

- **Node**: Uses `makeNodeFixture` which copies fixtures to temp directories
- **Browser**: Uses `makeLightningFS` or `makeZenFS` which fetch fixtures over HTTP

The current test suite uses Node.js test runner, so all tests use `makeNodeFixture`.

## Common Patterns

### Testing with both working dir and git repo
```typescript
const { fs, dir, gitdir } = await makeFixture('test-status')
// dir points to test-status/ working directory
// gitdir points to test-status.git/ repository
```

### Testing with only git repo
```typescript
const { fs, gitdir } = await makeFixture('test-readCommit')
// Only gitdir is available (no working directory fixture)
```

### Testing with only working dir
```typescript
const { fs, dir } = await makeFixture('test-add')
// Only dir is available (no .git repository fixture)
```

## Notes

- Fixtures are read-only in the source directory
- Each test gets a fresh copy in a temp directory
- Modifications in tests don't affect the original fixtures
- Temp directories are cleaned up automatically

