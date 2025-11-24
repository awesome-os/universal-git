import { describe, it } from 'node:test'
import assert from 'node:assert'
import { add, setConfig, status } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { STAGE } from '@awesome-os/universal-git-src/commands/STAGE.ts'
import { TREE } from '@awesome-os/universal-git-src/commands/TREE.ts'
import { _walk } from '@awesome-os/universal-git-src/commands/walk.ts'

describe('GitWalkerIndex', () => {
  it('should detect staged changes after add() with shared cache', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    
    // Set up user config
    await setConfig({ fs, dir, gitdir, path: 'user.name', value: 'test user' })
    await setConfig({ fs, dir, gitdir, path: 'user.email', value: 'test@example.com' })
    
    // Use a shared cache
    const cache = {}
    
    // Make changes and stage them - use unique content to ensure it differs from HEAD
    const uniqueContent = `staged changes - a - ${Date.now()}`
    await fs.write(`${dir}/a.txt`, uniqueContent)
    await fs.write(`${dir}/b.js`, `staged changes - b - ${Date.now()}`)
    await add({ fs, dir, gitdir, filepath: ['a.txt', 'b.js'], cache })
    
    // Verify files are staged
    const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt' })
    assert.strictEqual(aStatus, 'modified', `Expected 'modified', got '${aStatus}'`)
    
    const bStatus = await status({ fs, dir, gitdir, filepath: 'b.js' })
    assert.strictEqual(bStatus, 'modified', `Expected 'modified', got '${bStatus}'`)
    
    // Create STAGE walker and check what it sees
    // CRITICAL: Create Repository instance to pass to _walk
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    
    const stageWalker = STAGE()
    const entries: Array<{ filepath: string; headOid: string | null; stageOid: string | null }> = []
    
    await _walk({
      repo, // Pass Repository instance
      trees: [TREE({ ref: 'HEAD' }), stageWalker],
      map: async (filepath: string, [head, stage]: any[]) => {
        if (stage) {
          const headOid = head ? await head.oid() : null
          const stageOid = await stage.oid()
          if (!headOid || headOid !== stageOid) {
            entries.push({ filepath, headOid, stageOid })
          }
        }
        return undefined
      },
    })
    
    // Should see the staged changes
    assert.ok(entries.length > 0, 'STAGE walker should see staged changes')
    const aEntry = entries.find(e => e.filepath === 'a.txt')
    const bEntry = entries.find(e => e.filepath === 'b.js')
    assert.notStrictEqual(aEntry, undefined, 'STAGE walker should see a.txt')
    assert.notStrictEqual(bEntry, undefined, 'STAGE walker should see b.js')
  })

  it('should invalidate cache when index is written after walker creation', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-stash')
    
    // Set up user config
    await setConfig({ fs, dir, gitdir, path: 'user.name', value: 'test user' })
    await setConfig({ fs, dir, gitdir, path: 'user.email', value: 'test@example.com' })
    
    // Use a shared cache
    const cache = {}
    
    // CRITICAL: Create Repository instance to pass to _walk
    const { Repository } = await import('@awesome-os/universal-git-src/core-utils/Repository.ts')
    const repo = await Repository.open({ fs, dir, gitdir, cache, autoDetectConfig: true })
    
    // Create STAGE walker BEFORE staging changes
    const stageWalker = STAGE()
    
    // Now stage changes - use unique content to ensure it differs from HEAD
    const uniqueContent = `staged changes - a - ${Date.now()}`
    await fs.write(`${dir}/a.txt`, uniqueContent)
    await add({ fs, dir, gitdir, filepath: ['a.txt'], cache })
    
    // Verify file is staged
    const aStatus = await status({ fs, dir, gitdir, filepath: 'a.txt' })
    assert.strictEqual(aStatus, 'modified', `Expected 'modified', got '${aStatus}'`)
    
    // Now use the walker - it should see the staged changes
    const entries: Array<{ filepath: string; headOid: string | null; stageOid: string | null }> = []
    
    await _walk({
      repo, // Pass Repository instance
      trees: [TREE({ ref: 'HEAD' }), stageWalker],
      map: async (filepath: string, [head, stage]: any[]) => {
        if (stage) {
          const headOid = head ? await head.oid() : null
          const stageOid = await stage.oid()
          if (!headOid || headOid !== stageOid) {
            entries.push({ filepath, headOid, stageOid })
          }
        }
        return undefined
      },
    })
    
    // Should see the staged changes even though walker was created before staging
    const aEntry = entries.find(e => e.filepath === 'a.txt')
    assert.notStrictEqual(aEntry, undefined, 'STAGE walker should see a.txt even if created before staging')
  })
})

