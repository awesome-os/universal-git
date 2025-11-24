# Test Helpers Package

This package contains shared test helpers used by all universal-git test packages.

## Exports

- `./fixture` - Fixture creation helper
- `./worktreeHelpers` - Worktree test utilities
- `./reflogHelpers` - Reflog test utilities
- `./nativeGit` - Native git comparison utilities
- `./objectFormat` - Object format utilities

## Usage

```typescript
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { createWorktreePath } from '@awesome-os/universal-git-test-helpers/helpers/worktreeHelpers.ts'
```

