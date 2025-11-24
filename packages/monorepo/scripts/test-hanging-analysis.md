# Test Hanging Analysis

## Scripts Created

1. **`find-hanging-tests.mjs`** - Runs all test files independently with 2-minute timeout per file
   - Usage: `node find-hanging-tests.mjs`
   - Can resume from specific index: `START_INDEX=10 node find-hanging-tests.mjs`

2. **`test-single-file.mjs`** - Tests a single file with detailed output
   - Usage: `node test-single-file.mjs tests/commands/merge.test.ts`

## Findings

### merge.test.ts Analysis
- **Status**: ✅ Does NOT hang (completed in ~33 seconds)
- **Result**: Has 5 failing tests but completes execution
- **Failures**:
  1. `merge no fast-forward` - Repository instance required error
  2. `merge 'delete-first-half' and 'delete-second-half' (dryRun)` - Merge tree walk error
  3. `merge 'delete-first-half' and 'delete-second-half' (noUpdateBranch)` - Merge tree walk error
  4. `merge two branches that modified the same file, custom conflict resolver` - Merge tree walk error
  5. `create repo with isomorphic-git and clone with native git` - Ref mismatch error

### Next Steps

To find the actual hanging test:

1. **Run the full scan** (this will take a while):
   ```bash
   node find-hanging-tests.mjs
   ```

2. **Or test specific suspicious files**:
   ```bash
   node test-single-file.mjs tests/http/clone.test.ts
   node test-single-file.mjs tests/commands/merge-edge-cases.test.ts
   ```

3. **Check for tests that take longer than expected** - The script will report any test that times out after 2 minutes

## Notes

- All test files now have 60-second timeouts added via `add-timeouts.mjs`
- The hanging issue might be:
  - A specific test case within a file (not the whole file)
  - A test that hangs when run with other tests (race condition)
  - A test that hangs only in certain conditions

## Recommendations

1. Run `find-hanging-tests.mjs` to completion to identify all hanging files
2. For any file that times out, use `test-single-file.mjs` to get detailed output
3. Check if the hang occurs when running tests individually vs. together
4. Look for tests that might be waiting on network, file system, or async operations without proper timeouts

