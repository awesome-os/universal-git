/**
 * Tests for server-side hooks (pre-receive, update, post-receive)
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { promises as nodeFs } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import {
  runPreReceiveHook,
  runUpdateHook,
  runPostReceiveHook,
  runServerHooks,
  type RefUpdate,
} from '@awesome-os/universal-git-src/git/hooks/serverHooks.ts'
import { init } from '@awesome-os/universal-git-src/commands/init.ts'
import { writeRef } from '@awesome-os/universal-git-src/git/refs/writeRef.ts'
import { readRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'

/**
 * Helper to create a temporary test repository
 */
async function createTestRepo(): Promise<{ fs: FileSystemProvider; gitdir: string; cleanup: () => Promise<void> }> {
  const tempDir = join(tmpdir(), `isogit-server-hooks-test-${Date.now()}-${Math.random().toString(36).substring(7)}`)
  const gitdir = join(tempDir, '.git')
  await nodeFs.mkdir(tempDir, { recursive: true })
  
  const fs = new FileSystem(nodeFs)
  await init({ fs, dir: tempDir })
  
  return {
    fs,
    gitdir,
    cleanup: async () => {
      try {
        await nodeFs.rm(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    },
  }
}

/**
 * Helper to create a hook script
 * Creates a Node.js script without shebang for cross-platform compatibility
 */
async function createHookScript(
  fs: FileSystemProvider,
  gitdir: string,
  hookName: string,
  script: string
): Promise<void> {
  const hooksPath = join(gitdir, 'hooks')
  await fs.mkdir(hooksPath)
  const hookPath = join(hooksPath, hookName)
  
  // Remove shebang if present (for cross-platform compatibility)
  const cleanScript = script.replace(/^#!.*\n/, '')
  await fs.write(hookPath, cleanScript)
  // Make executable (on Unix-like systems)
  try {
    await nodeFs.chmod(hookPath, 0o755)
  } catch {
    // Ignore chmod errors (Windows, etc.)
  }
}

test('pre-receive hook - accepts push', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create a pre-receive hook that accepts all pushes
    await createHookScript(
      fs,
      gitdir,
      'pre-receive',
      `process.exit(0)
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
    ]

    const result = await runPreReceiveHook({
      fs,
      gitdir,
      refUpdates,
    })

    assert.strictEqual(result.exitCode, 0, 'Pre-receive hook should succeed')
  } finally {
    await cleanup()
  }
})

test('pre-receive hook - rejects push', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create a pre-receive hook that rejects all pushes
    await createHookScript(
      fs,
      gitdir,
      'pre-receive',
      `console.error('Push rejected by pre-receive hook')
process.exit(1)
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
    ]

    await assert.rejects(
      async () => {
        await runPreReceiveHook({
          fs,
          gitdir,
          refUpdates,
        })
      },
      (error: any) => {
        assert.strictEqual(error.exitCode, 1, 'Pre-receive hook should fail')
        assert.ok(error.stderr.includes('Push rejected'), 'Error should contain rejection message')
        return true
      }
    )
  } finally {
    await cleanup()
  }
})

test('pre-receive hook - receives refs via stdin', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create a pre-receive hook that reads from stdin and validates
    const hookScript = `const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let lines = [];
rl.on('line', (line) => {
  lines.push(line);
});

rl.on('close', () => {
  if (lines.length === 2 && lines[0].includes('refs/heads/main') && lines[1].includes('refs/heads/feature')) {
    process.exit(0);
  } else {
    console.error('Invalid refs received');
    process.exit(1);
  }
});
`
    await createHookScript(fs, gitdir, 'pre-receive', hookScript)

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
      {
        ref: 'refs/heads/feature',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'def4567890123456789012345678901234567890',
      },
    ]

    const result = await runPreReceiveHook({
      fs,
      gitdir,
      refUpdates,
    })

    assert.strictEqual(result.exitCode, 0, 'Pre-receive hook should succeed')
  } finally {
    await cleanup()
  }
})

test('update hook - accepts ref update', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create an update hook that accepts all ref updates
    await createHookScript(
      fs,
      gitdir,
      'update',
      `// update hook receives: <ref-name> <old-value> <new-value>
const ref = process.argv[2];
const oldValue = process.argv[3];
const newValue = process.argv[4];
if (ref && oldValue && newValue) {
  process.exit(0);
} else {
  process.exit(1);
}
`
    )

    const refUpdate: RefUpdate = {
      ref: 'refs/heads/main',
      oldOid: '0000000000000000000000000000000000000000',
      newOid: 'abc123def4567890123456789012345678901234',
    }

    const result = await runUpdateHook({
      fs,
      gitdir,
      refUpdate,
    })

    assert.strictEqual(result.exitCode, 0, 'Update hook should succeed')
  } finally {
    await cleanup()
  }
})

test('update hook - rejects ref update', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create an update hook that rejects updates to main branch
    await createHookScript(
      fs,
      gitdir,
      'update',
      `const ref = process.argv[2];
if (ref === 'refs/heads/main') {
  console.error('Cannot update main branch');
  process.exit(1);
}
process.exit(0);
`
    )

    const refUpdate: RefUpdate = {
      ref: 'refs/heads/main',
      oldOid: '0000000000000000000000000000000000000000',
      newOid: 'abc123def4567890123456789012345678901234',
    }

    await assert.rejects(
      async () => {
        await runUpdateHook({
          fs,
          gitdir,
          refUpdate,
        })
      },
      (error: any) => {
        assert.strictEqual(error.exitCode, 1, 'Update hook should fail')
        assert.ok(error.stderr.includes('Cannot update main branch'), 'Error should contain rejection message')
        return true
      }
    )
  } finally {
    await cleanup()
  }
})

test('post-receive hook - runs after successful push', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create a post-receive hook that logs refs
    const outputFile = resolve(join(gitdir, 'post-receive-output.txt'))
    // Use JSON.stringify to properly escape the path for use in JavaScript code
    const outputFileJson = JSON.stringify(outputFile)
    await createHookScript(
      fs,
      gitdir,
      'post-receive',
      `const fs = require('fs');
const path = require('path');
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let lines = [];
rl.on('line', (line) => {
  lines.push(line);
});

rl.on('close', () => {
  const outputPath = path.resolve(${outputFileJson});
  fs.writeFileSync(outputPath, lines.join('\\n'));
  process.exit(0);
});
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
    ]

    const result = await runPostReceiveHook({
      fs,
      gitdir,
      refUpdates,
    })

    assert.strictEqual(result.exitCode, 0, 'Post-receive hook should succeed')
    
    // Verify hook received the refs
    const output = await fs.read(outputFile, 'utf8')
    assert.ok(output && typeof output === 'string', 'Output file should exist and be readable')
    assert.ok(output.includes('refs/heads/main'), 'Post-receive hook should receive refs via stdin')
    assert.ok(output.includes('abc123def4567890123456789012345678901234'), 'Post-receive hook should receive new OID')
  } finally {
    await cleanup()
  }
})

test('post-receive hook - errors are logged but do not fail push', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create a post-receive hook that fails
    await createHookScript(
      fs,
      gitdir,
      'post-receive',
      `console.error('Post-receive hook error');
process.exit(1);
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
    ]

    // Post-receive hook should not throw even if it fails
    const result = await runPostReceiveHook({
      fs,
      gitdir,
      refUpdates,
    })

    assert.strictEqual(result.exitCode, 1, 'Post-receive hook should report failure')
    assert.ok(result.stderr.includes('Post-receive hook error'), 'Error should be in stderr')
    // But it should not throw - the push was already successful
  } finally {
    await cleanup()
  }
})

test('runServerHooks - executes all hooks in order', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create hooks that log their execution
    const logFile = resolve(join(gitdir, 'hook-execution.log'))
    // Use JSON.stringify to properly escape the path for use in JavaScript code
    const logFileJson = JSON.stringify(logFile)
    
    await createHookScript(
      fs,
      gitdir,
      'pre-receive',
      `const fs = require('fs');
const path = require('path');
const logPath = path.resolve(${logFileJson});
fs.appendFileSync(logPath, 'pre-receive\\n');
process.exit(0);
`
    )

    await createHookScript(
      fs,
      gitdir,
      'update',
      `const fs = require('fs');
const path = require('path');
const logPath = path.resolve(${logFileJson});
fs.appendFileSync(logPath, 'update:' + process.argv[2] + '\\n');
process.exit(0);
`
    )

    await createHookScript(
      fs,
      gitdir,
      'post-receive',
      `const fs = require('fs');
const path = require('path');
const logPath = path.resolve(${logFileJson});
fs.appendFileSync(logPath, 'post-receive\\n');
process.exit(0);
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
      {
        ref: 'refs/heads/feature',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'def4567890123456789012345678901234567890',
      },
    ]

    const results = await runServerHooks({
      fs,
      gitdir,
      refUpdates,
    })

    assert.strictEqual(results.preReceive.exitCode, 0, 'Pre-receive should succeed')
    assert.strictEqual(results.update.length, 2, 'Update hook should run for each ref')
    assert.strictEqual(results.update[0].exitCode, 0, 'First update hook should succeed')
    assert.strictEqual(results.update[1].exitCode, 0, 'Second update hook should succeed')
    assert.strictEqual(results.postReceive.exitCode, 0, 'Post-receive should succeed')

    // Verify execution order
    const log = await fs.read(logFile, 'utf8')
    assert.ok(log && typeof log === 'string', 'Log file should exist and be readable')
    const lines = log.split('\n').filter(Boolean)
    assert.strictEqual(lines[0], 'pre-receive', 'Pre-receive should run first')
    assert.ok(lines[1].startsWith('update:refs/heads/main'), 'Update should run for main')
    assert.ok(lines[2].startsWith('update:refs/heads/feature'), 'Update should run for feature')
    assert.strictEqual(lines[3], 'post-receive', 'Post-receive should run last')
  } finally {
    await cleanup()
  }
})

test('runServerHooks - pre-receive rejection stops execution', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create hooks
    const logFile = resolve(join(gitdir, 'hook-execution.log'))
    // Use JSON.stringify to properly escape the path for use in JavaScript code
    const logFileJson = JSON.stringify(logFile)
    
    await createHookScript(
      fs,
      gitdir,
      'pre-receive',
      `const fs = require('fs');
const path = require('path');
const logPath = path.resolve(${logFileJson});
fs.appendFileSync(logPath, 'pre-receive:reject\\n');
process.exit(1);
`
    )

    await createHookScript(
      fs,
      gitdir,
      'update',
      `const fs = require('fs');
const path = require('path');
const logPath = path.resolve(${logFileJson});
fs.appendFileSync(logPath, 'update\\n');
process.exit(0);
`
    )

    await createHookScript(
      fs,
      gitdir,
      'post-receive',
      `const fs = require('fs');
const path = require('path');
const logPath = path.resolve(${logFileJson});
fs.appendFileSync(logPath, 'post-receive\\n');
process.exit(0);
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
    ]

    await assert.rejects(
      async () => {
        await runServerHooks({
          fs,
          gitdir,
          refUpdates,
        })
      },
      (error: any) => {
        assert.strictEqual(error.exitCode, 1, 'Should fail due to pre-receive rejection')
        return true
      }
    )

    // Verify update and post-receive did not run
    const log = await fs.read(logFile, 'utf8')
    assert.ok(log && typeof log === 'string', 'Log file should exist and be readable')
    assert.ok(log.includes('pre-receive:reject'), 'Pre-receive should have run')
    assert.ok(!log.includes('update'), 'Update should not have run')
    assert.ok(!log.includes('post-receive'), 'Post-receive should not have run')
  } finally {
    await cleanup()
  }
})

test('runServerHooks - update rejection stops that ref but continues others', async () => {
  const { fs, gitdir, cleanup } = await createTestRepo()
  try {
    // Create update hook that rejects main branch
    await createHookScript(
      fs,
      gitdir,
      'update',
      `const ref = process.argv[2];
if (ref === 'refs/heads/main') {
  process.exit(1);
}
process.exit(0);
`
    )

    const refUpdates: RefUpdate[] = [
      {
        ref: 'refs/heads/main',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'abc123def4567890123456789012345678901234',
      },
      {
        ref: 'refs/heads/feature',
        oldOid: '0000000000000000000000000000000000000000',
        newOid: 'def4567890123456789012345678901234567890',
      },
    ]

    await assert.rejects(
      async () => {
        await runServerHooks({
          fs,
          gitdir,
          refUpdates,
        })
      },
      (error: any) => {
        assert.strictEqual(error.exitCode, 1, 'Should fail due to update rejection')
        return true
      }
    )
  } finally {
    await cleanup()
  }
})

