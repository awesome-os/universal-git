# Mock Server Tests Package

This package contains tests that use mock servers (HTTP and Git daemon) for testing protocol-related git operations.

## Tests Included

### HTTP Protocol Tests (`tests/http/`)
- fetch, push, pull, checkout, listServerRefs, getRemoteInfo, hosting-providers, submodules

### Git Daemon Protocol Tests (`tests/daemon/`)
- fetch, clone, push, pull, listServerRefs, getRemoteInfo

### Git Hooks Tests (`tests/git/`)
- pre-push hook tests

## Running Tests

```bash
npm test
```

Or from the root:

```bash
npm run test:mock-server
```

