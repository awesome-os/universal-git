# Test Naming Convention

This document describes the standardized naming convention for tests to enable easy filtering and targeting of specific test cases.

## Naming Format

Tests should follow the pattern: `[category]:[description]`

Where:
- **category** is a short prefix indicating the test type
- **description** is a concise, hyphenated description of what the test verifies

## Categories

### `ok:` - Happy Path Tests
Basic functionality tests that verify normal operation.

**Examples:**
- `ok:basic` - Basic functionality test
- `ok:returns-expected` - Returns expected value
- `ok:multiple-items` - Handles multiple items correctly

**Usage:**
```bash
# Run all happy path tests
node --test --test-name-pattern="ok:" tests/**/*.test.ts
```

### `param:` - Parameter Tests
Tests that verify parameter validation, usage, or behavior.

**Examples:**
- `param:fs-missing` - Missing fs parameter validation
- `param:repo-provided` - Using repo parameter
- `param:dir-derives-gitdir` - dir parameter derives gitdir
- `param:optional-default` - Optional parameter with default value

**Usage:**
```bash
# Run all parameter tests
node --test --test-name-pattern="param:" tests/**/*.test.ts

# Run tests for specific parameter
node --test --test-name-pattern="param:fs" tests/**/*.test.ts
```

### `error:` - Error Handling Tests
Tests that verify error conditions, error properties, or error handling.

**Examples:**
- `error:caller-property` - Error has correct caller property
- `error:MissingParameterError` - Throws MissingParameterError
- `error:NotFoundError` - Throws NotFoundError
- `error:message-format` - Error message format validation

**Usage:**
```bash
# Run all error tests
node --test --test-name-pattern="error:" tests/**/*.test.ts

# Run tests for specific error type
node --test --test-name-pattern="error:MissingParameter" tests/**/*.test.ts
```

### `behavior:` - Behavior Tests
Tests that verify specific behaviors or features.

**Examples:**
- `behavior:parallel-execution` - Parallel execution behavior
- `behavior:caching` - Caching behavior
- `behavior:concurrent-access` - Concurrent access handling

**Usage:**
```bash
# Run all behavior tests
node --test --test-name-pattern="behavior:" tests/**/*.test.ts
```

### `edge:` - Edge Case Tests
Tests that verify edge cases, boundary conditions, or unusual scenarios.

**Examples:**
- `edge:no-remotes` - Repository with no remotes
- `edge:empty-repo` - Empty repository handling
- `edge:large-file` - Large file handling
- `edge:special-chars` - Special characters in input

**Usage:**
```bash
# Run all edge case tests
node --test --test-name-pattern="edge:" tests/**/*.test.ts
```

## Description Guidelines

1. **Use hyphens** to separate words: `fs-missing` not `fsMissing` or `fs_missing`
2. **Keep it short** but descriptive: `param:fs-missing` not `param:throws-error-when-fs-parameter-is-missing`
3. **Be specific**: `param:fs-missing` not `param:missing`
4. **Use lowercase** for consistency
5. **Focus on what's tested**: The description should clearly indicate what the test verifies

## Examples

### Before (Inconsistent)
```typescript
await t.test('listRemotes', async () => { ... })
await t.test('throws MissingParameterError when fs is missing', async () => { ... })
await t.test('uses repo parameter when provided', async () => { ... })
await t.test('error has caller property set to git.listRemotes', async () => { ... })
await t.test('handles repository with no remotes', async () => { ... })
```

### After (Standardized)
```typescript
await t.test('ok:basic', async () => { ... })
await t.test('param:fs-missing', async () => { ... })
await t.test('param:repo-provided', async () => { ... })
await t.test('error:caller-property', async () => { ... })
await t.test('edge:no-remotes', async () => { ... })
```

## Running Tests with Patterns

Node.js test runner supports filtering by name pattern using `--test-name-pattern`:

```bash
# Run all parameter validation tests
npm test -- --test-name-pattern="param:"

# Run all error tests
npm test -- --test-name-pattern="error:"

# Run specific parameter tests
npm test -- --test-name-pattern="param:fs"

# Run multiple patterns (OR logic)
npm test -- --test-name-pattern="param:|error:"

# Run tests in specific file with pattern
node --test --test-name-pattern="param:" tests/remotes/listRemotes.test.ts
```

## Migration Strategy

1. Start with new tests - use the convention from now on
2. Update tests as you work on them
3. Batch update when refactoring test files
4. Use search/replace to update common patterns:
   - `'throws MissingParameterError when` → `'param:`
   - `'uses repo parameter` → `'param:repo-`
   - `'error has caller` → `'error:caller-`
   - `'handles repository with no` → `'edge:no-`

## Benefits

1. **Easy filtering**: Run specific test categories independently
2. **Consistent naming**: All tests follow the same pattern
3. **Short names**: Easier to read and maintain
4. **Pattern matching**: Use regex patterns for flexible filtering
5. **Better organization**: Clear categorization of test types

