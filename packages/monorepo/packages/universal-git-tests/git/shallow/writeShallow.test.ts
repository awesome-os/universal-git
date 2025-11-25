import { test } from 'node:test'
import assert from 'node:assert'
import { writeShallow } from '@awesome-os/universal-git-src/git/shallow.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('writeShallow', async (t) => {
  await t.test('ok:write-creates-shallow-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oids = new Set(['a'.repeat(40), 'b'.repeat(40)])
    await writeShallow({ fs, gitdir, oids })
    
    const content = await fs.read(`${gitdir}/shallow`, 'utf8')
    const contentStr = typeof content === 'string' ? content : content.toString('utf8')
    const lines = contentStr.trim().split('\n')
    assert.strictEqual(lines.length, 2)
    assert.ok(lines.includes('a'.repeat(40)))
    assert.ok(lines.includes('b'.repeat(40)))
  })

  await t.test('ok:write-removes-shallow-file-when-empty', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create shallow file first
    await fs.write(`${gitdir}/shallow`, 'a'.repeat(40) + '\n', 'utf8')
    
    // Write empty set
    await writeShallow({ fs, gitdir, oids: new Set() })
    
    // File should be removed
    const exists = await fs.exists(`${gitdir}/shallow`)
    assert.strictEqual(exists, false)
  })

  await t.test('ok:write-handles-removing-non-existent-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Try to remove shallow file that doesn't exist
    await writeShallow({ fs, gitdir, oids: new Set() })
    
    // Should not throw
    assert.ok(true)
  })

  await t.test('ok:write-overwrites-existing-shallow-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create initial shallow file
    await fs.write(`${gitdir}/shallow`, 'a'.repeat(40) + '\n', 'utf8')
    
    // Write new OIDs
    const newOids = new Set(['b'.repeat(40), 'c'.repeat(40)])
    await writeShallow({ fs, gitdir, oids: newOids })
    
    // Verify file was overwritten
    const content = await fs.read(`${gitdir}/shallow`, 'utf8')
    const contentStr = typeof content === 'string' ? content : content.toString('utf8')
    const lines = contentStr.trim().split('\n')
    assert.strictEqual(lines.length, 2)
    assert.ok(lines.includes('b'.repeat(40)))
    assert.ok(lines.includes('c'.repeat(40)))
    assert.ok(!lines.includes('a'.repeat(40)))
  })
})

