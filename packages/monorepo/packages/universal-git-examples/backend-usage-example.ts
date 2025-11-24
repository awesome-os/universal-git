/**
 * Example usage of Git Backends
 * 
 * This file demonstrates how to use both FilesystemBackend and SQLiteBackend
 * to store Git repository data using the factory pattern.
 * 
 * @example
 * ```typescript
 * import * as fs from 'fs'
 * import { createFileSystem } from 'universal-git/utils/createFileSystem'
 * import { createBackend } from 'universal-git/backends'
 * 
 * // Normalize filesystem first
 * const FileSystemProvider = createFileSystem(fs)
 * 
 * // Create backend using factory (factory normalizes fs internally)
 * const backend = createBackend({
 *   type: 'filesystem',
 *   fs: FileSystemProvider,
 *   gitdir: '/path/to/.git',
 * })
 * ```
 */

import type { FileSystemProvider, RawFileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import { createBackend } from '@awesome-os/universal-git-src/backends/index.ts'
import type { GitBackend } from '@awesome-os/universal-git-src/backends/GitBackend.ts'
import { readRef } from '@awesome-os/universal-git-src/git/refs/readRef.ts'
import { writeRef } from '@awesome-os/universal-git-src/git/refs/writeRef.ts'

// ============================================================================
// Example 1: Using FilesystemBackend with Factory Pattern (Recommended)
// ============================================================================

/**
 * Example showing the recommended way to create a FilesystemBackend
 * using the factory pattern. The factory automatically normalizes the
 * filesystem instance.
 */
export async function exampleFilesystemBackend(fs: RawFileSystemProvider | FileSystemProvider, gitdir: string) {
  // ✅ RECOMMENDED: Use factory pattern (normalizes fs automatically)
  const backend = createBackend({
    type: 'filesystem',
    fs,  // Factory will normalize this using createFileSystem
    gitdir,
  })

  // Initialize the repository structure
  await backend.initialize()

  // Write HEAD
  await backend.writeHEAD('ref: refs/heads/main')

  // Write config
  const configData = Buffer.from('[core]\n\trepositoryformatversion = 0\n')
  await backend.writeConfig(configData)

  // Write a loose object
  const objectData = Buffer.from('deflated object data')
  await backend.writeLooseObject('abc123def456...', objectData)

  // Read it back
  const retrieved = await backend.readLooseObject('abc123def456...')
  console.log('Retrieved object:', retrieved)

  // Write a reference (use git/refs/writeRef instead of backend.writeRef)
  const normalizedFs = createFileSystem(fs)
  await writeRef({
    fs: normalizedFs,
    gitdir,
    ref: 'refs/heads/main',
    value: 'abc123def456...',
  })

  // Read the reference (use git/refs/readRef instead of backend.readRef)
  const refValue = await readRef({
    fs: normalizedFs,
    gitdir,
    ref: 'refs/heads/main',
  })
  console.log('Reference value:', refValue)

  // Append to reflog
  await backend.appendReflog('refs/heads/main', 'abc123... def456... author <email> timestamp +0000\tmessage\n')
}

// ============================================================================
// Example 2: Using SQLiteBackend
// ============================================================================

/**
 * Example showing how to create and use a SQLiteBackend.
 * SQLite backend doesn't require filesystem normalization.
 */
export async function exampleSQLiteBackend(dbPath: string) {
  // Create SQLite backend using factory
  const backend = createBackend({
    type: 'sqlite',
    dbPath,
  })

  // Initialize the database schema
  await backend.initialize()

  // All operations are the same as FilesystemBackend
  await backend.writeHEAD('ref: refs/heads/main')

  const configData = Buffer.from('[core]\n\trepositoryformatversion = 0\n')
  await backend.writeConfig(configData)

  const objectData = Buffer.from('deflated object data')
  await backend.writeLooseObject('abc123def456...', objectData)

  const retrieved = await backend.readLooseObject('abc123def456...')
  console.log('Retrieved object:', retrieved)

  // Note: For SQLite backend, you still need a filesystem for ref operations
  // In a real scenario, you would have access to fs and gitdir
  // This is just an example - ref operations require fs and gitdir
  // await writeRef({ fs, gitdir, ref: 'refs/heads/main', value: 'abc123def456...' })
  // const refValue = await readRef({ fs, gitdir, ref: 'refs/heads/main' })
  // console.log('Reference value:', refValue)

  // Clean up: close the database connection
  await backend.close()
}

// ============================================================================
// Example 3: Using the Factory Function with Multiple Backends
// ============================================================================

/**
 * Example showing how to use the factory function to create multiple
 * backends and use them interchangeably.
 */
export async function exampleFactory(fs: RawFileSystemProvider | FileSystemProvider, gitdir: string, dbPath: string) {
  // Create filesystem backend using factory (normalizes fs automatically)
  const fsBackend = createBackend({
    type: 'filesystem',
    fs,  // Can be RawFileSystemProvider or FileSystemProvider - factory normalizes it
    gitdir,
  })

  // Create SQLite backend using factory
  const sqliteBackend = createBackend({
    type: 'sqlite',
    dbPath,
  })

  // Both backends implement the same interface
  await fsBackend.writeHEAD('ref: refs/heads/main')
  await sqliteBackend.writeHEAD('ref: refs/heads/main')

  // You can use them interchangeably
  const fsHead = await fsBackend.readHEAD()
  const sqliteHead = await sqliteBackend.readHEAD()

  console.log('Filesystem HEAD:', fsHead)
  console.log('SQLite HEAD:', sqliteHead)

  // Clean up
  await sqliteBackend.close()
}

// ============================================================================
// Example 4: Working with Packfiles
// ============================================================================

/**
 * Example showing how to work with packfiles using any backend.
 */
export async function examplePackfiles(backend: GitBackend) {
  // Write a packfile
  const packData = Buffer.from('packfile binary data')
  await backend.writePackfile('pack-abc123.pack', packData)

  // Write the corresponding index
  const indexData = Buffer.from('packfile index binary data')
  await backend.writePackIndex('pack-abc123.idx', indexData)

  // Write a bitmap (optional)
  const bitmapData = Buffer.from('bitmap binary data')
  await backend.writePackBitmap('pack-abc123.bitmap', bitmapData)

  // List all packfiles
  const packfiles = await backend.listPackfiles()
  console.log('Packfiles:', packfiles)

  // Read a packfile back
  const retrieved = await backend.readPackfile('pack-abc123.pack')
  console.log('Retrieved packfile:', retrieved)
}

// ============================================================================
// Example 5: Working with State Files
// ============================================================================

/**
 * Example showing how to work with state files (used during merge, rebase, etc.).
 */
export async function exampleStateFiles(backend: GitBackend) {
  // Write state files (used during merge, rebase, etc.)
  await backend.writeStateFile('MERGE_HEAD', 'abc123def456...')
  await backend.writeStateFile('ORIG_HEAD', 'def456ghi789...')

  // Read state files
  const mergeHead = await backend.readStateFile('MERGE_HEAD')
  const origHead = await backend.readStateFile('ORIG_HEAD')

  console.log('MERGE_HEAD:', mergeHead)
  console.log('ORIG_HEAD:', origHead)

  // List all state files
  const stateFiles = await backend.listStateFiles()
  console.log('State files:', stateFiles)

  // Clean up after operation completes
  await backend.deleteStateFile('MERGE_HEAD')
  await backend.deleteStateFile('ORIG_HEAD')
}

// ============================================================================
// Example 6: Working with Reflogs
// ============================================================================

/**
 * Example showing how to work with reflogs.
 */
export async function exampleReflogs(backend: GitBackend) {
  // Append entries to reflog
  await backend.appendReflog(
    'refs/heads/main',
    'abc123 def456 author <email> 1234567890 +0000\tcommit: initial commit\n'
  )
  await backend.appendReflog(
    'refs/heads/main',
    'def456 ghi789 author <email> 1234567900 +0000\tcommit: add feature\n'
  )

  // Read the full reflog
  const reflog = await backend.readReflog('refs/heads/main')
  console.log('Reflog:', reflog)

  // List all reflogs
  const reflogs = await backend.listReflogs()
  console.log('All reflogs:', reflogs)
}

// ============================================================================
// Example 7: Working with Hooks
// ============================================================================

/**
 * Example showing how to work with Git hooks.
 */
export async function exampleHooks(backend: GitBackend) {
  // Write a pre-commit hook
  const hookScript = Buffer.from('#!/bin/sh\necho "Running pre-commit hook"\n')
  await backend.writeHook('pre-commit', hookScript)

  // Check if hook exists
  const hasHook = await backend.hasHook('pre-commit')
  console.log('Has pre-commit hook:', hasHook)

  // Read the hook
  const hook = await backend.readHook('pre-commit')
  console.log('Hook content:', hook?.toString())

  // List all hooks
  const hooks = await backend.listHooks()
  console.log('All hooks:', hooks)
}

// ============================================================================
// Example 8: Advanced Features
// ============================================================================

/**
 * Example showing advanced backend features like shallow clones,
 * worktrees, and LFS files.
 */
export async function exampleAdvancedFeatures(backend: GitBackend) {
  // Shallow clone
  await backend.writeShallow('abc123def456...\nghi789jkl012...\n')

  // Git daemon export
  await backend.writeGitDaemonExportOk()
  const canExport = await backend.readGitDaemonExportOk()
  console.log('Can export via git daemon:', canExport)

  // Worktrees
  await backend.writeWorktreeConfig('worktree1', '/path/to/worktree1/.git')
  const worktrees = await backend.listWorktrees()
  console.log('Worktrees:', worktrees)

  // LFS files
  const lfsData = Buffer.from('LFS file content')
  await backend.writeLFSFile('objects/ab/cdef1234', lfsData)
  const lfsFiles = await backend.listLFSFiles()
  console.log('LFS files:', lfsFiles)
}

// ============================================================================
// Example 9: Complete Workflow with Factory Pattern
// ============================================================================

/**
 * Complete example showing the recommended workflow:
 * 1. Normalize filesystem using createFileSystem
 * 2. Create backend using createBackend factory
 * 3. Use backend for Git operations
 */
export async function exampleCompleteWorkflow() {
  // Step 1: Get raw filesystem (Node.js fs module)
  const fs = await import('fs')
  
  // Step 2: Normalize filesystem using factory
  const FileSystemProvider = createFileSystem(fs)
  
  // Step 3: Create backend using factory (factory normalizes fs internally)
  const backend = createBackend({
    type: 'filesystem',
    fs: FileSystemProvider,  // Factory will ensure this is normalized
    gitdir: '/path/to/repo/.git',
  })
  
  // Step 4: Initialize repository
  await backend.initialize()
  
  // Step 5: Use backend for Git operations
  await backend.writeHEAD('ref: refs/heads/main')
  const head = await backend.readHEAD()
  console.log('HEAD:', head)
  
  // The factory pattern ensures:
  // - Filesystem is properly normalized
  // - Caching works correctly (same raw fs = same FileSystem instance)
  // - Type safety is maintained
  // - Consistent behavior across all backends
}

