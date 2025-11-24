import { test } from 'node:test'
import assert from 'node:assert'
import { BackendRegistry } from '@awesome-os/universal-git-src/backends/BackendRegistry.ts'
import { InMemoryBackend } from '@awesome-os/universal-git-src/backends/InMemoryBackend.ts'
import type { GitBackend } from '@awesome-os/universal-git-src/backends/GitBackend.ts'
import type { BackendFactory, BackendOptions } from '@awesome-os/universal-git-src/backends/types.ts'

test('BackendRegistry', async (t) => {
  await t.test('register - registers a backend factory', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend', factory)
    
    assert.strictEqual(BackendRegistry.isRegistered('test-backend'), true)
    assert.strictEqual(BackendRegistry.isRegistered('TEST-BACKEND'), true) // Case insensitive
  })

  await t.test('register - overwrites existing registration', () => {
    const factory1: BackendFactory = () => new InMemoryBackend()
    const factory2: BackendFactory = () => new InMemoryBackend()
    
    BackendRegistry.register('test-backend-2', factory1)
    assert.strictEqual(BackendRegistry.getFactory('test-backend-2'), factory1)
    
    BackendRegistry.register('test-backend-2', factory2)
    assert.strictEqual(BackendRegistry.getFactory('test-backend-2'), factory2)
  })

  await t.test('getFactory - returns registered factory', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend-3', factory)
    
    const retrieved = BackendRegistry.getFactory('test-backend-3')
    assert.strictEqual(retrieved, factory)
  })

  await t.test('getFactory - returns undefined for unregistered type', () => {
    const factory = BackendRegistry.getFactory('non-existent-backend')
    assert.strictEqual(factory, undefined)
  })

  await t.test('getFactory - is case insensitive', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend-4', factory)
    
    assert.strictEqual(BackendRegistry.getFactory('TEST-BACKEND-4'), factory)
    assert.strictEqual(BackendRegistry.getFactory('Test-Backend-4'), factory)
    assert.strictEqual(BackendRegistry.getFactory('test-backend-4'), factory)
  })

  await t.test('isRegistered - returns true for registered type', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend-5', factory)
    
    assert.strictEqual(BackendRegistry.isRegistered('test-backend-5'), true)
  })

  await t.test('isRegistered - returns false for unregistered type', () => {
    assert.strictEqual(BackendRegistry.isRegistered('non-existent-backend'), false)
  })

  await t.test('isRegistered - is case insensitive', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend-6', factory)
    
    assert.strictEqual(BackendRegistry.isRegistered('TEST-BACKEND-6'), true)
    assert.strictEqual(BackendRegistry.isRegistered('Test-Backend-6'), true)
    assert.strictEqual(BackendRegistry.isRegistered('test-backend-6'), true)
  })

  await t.test('getRegisteredTypes - returns all registered types', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    
    // Clear any existing registrations for this test
    const existingTypes = BackendRegistry.getRegisteredTypes()
    
    BackendRegistry.register('test-backend-7', factory)
    BackendRegistry.register('test-backend-8', factory)
    
    const types = BackendRegistry.getRegisteredTypes()
    assert.ok(types.includes('test-backend-7'))
    assert.ok(types.includes('test-backend-8'))
    assert.ok(types.length >= 2)
  })

  await t.test('createBackend - creates backend from registered factory', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend-9', factory)
    
    const options: BackendOptions = { type: 'test-backend-9' }
    const backend = BackendRegistry.createBackend(options)
    
    assert.ok(backend instanceof InMemoryBackend)
    assert.strictEqual(backend.getType(), 'in-memory')
  })

  await t.test('createBackend - throws error for unregistered type', () => {
    const options: BackendOptions = { type: 'non-existent-backend' as any }
    
    assert.throws(() => {
      BackendRegistry.createBackend(options)
    }, /Backend type 'non-existent-backend' is not registered/)
  })

  await t.test('createBackend - includes available types in error message', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('available-backend', factory)
    
    const options: BackendOptions = { type: 'non-existent-backend' as any }
    
    try {
      BackendRegistry.createBackend(options)
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.ok(error.message.includes('non-existent-backend'))
      assert.ok(error.message.includes('available'))
    }
  })

  await t.test('createBackend - handles empty registry gracefully', () => {
    // Create a new registry instance by clearing existing registrations
    // Note: We can't actually clear the static registry, but we can test the error message
    const options: BackendOptions = { type: 'truly-non-existent-backend' as any }
    
    try {
      BackendRegistry.createBackend(options)
      assert.fail('Should have thrown an error')
    } catch (error: any) {
      assert.ok(error.message.includes('truly-non-existent-backend'))
    }
  })

  await t.test('createBackend - is case insensitive', () => {
    const factory: BackendFactory = () => new InMemoryBackend()
    BackendRegistry.register('test-backend-10', factory)
    
    const options1: BackendOptions = { type: 'TEST-BACKEND-10' as any }
    const options2: BackendOptions = { type: 'Test-Backend-10' as any }
    const options3: BackendOptions = { type: 'test-backend-10' }
    
    const backend1 = BackendRegistry.createBackend(options1)
    const backend2 = BackendRegistry.createBackend(options2)
    const backend3 = BackendRegistry.createBackend(options3)
    
    assert.ok(backend1 instanceof InMemoryBackend)
    assert.ok(backend2 instanceof InMemoryBackend)
    assert.ok(backend3 instanceof InMemoryBackend)
  })

  await t.test('detectBackendType - detects SQLite from .db extension', () => {
    const type = BackendRegistry.detectBackendType('/path/to/repo.db')
    assert.strictEqual(type, 'sqlite')
  })

  await t.test('detectBackendType - detects SQLite from .sqlite extension', () => {
    const type = BackendRegistry.detectBackendType('/path/to/repo.sqlite')
    assert.strictEqual(type, 'sqlite')
  })

  await t.test('detectBackendType - detects SQLite from .sqlite3 extension', () => {
    const type = BackendRegistry.detectBackendType('/path/to/repo.sqlite3')
    assert.strictEqual(type, 'sqlite')
  })

  await t.test('detectBackendType - defaults to filesystem for directory paths', () => {
    const type = BackendRegistry.detectBackendType('/path/to/repo')
    assert.strictEqual(type, 'filesystem')
  })

  await t.test('detectBackendType - defaults to filesystem for .git paths', () => {
    const type = BackendRegistry.detectBackendType('/path/to/repo.git')
    assert.strictEqual(type, 'filesystem')
  })

  await t.test('detectBackendType - defaults to filesystem for paths without extension', () => {
    const type = BackendRegistry.detectBackendType('/path/to/repo')
    assert.strictEqual(type, 'filesystem')
  })
})

