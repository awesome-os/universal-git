import { describe, it } from 'node:test'
import assert from 'node:assert'
import { add, setConfig, status } from '@awesome-os/universal-git-src/index.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { STAGE } from '@awesome-os/universal-git-src/commands/STAGE.ts'
import { TREE } from '@awesome-os/universal-git-src/commands/TREE.ts'
import { _walk } from '@awesome-os/universal-git-src/commands/walk.ts'

describe('GitWalkerIndex', () => {
  it('should detect staged changes after add() with shared cache', async () => {
    const { repo } = await makeFixture('test-stash')
    
    // Set up user config
    await setConfig({ repo, path: 'user.name', value: 'test user' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    // Use a shared cache
    const cache = repo.cache
    
    // Make changes and stage them - use unique content to ensure it differs from HEAD
    const uniqueContent = `staged changes - a - ${Date.now()}`
    await repo.worktreeBackend?.write('a.txt', uniqueContent)
    await repo.worktreeBackend?.write('b.js', `staged changes - b - ${Date.now()}`)
    await add({ repo, filepath: ['a.txt', 'b.js'], cache })
    
    // Verify files are staged
    const aStatus = await status({ repo, filepath: 'a.txt' })
    assert.strictEqual(aStatus, 'modified', `Expected 'modified', got '${aStatus}'`)
    
    const bStatus = await status({ repo, filepath: 'b.js' })
    assert.strictEqual(bStatus, 'modified', `Expected 'modified', got '${bStatus}'`)
    
    const stageWalker = STAGE()
    const entries: Array<{ filepath: string; headOid: string | null; stageOid: string | null }> = []
    
    await _walk({
      gitBackend: repo.gitBackend,
      worktreeBackend: repo.worktreeBackend || undefined,
      cache: repo.cache,
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
    const { repo } = await makeFixture('test-stash')
    
    // Set up user config
    await setConfig({ repo, path: 'user.name', value: 'test user' })
    await setConfig({ repo, path: 'user.email', value: 'test@example.com' })
    
    // Use a shared cache
    const cache = repo.cache
    
    // Create STAGE walker BEFORE staging changes
    const stageWalker = STAGE()
    
    // Now stage changes - use unique content to ensure it differs from HEAD
    const uniqueContent = `staged changes - a - ${Date.now()}`
    await repo.worktreeBackend?.write('a.txt', uniqueContent)
    await add({ repo, filepath: ['a.txt'], cache })
    
    // Verify file is staged
    const aStatus = await status({ repo, filepath: 'a.txt' })
    assert.strictEqual(aStatus, 'modified', `Expected 'modified', got '${aStatus}'`)
    
    // Now use the walker - it should see the staged changes
    const entries: Array<{ filepath: string; headOid: string | null; stageOid: string | null }> = []
    
    await _walk({
      gitBackend: repo.gitBackend,
      worktreeBackend: repo.worktreeBackend || undefined,
      cache: repo.cache,
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

