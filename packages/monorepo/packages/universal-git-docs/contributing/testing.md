---
title: Testing Guide
sidebar_label: Testing
---

# Testing Guide

This guide explains how to write and run tests for universal-git.

## Test Infrastructure

### Test Runner

Universal-git uses **Node.js native test runner** (`node --test`) with TypeScript support:

```bash
# Run all tests
npm run tests

# Run specific test file
node --experimental-strip-types --test tests/commands/clone.test.ts

# Run with coverage
npm run test:coverage
```

### Test Location

Tests are located in the `tests/` directory with `.test.ts` extension:

```
tests/
├── commands/          # Command tests
├── core-utils/        # Core utility tests
├── git/              # Git internals tests
├── http/             # HTTP protocol tests
├── wire/             # Wire protocol tests
└── helpers/          # Test helpers
```

### Test Format

Tests use Node.js native test API (not Jest/jasmine):

```typescript
import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '../helpers/fixture.ts'
import { clone } from 'universal-git'

test('clone repository', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  
  await clone({
    fs,
    dir,
    url: 'https://github.com/octocat/Hello-World.git'
  })
  
  assert.ok(true) // Test passes
})
```

## Test Fixtures

### Using makeFixture

The `makeFixture` helper creates isolated test environments:

```typescript
import { makeFixture } from '../helpers/fixture.ts'

test('my test', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-name')
  // Use fs, dir, and gitdir for your test
})
```

**How it works:**
1. Finds fixture in `tests/__fixtures__/test-name/` or `tests/__fixtures__/test-name.git/`
2. Creates temporary copy in system temp directory
3. Returns `{ fs, dir, gitdir }` for test use
4. Automatically cleans up on process exit

### Fixture Types

**Working Directory Fixture:**
```typescript
const { fs, dir } = await makeFixture('test-add')
// dir points to working directory fixture
```

**Git Repository Fixture:**
```typescript
const { fs, gitdir } = await makeFixture('test-commit')
// gitdir points to Git repository fixture
```

**Both:**
```typescript
const { fs, dir, gitdir } = await makeFixture('test-status')
// Both working directory and Git repository available
```

### Resetting Fixtures

Reset fixture to a specific commit:

```typescript
import { resetToCommit } from '../helpers/fixture.ts'

test('test with reset', async () => {
  const { fs, dir, gitdir } = await makeFixture('test-merge')
  const cache: Record<string, unknown> = {}
  
  // Reset to specific commit
  await resetToCommit(fs, dir, gitdir, 'abc123...', cache, 'hard')
})
```

## Test Isolation

### Isolated Temp Directories

Each test gets its own temporary directory:

```typescript
test('isolated test', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  // This test's temp directory is unique
  // Won't interfere with other tests
})
```

### Separate Cache Objects

Use separate cache objects per test:

```typescript
test('test with cache', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  const cache: Record<string, unknown> = {}  // Fresh cache per test
  
  await clone({ fs, dir, url: '...', cache })
})
```

## Using InMemoryBackend

For faster tests, use `InMemoryBackend`:

```typescript
import { Repository } from 'universal-git'
import { InMemoryBackend } from 'universal-git/backends/InMemoryBackend'

test('fast test with in-memory backend', async () => {
  const backend = new InMemoryBackend()
  const repo = await Repository.open({
    backend,
    cache: {}
  })
  
  // Test operations are faster (no filesystem I/O)
  await repo.writeObject({ type: 'blob', object: ... })
})
```

## Writing Tests

### Basic Test Structure

```typescript
import { test } from 'node:test'
import assert from 'node:assert'
import { makeFixture } from '../helpers/fixture.ts'
import { clone } from 'universal-git'

test('clone repository', async () => {
  // Arrange
  const { fs, dir } = await makeFixture('test-empty')
  
  // Act
  await clone({
    fs,
    dir,
    url: 'https://github.com/octocat/Hello-World.git',
    depth: 1,
    singleBranch: true
  })
  
  // Assert
  const files = await listFiles({ fs, dir })
  assert.ok(files.length > 0)
})
```

### Testing Commands

```typescript
import { add, commit, status } from 'universal-git'

test('add and commit', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  const cache: Record<string, unknown> = {}
  
  // Write file
  await fs.write(`${dir}/file.txt`, 'content')
  
  // Stage file
  await add({ fs, dir, filepath: 'file.txt', cache })
  
  // Commit
  const oid = await commit({
    fs,
    dir,
    message: 'Add file',
    author: { name: 'Test', email: 'test@example.com' },
    cache
  })
  
  assert.ok(oid)
})
```

### Testing Errors

```typescript
import assert from 'node:assert'
import { NotFoundError } from 'universal-git'

test('handles missing file', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  
  await assert.rejects(
    async () => {
      await readBlob({ fs, dir, oid: 'nonexistent' })
    },
    (error) => {
      assert.ok(error instanceof NotFoundError)
      return true
    }
  )
})
```

### Testing with Parallel Execution

Ensure tests work in parallel:

```typescript
test('parallel-safe test', async () => {
  // Use isolated temp directory
  const { fs, dir } = await makeFixture('test-empty')
  
  // Use separate cache
  const cache: Record<string, unknown> = {}
  
  // Clear any global state
  Repository.clearInstanceCache()
  
  // Test operations...
})
```

## Test Patterns

### Pattern 1: Setup and Teardown

```typescript
test('test with setup', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  const cache: Record<string, unknown> = {}
  
  // Setup
  await init({ fs, dir })
  await fs.write(`${dir}/file.txt`, 'content')
  
  // Test
  await add({ fs, dir, filepath: 'file.txt', cache })
  
  // Cleanup is automatic (temp directory removed)
})
```

### Pattern 2: Testing Multiple Scenarios

```typescript
test('test multiple scenarios', async (t) => {
  const scenarios = [
    { name: 'scenario 1', input: 'value1', expected: 'result1' },
    { name: 'scenario 2', input: 'value2', expected: 'result2' }
  ]
  
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const { fs, dir } = await makeFixture('test-empty')
      // Test scenario...
    })
  }
})
```

### Pattern 3: Testing Async Operations

```typescript
test('test async operations', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  
  // Test async iteration
  const commits = []
  for await (const commit of log({
    fs,
    dir,
    ref: 'HEAD'
  })) {
    commits.push(commit)
  }
  
  assert.ok(commits.length > 0)
})
```

## Best Practices

### 1. Use Isolated Fixtures

```typescript
// ✅ Good: Each test gets its own fixture
test('test 1', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  // Test...
})

test('test 2', async () => {
  const { fs, dir } = await makeFixture('test-empty')
  // Test...
})
```

### 2. Use Separate Caches

```typescript
// ✅ Good: Separate cache per test
test('test', async () => {
  const cache: Record<string, unknown> = {}
  await clone({ fs, dir, url: '...', cache })
})
```

### 3. Clear Global State

```typescript
// ✅ Good: Clear instance cache for isolation
test('test', async () => {
  Repository.clearInstanceCache()
  const { fs, dir } = await makeFixture('test-empty')
  // Test...
})
```

### 4. Use Appropriate Fixtures

```typescript
// ✅ Good: Use fixture that matches test needs
test('test merge', async () => {
  const { fs, dir } = await makeFixture('test-merge')
  // Test merge operations...
})
```

## Running Tests

### Run All Tests

```bash
npm run tests
```

### Run Specific Test

```bash
node --experimental-strip-types --test tests/commands/clone.test.ts
```

### Run with Coverage

```bash
npm run test:coverage
```

### Run in Parallel

```bash
node --experimental-strip-types --test --test-concurrency=0
```

## Test Coverage

Current coverage status:
- **Statements**: 76.34%
- **Branches**: 78.11%
- **Functions**: 72.93%
- **Lines**: 76.34%

Target goals:
- Statements: 80%+
- Branches: 80%+
- Functions: 75%+
- Lines: 80%+

## Test Naming Convention

Tests follow a standardized naming convention to enable easy filtering and targeting of specific test cases. See [Test Naming Convention](../../packages/universal-git-tests/NAMING_CONVENTION.md) for details.

**Quick Reference:**
- `ok:` - Happy path tests
- `param:` - Parameter validation/usage tests
- `error:` - Error handling tests
- `behavior:` - Specific behavior tests
- `edge:` - Edge case tests

**Example:**
```typescript
await t.test('ok:basic', async () => { ... })
await t.test('param:fs-missing', async () => { ... })
await t.test('error:caller-property', async () => { ... })
```

**Running tests with patterns:**
```bash
# Run all parameter tests
node --test --test-name-pattern="param:" tests/**/*.test.ts

# Run all error tests
node --test --test-name-pattern="error:" tests/**/*.test.ts
```

## See Also

- [Test Naming Convention](../../packages/universal-git-tests/NAMING_CONVENTION.md) - Standardized test naming for filtering
- [Test Coverage Plan](../../plans/TEST_COVERAGE_IMPROVEMENT_PLAN.md) - Coverage improvement strategy
- [InMemory Backend Plan](../../plans/INMEMORY_IMPROVEMENT_PLAN.md) - Using in-memory backends for tests
- [Test Fixtures Documentation](../../packages/universal-git-tests/helpers/FIXTURES.md) - Detailed fixture documentation





