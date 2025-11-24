import { test } from 'node:test'
import assert from 'node:assert'
import { TREE, WORKDIR, STAGE } from '@awesome-os/universal-git-src/index.ts'
import { GitWalkSymbol } from '@awesome-os/universal-git-src/utils/symbols.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { Repository } from '@awesome-os/universal-git-src/core-utils/Repository.ts'
import type { Walker, WalkerEntry } from '@awesome-os/universal-git-src/models/Walker.ts'
import { 
  WalkerFactory,
  WalkerMap,
  WalkerMapWithNulls,
  WalkerMapFiltered,
  WalkerReduce,
  WalkerReduceTree,
  WalkerReduceFlat,
  WalkerIterate,
} from '@awesome-os/universal-git-src/models/Walker.ts'
import { walk } from '@awesome-os/universal-git-src/commands/walk.ts'

test('Walker types', async (t) => {
  await t.test('ok:TREE-returns-Walker-GitWalkSymbol', async () => {
    const walker = TREE({ ref: 'HEAD' })
    
    // Walker should have GitWalkSymbol property
    assert.ok(GitWalkSymbol in walker, 'Walker should have GitWalkSymbol')
    
    // Walker should be frozen
    assert.throws(() => {
      ;(walker as any).newProp = 'test'
    }, /Cannot add property|Cannot define property/)
  })

  await t.test('ok:WORKDIR-returns-Walker-GitWalkSymbol', async () => {
    const walker = WORKDIR()
    
    // Walker should have GitWalkSymbol property
    assert.ok(GitWalkSymbol in walker, 'Walker should have GitWalkSymbol')
    
    // Walker should be frozen
    assert.throws(() => {
      ;(walker as any).newProp = 'test'
    }, /Cannot add property|Cannot define property/)
  })

  await t.test('ok:STAGE-returns-Walker-GitWalkSymbol', async () => {
    const walker = STAGE()
    
    // Walker should have GitWalkSymbol property
    assert.ok(GitWalkSymbol in walker, 'Walker should have GitWalkSymbol')
    
    // Walker should be frozen
    assert.throws(() => {
      ;(walker as any).newProp = 'test'
    }, /Cannot add property|Cannot define property/)
  })

  await t.test('ok:TREE-resolves-GitWalkerRepo', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = TREE({ ref: 'HEAD' })
    const instance = await walker[GitWalkSymbol]({ repo })
    
    // Should return an instance with readdir method
    assert.ok(instance, 'Should return an instance')
    assert.ok(typeof (instance as any).readdir === 'function', 'Should have readdir method')
    assert.ok(typeof (instance as any).type === 'function', 'Should have type method')
    assert.ok(typeof (instance as any).mode === 'function', 'Should have mode method')
    assert.ok(typeof (instance as any).oid === 'function', 'Should have oid method')
    assert.ok(typeof (instance as any).content === 'function', 'Should have content method')
    assert.ok(typeof (instance as any).stat === 'function', 'Should have stat method')
    assert.ok((instance as any).ConstructEntry, 'Should have ConstructEntry')
  })

  await t.test('ok:WORKDIR-resolves-GitWalkerFs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = WORKDIR()
    const instance = await walker[GitWalkSymbol]({ repo })
    
    // Should return an instance with readdir method
    assert.ok(instance, 'Should return an instance')
    assert.ok(typeof (instance as any).readdir === 'function', 'Should have readdir method')
    assert.ok(typeof (instance as any).type === 'function', 'Should have type method')
    assert.ok(typeof (instance as any).mode === 'function', 'Should have mode method')
    assert.ok(typeof (instance as any).oid === 'function', 'Should have oid method')
    assert.ok(typeof (instance as any).content === 'function', 'Should have content method')
    assert.ok(typeof (instance as any).stat === 'function', 'Should have stat method')
    assert.ok((instance as any).ConstructEntry, 'Should have ConstructEntry')
  })

  await t.test('ok:STAGE-resolves-GitWalkerIndex', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = STAGE()
    const instance = await walker[GitWalkSymbol]({ repo })
    
    // Should return an instance with readdir method
    assert.ok(instance, 'Should return an instance')
    assert.ok(typeof (instance as any).readdir === 'function', 'Should have readdir method')
    assert.ok(typeof (instance as any).type === 'function', 'Should have type method')
    assert.ok(typeof (instance as any).mode === 'function', 'Should have mode method')
    assert.ok(typeof (instance as any).oid === 'function', 'Should have oid method')
    assert.ok(typeof (instance as any).content === 'function', 'Should have content method')
    assert.ok(typeof (instance as any).stat === 'function', 'Should have stat method')
    assert.ok((instance as any).ConstructEntry, 'Should have ConstructEntry')
  })

  await t.test('error:WORKDIR-bare-repository', async () => {
    const { fs, gitdir } = await makeFixture('test-walk')
    // Create a bare repository (no dir)
    const repo = await Repository.open({ fs, dir: undefined, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = WORKDIR()
    
    await assert.rejects(
      async () => {
        await walker[GitWalkSymbol]({ repo })
      },
      /Cannot create WORKDIR walker for bare repository/
    )
  })

  await t.test('ok:TREE-different-refs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    // Test with HEAD
    const headWalker = TREE({ ref: 'HEAD' })
    const headInstance = await headWalker[GitWalkSymbol]({ repo })
    assert.ok(headInstance, 'Should return instance for HEAD')
    
    // Test with explicit HEAD
    const explicitHeadWalker = TREE({ ref: 'HEAD' })
    const explicitHeadInstance = await explicitHeadWalker[GitWalkSymbol]({ repo })
    assert.ok(explicitHeadInstance, 'Should return instance for explicit HEAD')
    
    // Test with default (should default to HEAD)
    const defaultWalker = TREE()
    const defaultInstance = await defaultWalker[GitWalkSymbol]({ repo })
    assert.ok(defaultInstance, 'Should return instance for default ref')
  })
})

test('WalkerEntry interface', async (t) => {
  await t.test('ok:WalkerEntry-TREE-required-methods', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = TREE({ ref: 'HEAD' })
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    const entry = new EntryClass('.')
    
    // Check all WalkerEntry methods exist
    assert.ok(typeof entry.type === 'function', 'Should have type method')
    assert.ok(typeof entry.mode === 'function', 'Should have mode method')
    assert.ok(typeof entry.oid === 'function', 'Should have oid method')
    assert.ok(typeof entry.content === 'function', 'Should have content method')
    assert.ok(typeof entry.stat === 'function', 'Should have stat method')
    
    // Test that methods return promises
    const typePromise = entry.type()
    assert.ok(typePromise instanceof Promise, 'type() should return a Promise')
    
    const modePromise = entry.mode()
    assert.ok(modePromise instanceof Promise, 'mode() should return a Promise')
    
    const oidPromise = entry.oid()
    assert.ok(oidPromise instanceof Promise, 'oid() should return a Promise')
    
    const contentPromise = entry.content()
    assert.ok(contentPromise instanceof Promise, 'content() should return a Promise')
    
    const statPromise = entry.stat()
    assert.ok(statPromise instanceof Promise, 'stat() should return a Promise')
  })

  await t.test('ok:WalkerEntry-WORKDIR-required-methods', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = WORKDIR()
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    const entry = new EntryClass('.')
    
    // Check all WalkerEntry methods exist
    assert.ok(typeof entry.type === 'function', 'Should have type method')
    assert.ok(typeof entry.mode === 'function', 'Should have mode method')
    assert.ok(typeof entry.oid === 'function', 'Should have oid method')
    assert.ok(typeof entry.content === 'function', 'Should have content method')
    assert.ok(typeof entry.stat === 'function', 'Should have stat method')
    
    // Test that methods return promises
    const typePromise = entry.type()
    assert.ok(typePromise instanceof Promise, 'type() should return a Promise')
    
    const modePromise = entry.mode()
    assert.ok(modePromise instanceof Promise, 'mode() should return a Promise')
    
    const oidPromise = entry.oid()
    assert.ok(oidPromise instanceof Promise, 'oid() should return a Promise')
    
    const contentPromise = entry.content()
    assert.ok(contentPromise instanceof Promise, 'content() should return a Promise')
    
    const statPromise = entry.stat()
    assert.ok(statPromise instanceof Promise, 'stat() should return a Promise')
  })

  await t.test('ok:WalkerEntry-STAGE-required-methods', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = STAGE()
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    const entry = new EntryClass('.')
    
    // Check all WalkerEntry methods exist
    assert.ok(typeof entry.type === 'function', 'Should have type method')
    assert.ok(typeof entry.mode === 'function', 'Should have mode method')
    assert.ok(typeof entry.oid === 'function', 'Should have oid method')
    assert.ok(typeof entry.content === 'function', 'Should have content method')
    assert.ok(typeof entry.stat === 'function', 'Should have stat method')
    
    // Test that methods return promises
    const typePromise = entry.type()
    assert.ok(typePromise instanceof Promise, 'type() should return a Promise')
    
    const modePromise = entry.mode()
    assert.ok(modePromise instanceof Promise, 'mode() should return a Promise')
    
    const oidPromise = entry.oid()
    assert.ok(oidPromise instanceof Promise, 'oid() should return a Promise')
    
    const contentPromise = entry.content()
    assert.ok(contentPromise instanceof Promise, 'content() should return a Promise')
    
    const statPromise = entry.stat()
    assert.ok(statPromise instanceof Promise, 'stat() should return a Promise')
  })

  await t.test('ok:WalkerEntry-type-returns-valid', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = TREE({ ref: 'HEAD' })
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    const rootEntry = new EntryClass('.')
    const type = await rootEntry.type()
    
    assert.ok(['tree', 'blob', 'special', 'commit'].includes(type), `Type should be one of: tree, blob, special, commit, got: ${type}`)
    assert.strictEqual(type, 'tree', 'Root entry should be a tree')
  })

  await t.test('ok:WalkerEntry-oid-returns-valid-tree', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = TREE({ ref: 'HEAD' })
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    const rootEntry = new EntryClass('.')
    const oid = await rootEntry.oid()
    
    // OID should be a 40-character hex string
    assert.ok(typeof oid === 'string', 'OID should be a string')
    assert.strictEqual(oid.length, 40, 'OID should be 40 characters')
    assert.ok(/^[0-9a-f]{40}$/i.test(oid), 'OID should be hexadecimal')
  })

  await t.test('ok:WalkerEntry-readdir-returns-children', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = TREE({ ref: 'HEAD' })
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    const rootEntry = new EntryClass('.')
    const children = await (instance as any).readdir(rootEntry)
    
    assert.ok(Array.isArray(children) || children === null, 'readdir should return array or null')
    if (children) {
      assert.ok(children.length > 0, 'Root should have children')
      // All children should be strings (filepaths)
      for (const child of children) {
        assert.ok(typeof child === 'string', 'Children should be strings')
      }
    }
  })

  await t.test('ok:WalkerEntry-readdir-returns-null-blob', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = TREE({ ref: 'HEAD' })
    const instance = await walker[GitWalkSymbol]({ repo })
    const EntryClass = (instance as any).ConstructEntry
    
    // Find a blob entry
    const rootEntry = new EntryClass('.')
    const children = await (instance as any).readdir(rootEntry)
    
    if (children && children.length > 0) {
      // Try to find a file (blob) entry
      for (const childPath of children) {
        const childEntry = new EntryClass(childPath)
        const type = await childEntry.type()
        if (type === 'blob') {
          const blobChildren = await (instance as any).readdir(childEntry)
          assert.strictEqual(blobChildren, null, 'readdir should return null for blob')
          break
        }
      }
    }
  })
})

test('WalkerFactory', async (t) => {
  await t.test('ok:WalkerFactory-from-creates-Walker', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const walker = WalkerFactory.from(async ({ repo }) => {
      const { GitWalkerRepo } = await import('@awesome-os/universal-git-src/models/GitWalkerRepo.ts')
      const gitdir = await repo.getGitdir()
      return new GitWalkerRepo({ fs: repo.fs, gitdir, ref: 'HEAD', cache: repo.cache })
    })
    
    assert.ok(GitWalkSymbol in walker, 'Should have GitWalkSymbol')
    const instance = await walker[GitWalkSymbol]({ repo })
    assert.ok(instance, 'Should return an instance')
  })

  await t.test('ok:WalkerFactory-tree-creates-TREE', async () => {
    const walker = WalkerFactory.tree({ ref: 'HEAD' })
    assert.ok(GitWalkSymbol in walker, 'Should have GitWalkSymbol')
    
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    const instance = await walker[GitWalkSymbol]({ repo })
    assert.ok(instance, 'Should return an instance')
  })

  await t.test('ok:WalkerFactory-workdir-creates-WORKDIR', async () => {
    const walker = WalkerFactory.workdir()
    assert.ok(GitWalkSymbol in walker, 'Should have GitWalkSymbol')
    
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    const instance = await walker[GitWalkSymbol]({ repo })
    assert.ok(instance, 'Should return an instance')
  })

  await t.test('ok:WalkerFactory-stage-creates-STAGE', async () => {
    const walker = WalkerFactory.stage()
    assert.ok(GitWalkSymbol in walker, 'Should have GitWalkSymbol')
    
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    const instance = await walker[GitWalkSymbol]({ repo })
    assert.ok(instance, 'Should return an instance')
  })
})

test('Walker wrapper functions', async (t) => {
  await t.test('WalkerMapWithNulls handles null entries', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const map = WalkerMapWithNulls(async (filepath: string, [head, stage]: (WalkerEntry | null)[]): Promise<string | undefined> => {
      if (!head && !stage) return undefined
      return filepath
    })
    
    const result = await walk({
      repo,
      trees: [TREE({ ref: 'HEAD' }), STAGE()],
      map,
    })
    
    assert.ok(Array.isArray(result), 'Should return an array')
  })

  await t.test('WalkerMapFiltered filters undefined results', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const map = WalkerMapFiltered(async (filepath: string, entries: WalkerEntry[]): Promise<string | undefined> => {
      // Return undefined for some files
      if (filepath.includes('test')) return undefined
      return filepath
    })
    
    const result = await walk({
      repo,
      trees: [TREE({ ref: 'HEAD' })],
      map,
    })
    
    assert.ok(Array.isArray(result), 'Should return an array')
  })

  await t.test('WalkerReduceTree filters undefined children', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const reduce = WalkerReduceTree(async (parent: string | undefined, children: string[]): Promise<string | undefined> => {
      if (!parent && children.length === 0) return undefined
      return parent || children.join(',')
    })
    
    const result = await walk({
      repo,
      trees: [TREE({ ref: 'HEAD' })],
      map: async (filepath: string) => filepath,
      reduce,
    })
    
    assert.ok(result !== undefined, 'Should return a result')
  })

  await t.test('WalkerReduceFlat flattens results', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const reduce = WalkerReduceFlat()
    
    const result = await walk({
      repo,
      trees: [TREE({ ref: 'HEAD' })],
      map: async (filepath: string) => filepath,
      reduce,
    })
    
    assert.ok(Array.isArray(result), 'Should return an array')
    assert.ok(result.length > 0, 'Should have results')
  })

  await t.test('WalkerIterate wraps iteration function', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-walk')
    const repo = await Repository.open({ fs, dir, gitdir, cache: {}, autoDetectConfig: true })
    
    const iterate = WalkerIterate(async (walk, children) => {
      return Promise.all([...children].map(walk))
    })
    
    const result = await walk({
      repo,
      trees: [TREE({ ref: 'HEAD' })],
      map: async (filepath: string) => filepath,
      iterate,
    })
    
    assert.ok(Array.isArray(result), 'Should return an array')
  })
})

