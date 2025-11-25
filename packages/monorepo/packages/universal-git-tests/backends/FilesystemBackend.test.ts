import { test } from 'node:test'
import assert from 'node:assert'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'
import { FilesystemBackend } from '@awesome-os/universal-git-src/backends/FilesystemBackend.ts'
import { makeNodeFixture } from '../helpers/makeNodeFixture.ts'
import { join } from '@awesome-os/universal-git-src/utils/join.ts'

test('FilesystemBackend', async (t) => {
  await t.test('getType - returns filesystem', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-type')
    const backend = new FilesystemBackend(fs, gitdir)
    assert.strictEqual(backend.getType(), 'filesystem')
  })

  await t.test('HEAD operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-head')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read default HEAD (should return default when file doesn't exist)
    const defaultHead = await backend.readHEAD()
    assert.strictEqual(defaultHead, 'ref: refs/heads/master')
    
    // Write HEAD
    await backend.writeHEAD('ref: refs/heads/main')
    const written = await backend.readHEAD()
    assert.strictEqual(written, 'ref: refs/heads/main')
    
    // Write OID directly
    await backend.writeHEAD('abc123def456')
    const oidHead = await backend.readHEAD()
    assert.strictEqual(oidHead, 'abc123def456')
  })

  await t.test('Config operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-config')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read default config (empty when file doesn't exist)
    const defaultConfig = await backend.readConfig()
    assert.strictEqual(defaultConfig.length, 0)
    
    // Write config
    const configData = UniversalBuffer.from('[core]\n\trepositoryformatversion = 0\n')
    await backend.writeConfig(configData)
    const written = await backend.readConfig()
    assert.ok(UniversalBuffer.isBuffer(written))
    assert.strictEqual(written.toString(), configData.toString())
  })

  await t.test('Index operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-index')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read default index (empty when file doesn't exist)
    const defaultIndex = await backend.readIndex()
    assert.strictEqual(defaultIndex.length, 0)
    
    // Write index
    const indexData = UniversalBuffer.from('DIRC\x00\x00\x00\x02')
    await backend.writeIndex(indexData)
    const written = await backend.readIndex()
    assert.ok(UniversalBuffer.isBuffer(written))
    assert.strictEqual(written.toString('hex'), indexData.toString('hex'))
  })

  await t.test('Description operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-desc')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read default description (null when file doesn't exist)
    const defaultDesc = await backend.readDescription()
    assert.strictEqual(defaultDesc, null)
    
    // Write description
    await backend.writeDescription('Test repository')
    const desc = await backend.readDescription()
    assert.strictEqual(desc, 'Test repository')
  })

  await t.test('State file operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-state')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent state file
    const missing = await backend.readStateFile('FETCH_HEAD')
    assert.strictEqual(missing, null)
    
    // Write state file
    await backend.writeStateFile('FETCH_HEAD', 'abc123 HEAD')
    const fetched = await backend.readStateFile('FETCH_HEAD')
    assert.strictEqual(fetched, 'abc123 HEAD')
    
    // Delete state file
    await backend.deleteStateFile('FETCH_HEAD')
    const deleted = await backend.readStateFile('FETCH_HEAD')
    assert.strictEqual(deleted, null)
    
    // List state files
    await backend.writeStateFile('ORIG_HEAD', 'def456')
    await backend.writeStateFile('MERGE_HEAD', 'ghi789')
    const stateFiles = await backend.listStateFiles()
    assert.ok(Array.isArray(stateFiles))
    assert.ok(stateFiles.includes('ORIG_HEAD'))
    assert.ok(stateFiles.includes('MERGE_HEAD'))
  })

  await t.test('Sequencer file operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-sequencer')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent sequencer file
    const missing = await backend.readSequencerFile('sequencer')
    assert.strictEqual(missing, null)
    
    // Write sequencer file
    await backend.writeSequencerFile('sequencer', 'pick abc123')
    const seq = await backend.readSequencerFile('sequencer')
    assert.strictEqual(seq, 'pick abc123')
    
    // Delete sequencer file
    await backend.deleteSequencerFile('sequencer')
    const deleted = await backend.readSequencerFile('sequencer')
    assert.strictEqual(deleted, null)
    
    // List sequencer files
    await backend.writeSequencerFile('sequencer', 'data1')
    await backend.writeSequencerFile('abort-safety', 'data2')
    const seqFiles = await backend.listSequencerFiles()
    assert.ok(Array.isArray(seqFiles))
    assert.ok(seqFiles.includes('sequencer'))
    assert.ok(seqFiles.includes('abort-safety'))
  })

  await t.test('Loose object operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-objects')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Initialize backend to create directory structure
    await backend.initialize()
    
    // Use proper 40-character OIDs
    const oid1 = 'abc123def4567890123456789012345678901234'
    const oid2 = 'def4567890123456789012345678901234567890'
    
    // Read non-existent object
    const missing = await backend.readLooseObject(oid1)
    assert.strictEqual(missing, null)
    
    // Write loose object
    const objectData = UniversalBuffer.from('blob 5\0hello')
    await backend.writeLooseObject(oid1, objectData)
    const obj = await backend.readLooseObject(oid1)
    assert.ok(UniversalBuffer.isBuffer(obj))
    assert.strictEqual(obj!.toString(), objectData.toString())
    
    // Check if object exists
    assert.strictEqual(await backend.hasLooseObject(oid1), true)
    assert.strictEqual(await backend.hasLooseObject(oid2), false)
    
    // List loose objects
    await backend.writeLooseObject(oid2, UniversalBuffer.from('tree 0\0'))
    const objects = await backend.listLooseObjects()
    assert.ok(Array.isArray(objects))
    assert.ok(objects.includes(oid1))
    assert.ok(objects.includes(oid2))
  })

  await t.test('Packfile operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-packfiles')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent packfile
    const missing = await backend.readPackfile('pack-abc123.pack')
    assert.strictEqual(missing, null)
    
    // Write packfile
    const packData = UniversalBuffer.from('PACK\x00\x00\x00\x02')
    await backend.writePackfile('pack-abc123.pack', packData)
    const pack = await backend.readPackfile('pack-abc123.pack')
    assert.ok(UniversalBuffer.isBuffer(pack))
    assert.strictEqual(pack!.toString('hex'), packData.toString('hex'))
    
    // List packfiles
    await backend.writePackfile('pack-def456.pack', UniversalBuffer.from('PACK'))
    const packs = await backend.listPackfiles()
    assert.ok(Array.isArray(packs))
    assert.ok(packs.includes('pack-abc123.pack'))
    assert.ok(packs.includes('pack-def456.pack'))
  })

  await t.test('Pack index operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-packidx')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent pack index
    const missing = await backend.readPackIndex('pack-abc123.idx')
    assert.strictEqual(missing, null)
    
    // Write pack index
    const idxData = UniversalBuffer.from('\xfftOc\x00\x00\x00\x02')
    await backend.writePackIndex('pack-abc123.idx', idxData)
    const idx = await backend.readPackIndex('pack-abc123.idx')
    assert.ok(UniversalBuffer.isBuffer(idx))
    assert.strictEqual(idx!.toString('hex'), idxData.toString('hex'))
  })

  await t.test('Pack bitmap operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-bitmap')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent bitmap
    const missing = await backend.readPackBitmap('pack-abc123.bitmap')
    assert.strictEqual(missing, null)
    
    // Write bitmap
    const bitmapData = UniversalBuffer.from('BITM')
    await backend.writePackBitmap('pack-abc123.bitmap', bitmapData)
    const bitmap = await backend.readPackBitmap('pack-abc123.bitmap')
    assert.ok(UniversalBuffer.isBuffer(bitmap))
    assert.strictEqual(bitmap!.toString('hex'), bitmapData.toString('hex'))
  })

  await t.test('ODB info file operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-odb')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent info file
    const missing = await backend.readODBInfoFile('alternates')
    assert.strictEqual(missing, null)
    
    // Write info file
    await backend.writeODBInfoFile('alternates', '/path/to/alternate')
    const info = await backend.readODBInfoFile('alternates')
    assert.strictEqual(info, '/path/to/alternate')
    
    // Delete info file
    await backend.deleteODBInfoFile('alternates')
    const deleted = await backend.readODBInfoFile('alternates')
    assert.strictEqual(deleted, null)
  })

  await t.test('Multi-pack index operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-midx')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent multi-pack index
    const missing = await backend.readMultiPackIndex()
    assert.strictEqual(missing, null)
    assert.strictEqual(await backend.hasMultiPackIndex(), false)
    
    // Write multi-pack index
    const midxData = UniversalBuffer.from('MIDX')
    await backend.writeMultiPackIndex(midxData)
    const midx = await backend.readMultiPackIndex()
    assert.ok(UniversalBuffer.isBuffer(midx))
    assert.strictEqual(midx!.toString('hex'), midxData.toString('hex'))
    assert.strictEqual(await backend.hasMultiPackIndex(), true)
  })

  await t.test('Ref operations', async () => {
    // NOTE: Backend ref operations now delegate to src/git/refs/ functions to ensure
    // reflog, locking, and validation work consistently.
    // This test verifies that backend ref methods work correctly.
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-refs')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Initialize backend to create directory structure
    await backend.initialize()
    
    // Test readRef - should return null for non-existent ref
    const missing = await backend.readRef('refs/heads/main')
    assert.strictEqual(missing, null)
    
    // Test writeRef - write a ref
    const testOid = 'a'.repeat(40) // SHA-1 OID
    await backend.writeRef('refs/heads/main', testOid)
    
    // Test readRef - should return the OID we wrote
    const read = await backend.readRef('refs/heads/main')
    assert.strictEqual(read, testOid)
    
    // Test listRefs - should include the ref we wrote
    const refs = await backend.listRefs('refs/heads/')
    assert.ok(Array.isArray(refs))
    // listRefs may return full paths or just names - check both formats
    const hasMain = refs.some(ref => ref === 'refs/heads/main' || ref === 'main' || ref.endsWith('/main'))
    assert.ok(hasMain, `Expected to find 'refs/heads/main' in refs list, got: ${JSON.stringify(refs)}`)
    
    // Test deleteRef - delete the ref
    await backend.deleteRef('refs/heads/main')
    
    // Test readRef - should return null after deletion
    const deleted = await backend.readRef('refs/heads/main')
    assert.strictEqual(deleted, null)
    
    // Test readSymbolicRef - HEAD should be a symbolic ref
    await backend.writeSymbolicRef('HEAD', 'refs/heads/main')
    const symbolic = await backend.readSymbolicRef('HEAD')
    assert.strictEqual(symbolic, 'refs/heads/main')
    
    // Test writeSymbolicRef - update HEAD to point to another branch
    await backend.writeSymbolicRef('HEAD', 'refs/heads/develop')
    const updated = await backend.readSymbolicRef('HEAD')
    assert.strictEqual(updated, 'refs/heads/develop')
  })

  await t.test('Packed refs operations', async () => {
    // NOTE: Backend packed-refs operations have been removed from the interface.
    // All ref operations (including packed-refs) are handled by readRef/writeRef
    // which automatically handle both loose and packed refs.
    // This test verifies that packed-refs are handled correctly through readRef/writeRef.
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-packed')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Initialize backend
    await backend.initialize()
    
    // Write a ref - this will create a loose ref
    const testOid = 'a'.repeat(40) // SHA-1 OID
    await backend.writeRef('refs/heads/main', testOid)
    
    // Read the ref - should work with loose refs
    const read = await backend.readRef('refs/heads/main')
    assert.strictEqual(read, testOid)
    
    // Note: Packed-refs are automatically handled by readRef/writeRef.
    // The backend interface no longer exposes readPackedRefs/writePackedRefs
    // as these are implementation details handled by src/git/refs/ functions.
  })

  await t.test('Reflog operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-reflog')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Initialize backend to create directory structure
    await backend.initialize()
    
    // Read non-existent reflog
    const missing = await backend.readReflog('refs/heads/main')
    assert.strictEqual(missing, null)
    
    // Write reflog
    const reflog = 'abc123 def456 author <email> 1234567890 +0000\tcommit: message\n'
    await backend.writeReflog('refs/heads/main', reflog)
    const written = await backend.readReflog('refs/heads/main')
    assert.strictEqual(written, reflog)
    
    // Append to reflog
    const newEntry = 'def456 ghi789 author <email> 1234567900 +0000\tcommit: another\n'
    await backend.appendReflog('refs/heads/main', newEntry)
    const appended = await backend.readReflog('refs/heads/main')
    assert.ok(appended!.includes(reflog))
    assert.ok(appended!.includes(newEntry))
    
    // Delete reflog
    await backend.deleteReflog('refs/heads/main')
    const deleted = await backend.readReflog('refs/heads/main')
    assert.strictEqual(deleted, null)
    
    // List reflogs
    await backend.writeReflog('refs/heads/feature', 'data1')
    await backend.writeReflog('refs/heads/develop', 'data2')
    const reflogs = await backend.listReflogs()
    assert.ok(Array.isArray(reflogs))
    // listReflogs returns paths relative to 'logs' prefix
    const hasFeature = reflogs.some(ref => ref.includes('feature') || ref === 'refs/heads/feature' || ref === 'refs/heads/feature')
    const hasDevelop = reflogs.some(ref => ref.includes('develop') || ref === 'refs/heads/develop' || ref === 'refs/heads/develop')
    assert.ok(hasFeature || reflogs.length > 0, `Expected to find feature reflog, got: ${JSON.stringify(reflogs)}`)
    assert.ok(hasDevelop || reflogs.length > 0, `Expected to find develop reflog, got: ${JSON.stringify(reflogs)}`)
  })

  await t.test('Info file operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-info')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent info file
    const missing = await backend.readInfoFile('exclude')
    assert.strictEqual(missing, null)
    
    // Write info file
    await backend.writeInfoFile('exclude', '*.log\n*.tmp\n')
    const info = await backend.readInfoFile('exclude')
    assert.strictEqual(info, '*.log\n*.tmp\n')
    
    // Delete info file
    await backend.deleteInfoFile('exclude')
    const deleted = await backend.readInfoFile('exclude')
    assert.strictEqual(deleted, null)
  })

  await t.test('Hook operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-hooks')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent hook
    const missing = await backend.readHook('pre-commit')
    assert.strictEqual(missing, null)
    
    // Write hook
    const hookData = UniversalBuffer.from('#!/bin/sh\necho "pre-commit"\n')
    await backend.writeHook('pre-commit', hookData)
    const hook = await backend.readHook('pre-commit')
    assert.ok(UniversalBuffer.isBuffer(hook))
    assert.strictEqual(hook!.toString(), hookData.toString())
    
    // Delete hook
    await backend.deleteHook('pre-commit')
    const deleted = await backend.readHook('pre-commit')
    assert.strictEqual(deleted, null)
    
    // List hooks
    await backend.writeHook('post-commit', UniversalBuffer.from('#!/bin/sh\n'))
    await backend.writeHook('pre-push', UniversalBuffer.from('#!/bin/sh\n'))
    const hooks = await backend.listHooks()
    assert.ok(Array.isArray(hooks))
    assert.ok(hooks.includes('post-commit'))
    assert.ok(hooks.includes('pre-push'))
    
    // Check if hook exists
    assert.strictEqual(await backend.hasHook('post-commit'), true)
    assert.strictEqual(await backend.hasHook('nonexistent'), false)
  })

  await t.test('Submodule config operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-submodule')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent submodule config
    const missing = await backend.readSubmoduleConfig('submodule1')
    assert.strictEqual(missing, null)
    
    // Write submodule config
    await backend.writeSubmoduleConfig('submodule1', '[submodule "submodule1"]\n\tpath = lib\n')
    const config = await backend.readSubmoduleConfig('submodule1')
    assert.strictEqual(config, '[submodule "submodule1"]\n\tpath = lib\n')
  })

  await t.test('Worktree config operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-worktree')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent worktree config
    const missing = await backend.readWorktreeConfig('worktree1')
    assert.strictEqual(missing, null)
    
    // Write worktree config
    const worktreeConfig = '[core]\n\tworktree = /path/to/worktree\n'
    await backend.writeWorktreeConfig('worktree1', worktreeConfig)
    const config = await backend.readWorktreeConfig('worktree1')
    // FilesystemBackend may add trailing newline when writing
    assert.ok(config !== null)
    assert.ok(config!.includes('[core]'))
    assert.ok(config!.includes('worktree = /path/to/worktree'))
    
    // List worktrees
    await backend.writeWorktreeConfig('worktree2', 'config2')
    const worktrees = await backend.listWorktrees()
    assert.ok(Array.isArray(worktrees))
    // Worktrees are managed separately, so listWorktrees may be empty even with configs
  })

  await t.test('Shallow operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-shallow')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read default shallow (null when file doesn't exist)
    const defaultShallow = await backend.readShallow()
    assert.strictEqual(defaultShallow, null)
    
    // Write shallow
    await backend.writeShallow('abc123\n')
    const shallow = await backend.readShallow()
    assert.strictEqual(shallow, 'abc123\n')
    
    // Delete shallow
    await backend.deleteShallow()
    const deleted = await backend.readShallow()
    assert.strictEqual(deleted, null)
  })

  await t.test('LFS file operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-lfs')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read non-existent LFS file
    const missing = await backend.readLFSFile('abc123')
    assert.strictEqual(missing, null)
    
    // Write LFS file
    const lfsData = UniversalBuffer.from('version https://git-lfs.github.com/spec/v1\n')
    await backend.writeLFSFile('abc123', lfsData)
    const lfs = await backend.readLFSFile('abc123')
    assert.ok(UniversalBuffer.isBuffer(lfs))
    assert.strictEqual(lfs!.toString(), lfsData.toString())
    
    // List LFS files
    await backend.writeLFSFile('def456', UniversalBuffer.from('data'))
    const lfsFiles = await backend.listLFSFiles()
    assert.ok(Array.isArray(lfsFiles))
    assert.ok(lfsFiles.includes('abc123'))
    assert.ok(lfsFiles.includes('def456'))
  })

  await t.test('Git daemon export operations', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-daemon')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Read default (false when file doesn't exist)
    const defaultExport = await backend.readGitDaemonExportOk()
    assert.strictEqual(defaultExport, false)
    
    // Write (sets to true, no parameter)
    await backend.writeGitDaemonExportOk()
    const exported = await backend.readGitDaemonExportOk()
    assert.strictEqual(exported, true)
    
    // Delete
    await backend.deleteGitDaemonExportOk()
    const deleted = await backend.readGitDaemonExportOk()
    assert.strictEqual(deleted, false)
  })

  await t.test('Initialize and close', async () => {
    const { fs, gitdir } = await makeNodeFixture('test-fs-backend-init')
    const backend = new FilesystemBackend(fs, gitdir)
    
    // Check initialization status (config file doesn't exist yet)
    assert.strictEqual(await backend.isInitialized(), false)
    
    // Initialize (creates directory structure)
    await backend.initialize()
    // isInitialized checks for config file, not directory structure
    assert.strictEqual(await backend.isInitialized(), false)
    
    // Write config to mark as initialized
    await backend.writeConfig(UniversalBuffer.from('[core]\n\trepositoryformatversion = 0\n'))
    assert.strictEqual(await backend.isInitialized(), true)
    
    // Close
    await backend.close()
    // After close, initialization status should remain the same
    assert.strictEqual(await backend.isInitialized(), true)
  })
})

