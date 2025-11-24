---
title: Git Hooks
sidebar_label: Hooks
---

# Git Hooks

Git hooks are scripts that run automatically at certain points in the Git workflow. Universal-git automatically executes hooks when appropriate operations are performed.

## Overview

Hooks enable you to:
- Validate commits before they're created
- Run tests before pushing
- Send notifications after operations
- Customize Git behavior
- Enforce project policies

## Automatic Hook Execution

Universal-git automatically executes hooks for:
- ✅ **Commit operations** - pre-commit, prepare-commit-msg, commit-msg, post-commit
- ✅ **Checkout operations** - post-checkout
- ✅ **Merge operations** - post-merge
- ✅ **Push operations** - pre-push
- ✅ **Server-side operations** - pre-receive, update, post-receive

## Client-Side Hooks

### pre-commit

Runs before a commit is created. Can abort the commit by returning a non-zero exit code.

**When it runs:** Before `commit` creates the commit object

**Environment variables:**
- `GIT_DIR` - Git directory path
- `GIT_WORK_TREE` - Working tree path
- `GIT_INDEX_FILE` - Index file path

**Example hook:**
```bash
#!/bin/sh
# Run linter before commit
npm run lint
if [ $? -ne 0 ]; then
  echo "Linting failed. Commit aborted."
  exit 1
fi
```

### prepare-commit-msg

Runs after the commit message is created but before the editor is opened. Can modify the commit message.

**When it runs:** After commit message is created, before commit is finalized

**Arguments:**
- `<file>` - Path to commit message file
- `<source>` - Source of the message (e.g., 'message', 'merge', 'squash')

**Example hook:**
```bash
#!/bin/sh
# Add issue number to commit message
COMMIT_MSG_FILE=$1
SOURCE=$2

if [ "$SOURCE" = "message" ]; then
  # Add issue number from branch name
  BRANCH=$(git branch --show-current)
  ISSUE=$(echo $BRANCH | grep -o '[0-9]\+')
  if [ -n "$ISSUE" ]; then
    echo "Issue #$ISSUE" >> "$COMMIT_MSG_FILE"
  fi
fi
```

### commit-msg

Runs to validate the commit message. Can abort the commit by returning a non-zero exit code.

**When it runs:** After commit message is finalized, before commit is created

**Arguments:**
- `<file>` - Path to commit message file

**Example hook:**
```bash
#!/bin/sh
# Validate commit message format
COMMIT_MSG_FILE=$1
MSG=$(cat "$COMMIT_MSG_FILE")

# Check for conventional commit format
if ! echo "$MSG" | grep -qE '^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+'; then
  echo "Commit message must follow conventional commit format"
  exit 1
fi
```

### post-commit

Runs after a commit is successfully created. Cannot abort the commit.

**When it runs:** After commit is created

**Environment variables:**
- `GIT_COMMIT` - Commit OID

**Example hook:**
```bash
#!/bin/sh
# Send notification after commit
COMMIT=$(git rev-parse HEAD)
echo "Commit $COMMIT created successfully"
# Send notification...
```

### post-checkout

Runs after a successful checkout operation.

**When it runs:** After `checkout` completes successfully

**Arguments:**
- `<previous-head>` - Previous HEAD OID
- `<new-head>` - New HEAD OID
- `<branch-flag>` - '1' if branch checkout, '0' if file checkout

**Example hook:**
```bash
#!/bin/sh
# Install dependencies after checkout
PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_FLAG=$3

if [ "$BRANCH_FLAG" = "1" ]; then
  # Branch checkout - install dependencies
  npm install
fi
```

### post-merge

Runs after a successful merge operation.

**When it runs:** After `merge` completes successfully

**Arguments:**
- `<squash-flag>` - '1' if squash merge, '0' otherwise

**Example hook:**
```bash
#!/bin/sh
# Update dependencies after merge
SQUASH_FLAG=$1
npm install
```

### pre-push

Runs before a push operation. Can abort the push by returning a non-zero exit code.

**When it runs:** Before `push` sends data to remote

**Arguments:**
- `<remote-name>` - Name of the remote
- `<remote-url>` - URL of the remote

**Environment variables:**
- `GIT_REMOTE` - Remote name
- `GIT_REMOTE_URL` - Remote URL

**Example hook:**
```bash
#!/bin/sh
# Run tests before push
REMOTE=$1
URL=$2

npm test
if [ $? -ne 0 ]; then
  echo "Tests failed. Push aborted."
  exit 1
fi
```

## Server-Side Hooks

Server-side hooks run on the Git server during `receive-pack` operations.

### pre-receive

Runs once before any refs are updated. Can reject the entire push.

**When it runs:** Before any refs are updated during `receive-pack`

**Input (stdin):** All ref updates in format: `<old-oid> <new-oid> <ref-name>\n`

**Example hook:**
```bash
#!/bin/sh
# Validate all ref updates
while read old_oid new_oid ref_name; do
  # Check if force push is allowed
  if [ "$old_oid" != "0000000000000000000000000000000000000000" ]; then
    # Existing ref - check if force push
    # Reject force pushes to main
    if [ "$ref_name" = "refs/heads/main" ]; then
      echo "Force push to main is not allowed"
      exit 1
    fi
  fi
done
```

### update

Runs once per ref being updated. Can reject individual refs.

**When it runs:** After pre-receive, once per ref update

**Arguments:**
- `<ref-name>` - Name of the ref being updated
- `<old-oid>` - Previous OID
- `<new-oid>` - New OID

**Example hook:**
```bash
#!/bin/sh
# Validate individual ref update
REF_NAME=$1
OLD_OID=$2
NEW_OID=$3

# Reject deletion of main branch
if [ "$OLD_OID" != "0000000000000000000000000000000000000000" ] && \
   [ "$NEW_OID" = "0000000000000000000000000000000000000000" ] && \
   [ "$REF_NAME" = "refs/heads/main" ]; then
  echo "Cannot delete main branch"
  exit 1
fi
```

### post-receive

Runs after all refs are successfully updated. Cannot reject the push.

**When it runs:** After all refs are updated during `receive-pack`

**Input (stdin):** All ref updates in format: `<old-oid> <new-oid> <ref-name>\n`

**Example hook:**
```bash
#!/bin/sh
# Deploy after push
while read old_oid new_oid ref_name; do
  if [ "$ref_name" = "refs/heads/main" ]; then
    # Deploy main branch
    ./deploy.sh
  fi
done
```

## Hook Execution

### Automatic Execution

Hooks are automatically executed by universal-git commands:

```typescript
import { commit } from 'universal-git'

// pre-commit, prepare-commit-msg, commit-msg, and post-commit
// hooks are automatically executed
await commit({
  fs,
  dir: '/path/to/repo',
  message: 'My commit'
})
```

### Manual Execution

You can also run hooks manually:

```typescript
import { runHook } from 'universal-git/git/hooks'

// Run a hook manually
const result = await runHook({
  fs,
  gitdir: '/path/to/.git',
  hookName: 'pre-commit',
  context: {
    gitdir: '/path/to/.git',
    workTree: '/path/to/repo'
  }
})

console.log('Exit code:', result.exitCode)
console.log('Output:', result.stdout)
```

## Hook Configuration

### Custom Hooks Path

You can specify a custom hooks directory:

```typescript
import { setConfig } from 'universal-git'

// Set custom hooks path
await setConfig({
  fs,
  gitdir,
  path: 'core.hooksPath',
  value: '/path/to/custom/hooks'
})
```

### Check if Hook Exists

```typescript
import { shouldRunHook } from 'universal-git/git/hooks'

// Check if hook exists and is executable
const exists = await shouldRunHook({
  fs,
  gitdir: '/path/to/.git',
  hookName: 'pre-commit'
})

if (exists) {
  console.log('pre-commit hook is available')
}
```

## Hook Scripts

### Shell Scripts

Most hooks are shell scripts:

```bash
#!/bin/sh
# pre-commit hook
echo "Running pre-commit checks..."
npm run lint
exit $?
```

### Node.js Scripts

Hooks can also be Node.js scripts:

```javascript
#!/usr/bin/env node
// pre-commit hook
const { execSync } = require('child_process')

try {
  execSync('npm run lint', { stdio: 'inherit' })
  process.exit(0)
} catch (error) {
  console.error('Linting failed')
  process.exit(1)
}
```

### Making Hooks Executable

Hooks must be executable to run:

```bash
chmod +x .git/hooks/pre-commit
```

## Best Practices

### 1. Keep Hooks Fast

```bash
#!/bin/sh
# ✅ Good: Fast hook
npm run lint -- --max-warnings 0

# ❌ Bad: Slow hook (runs full test suite)
npm test  # Too slow for pre-commit
```

### 2. Provide Clear Error Messages

```bash
#!/bin/sh
# ✅ Good: Clear error message
if ! npm run lint; then
  echo "❌ Linting failed. Please fix errors before committing."
  exit 1
fi

# ❌ Bad: Unclear error
npm run lint || exit 1
```

### 3. Make Hooks Optional

```bash
#!/bin/sh
# Skip hook if SKIP_HOOKS is set
if [ -n "$SKIP_HOOKS" ]; then
  exit 0
fi

# Run checks
npm run lint
```

## Limitations

1. **Browser Environments**: Hooks require process execution, which may not work in browsers
2. **Node.js Only**: Hook execution currently works in Node.js environments
3. **Custom Executors**: You can provide custom hook executors for different environments

## Troubleshooting

### Hook Not Running

If a hook is not running:

1. Check if hook exists:
   ```typescript
   const exists = await shouldRunHook({ fs, gitdir, hookName: 'pre-commit' })
   console.log('Hook exists:', exists)
   ```

2. Verify hook is executable:
   ```bash
   ls -l .git/hooks/pre-commit
   ```

3. Check hooks path:
   ```typescript
   const hooksPath = await getHooksPath({ fs, gitdir })
   console.log('Hooks path:', hooksPath)
   ```

### Hook Failing

If a hook is failing:

1. Check hook exit code:
   ```typescript
   try {
     await commit({ fs, dir, message: 'Test' })
   } catch (error) {
     console.log('Hook failed:', error.message)
   }
   ```

2. Test hook manually:
   ```bash
   .git/hooks/pre-commit
   ```

3. Check hook output:
   ```typescript
   const result = await runHook({ fs, gitdir, hookName: 'pre-commit' })
   console.log('Exit code:', result.exitCode)
   console.log('Stdout:', result.stdout)
   console.log('Stderr:', result.stderr)
   ```

## See Also

- [Commit](./commit.md) - Commit operations
- [Checkout](./checkout.md) - Checkout operations
- [Push](./push.md) - Push operations
- [Merge](./merge.md) - Merge operations

