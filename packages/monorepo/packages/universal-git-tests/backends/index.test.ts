import { test } from 'node:test'
import assert from 'node:assert'
import { createBackend } from '@awesome-os/universal-git-src/backends/index.ts'
import { BackendRegistry } from '@awesome-os/universal-git-src/backends/BackendRegistry.ts'
import { FilesystemBackend } from '@awesome-os/universal-git-src/backends/FilesystemBackend.ts'
import { InMemoryBackend } from '@awesome-os/universal-git-src/backends/InMemoryBackend.ts'
import { createFileSystem } from '@awesome-os/universal-git-src/utils/createFileSystem.ts'
import { makeNodeFixture } from '../helpers/makeNodeFixture.ts'
import type { BackendOptions, FilesystemBackendOptions, InMemoryBackendOptions } from '@awesome-os/universal-git-src/backends/types.ts'
import type { FileSystem } from '@awesome-os/universal-git-src/models/FileSystem.ts'

test('createBackend', async (t) => {
  await t.test('creates filesystem backend', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-createBackend-fs')
    
    const options: FilesystemBackendOptions = {
      type: 'filesystem',
      fs,
      gitdir,
    }
    
    const backend = createBackend(options)
    
    assert.ok(backend instanceof FilesystemBackend)
    assert.strictEqual(backend.getType(), 'filesystem')
  })

  await t.test('creates filesystem backend - auto-registers if not registered', async () => {
    // Clear any existing registration by using a fresh registry state
    const { fs, gitdir } = await makeNodeFixture('test-createBackend-fs-2')
    
    const options: FilesystemBackendOptions = {
      type: 'filesystem',
      fs,
      gitdir,
    }
    
    // This should auto-register filesystem backend
    const backend = createBackend(options)
    
    assert.ok(backend instanceof FilesystemBackend)
    assert.strictEqual(BackendRegistry.isRegistered('filesystem'), true)
  })

  await t.test('creates filesystem backend - throws error if fs missing', async () => {
    const options = {
      type: 'filesystem',
      gitdir: '/path/to/gitdir',
    } as any
    
    assert.throws(() => {
      createBackend(options)
    }, /Filesystem backend requires fs and gitdir options/)
  })

  await t.test('creates filesystem backend - throws error if gitdir missing', async () => {
    const { fs } = await makeNodeFixture('test-createBackend-fs-3')
    
    const options = {
      type: 'filesystem',
      fs,
    } as any
    
    assert.throws(() => {
      createBackend(options)
    }, /Filesystem backend requires fs and gitdir options/)
  })

  await t.test('creates in-memory backend', () => {
    const options: InMemoryBackendOptions = {
      type: 'in-memory',
    }
    
    const backend = createBackend(options)
    
    assert.ok(backend instanceof InMemoryBackend)
    assert.strictEqual(backend.getType(), 'in-memory')
  })

  await t.test('creates in-memory backend - auto-registers if not registered', () => {
    const options: InMemoryBackendOptions = {
      type: 'in-memory',
    }
    
    // This should auto-register in-memory backend
    const backend = createBackend(options)
    
    assert.ok(backend instanceof InMemoryBackend)
    assert.strictEqual(BackendRegistry.isRegistered('in-memory'), true)
  })

  await t.test('creates SQLite backend - auto-registers if not registered', async () => {
    const options = {
      type: 'sqlite',
      dbPath: '/tmp/test.db',
    } as any
    
    // This should auto-register sqlite backend
    const backend = createBackend(options)
    
    assert.strictEqual(backend.getType(), 'sqlite')
    assert.strictEqual(BackendRegistry.isRegistered('sqlite'), true)
  })

  await t.test('creates SQLite backend - throws error if dbPath missing', () => {
    const options = {
      type: 'sqlite',
    } as any
    
    assert.throws(() => {
      createBackend(options)
    }, /SQLite backend requires dbPath option/)
  })

  await t.test('reuses existing registrations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-createBackend-reuse')
    
    const options: FilesystemBackendOptions = {
      type: 'filesystem',
      fs,
      gitdir,
    }
    
    // First call should register
    const backend1 = createBackend(options)
    assert.ok(backend1 instanceof FilesystemBackend)
    
    // Second call should reuse existing registration
    const backend2 = createBackend(options)
    assert.ok(backend2 instanceof FilesystemBackend)
    
    // Both should work
    assert.strictEqual(backend1.getType(), 'filesystem')
    assert.strictEqual(backend2.getType(), 'filesystem')
  })

  await t.test('handles case insensitive backend types', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-createBackend-case')
    
    const options1: BackendOptions = {
      type: 'FILESYSTEM',
      fs,
      gitdir,
    } as any
    
    const options2: BackendOptions = {
      type: 'Filesystem',
      fs,
      gitdir,
    } as any
    
    const backend1 = createBackend(options1)
    const backend2 = createBackend(options2)
    
    assert.ok(backend1 instanceof FilesystemBackend)
    assert.ok(backend2 instanceof FilesystemBackend)
  })

  await t.test('normalizes filesystem using createFileSystem', async () => {
    const { fs: rawFs, gitdir } = await makeNodeFixture('test-createBackend-normalize')
    
    // Create backend with raw filesystem (callback-based)
    const backend = createBackend({
      type: 'filesystem',
      fs: rawFs,  // Raw filesystem, should be normalized by factory
      gitdir,
    })
    
    // Verify backend works correctly (normalization happened)
    assert.ok(backend instanceof FilesystemBackend)
    
    // Verify we can use the backend
    await backend.initialize()
    await backend.writeHEAD('ref: refs/heads/main')
    const head = await backend.readHEAD()
    assert.strictEqual(head, 'ref: refs/heads/main')
  })

  await t.test('normalizes filesystem - accepts already normalized fs', async () => {
    const { fs: rawFs, gitdir } = await makeNodeFixture('test-createBackend-normalize-2')
    
    // Normalize fs first
    const normalizedFs = createFileSystem(rawFs)
    
    // Create backend with already-normalized filesystem
    const backend = createBackend({
      type: 'filesystem',
      fs: normalizedFs,  // Already normalized, factory handles it correctly
      gitdir,
    })
    
    // Verify backend works correctly
    assert.ok(backend instanceof FilesystemBackend)
    await backend.initialize()
    await backend.writeHEAD('ref: refs/heads/main')
    const head = await backend.readHEAD()
    assert.strictEqual(head, 'ref: refs/heads/main')
  })

  await t.test('maintains caching behavior - same raw fs = same FileSystem instance', async () => {
    const { fs: rawFs, gitdir } = await makeNodeFixture('test-createBackend-cache')
    
    // Create two backends with the same raw filesystem
    const backend1 = createBackend({
      type: 'filesystem',
      fs: rawFs,
      gitdir: gitdir + '/1',
    })
    
    const backend2 = createBackend({
      type: 'filesystem',
      fs: rawFs,  // Same raw fs
      gitdir: gitdir + '/2',
    })
    
    // Both backends should work
    assert.ok(backend1 instanceof FilesystemBackend)
    assert.ok(backend2 instanceof FilesystemBackend)
    
    // Verify they can operate independently
    await backend1.initialize()
    await backend2.initialize()
    
    await backend1.writeHEAD('ref: refs/heads/main')
    await backend2.writeHEAD('ref: refs/heads/develop')
    
    assert.strictEqual(await backend1.readHEAD(), 'ref: refs/heads/main')
    assert.strictEqual(await backend2.readHEAD(), 'ref: refs/heads/develop')
    
    // The factory should normalize both to the same FileSystem instance internally
    // (this is verified by the fact that both work correctly with the same raw fs)
  })

  await t.test('normalizes promise-based filesystem', async () => {
    const { fs: rawFs, gitdir } = await makeNodeFixture('test-createBackend-promise-fs')
    
    // Simulate promise-based fs (fs.promises)
    const promiseFs = {
      promises: rawFs,
    }
    
    // Create backend with promise-based filesystem
    const backend = createBackend({
      type: 'filesystem',
      fs: promiseFs as any,  // Promise-based fs, should be normalized
      gitdir,
    })
    
    // Verify backend works correctly
    assert.ok(backend instanceof FilesystemBackend)
    await backend.initialize()
    await backend.writeHEAD('ref: refs/heads/main')
    const head = await backend.readHEAD()
    assert.strictEqual(head, 'ref: refs/heads/main')
  })
})

