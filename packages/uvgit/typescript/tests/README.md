# Tests for uvgit TypeScript Implementation

This directory contains tests for the uvgit TypeScript implementation using Node.js native test runner.

## Running Tests

Run all tests:
```bash
node --experimental-strip-types --test tests/**/*.ts
```

Run a specific test file:
```bash
node --experimental-strip-types --test tests/GitDir.test.ts
```

Run tests with verbose output:
```bash
node --experimental-strip-types --test --test-reporter=spec tests/**/*.ts
```

## Test Structure

- `GitDir.test.ts` - Tests for the main GitDir class, including:
  - Provider mounting/unmounting
  - Map-based provider lookup
  - Provider ordering
  - Path resolution
  - HEAD resolution
  - Mount point overlap prevention
  - Convenience methods (getProvider, hasProvider, getMountPoints, etc.)

- `helpers/mockProvider.ts` - Mock implementations for testing:
  - `MockProvider` - Mock GitDirProvider for testing provider behavior
  - `MockFileHandle` - Mock FileSystemFileHandle
  - `MockDirectoryHandle` - Mock FileSystemDirectoryHandle

## Test Naming Convention

Tests follow the pattern: `[category]:[description]`

Categories:
- `ok:` - Happy path tests (basic functionality)
- `param:` - Parameter validation tests
- `error:` - Error handling tests
- `behavior:` - Behavior/feature tests

## Writing New Tests

When adding new tests:

1. Use Node.js native test API:
   ```typescript
   import { test } from 'node:test';
   import assert from 'node:assert';
   ```

2. Use descriptive test names following the naming convention

3. Use mock providers from `helpers/mockProvider.ts` for isolated testing

4. Test both success and failure cases

5. Ensure tests are independent and can run in any order
