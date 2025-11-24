import { test } from 'node:test'
import assert from 'node:assert'
import { ShallowManager } from '@awesome-os/universal-git-src/core-utils/refs/ShallowManager.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('ShallowManager', async (t) => {
  await t.test('ok:read-returns-empty-no-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oids = await ShallowManager.read({ fs, gitdir })
    
    assert.ok(oids instanceof Set)
    assert.strictEqual(oids.size, 0)
  })

  await t.test('ok:read-returns-OIDs-from-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write shallow file
    const oid1 = 'a'.repeat(40)
    const oid2 = 'b'.repeat(40)
    await fs.write(`${gitdir}/shallow`, `${oid1}\n${oid2}\n`, 'utf8')
    
    const oids = await ShallowManager.read({ fs, gitdir })
    
    assert.strictEqual(oids.size, 2)
    assert.ok(oids.has(oid1))
    assert.ok(oids.has(oid2))
  })

  await t.test('ok:read-filters-invalid-OIDs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write shallow file with valid and invalid OIDs
    const validOid = 'a'.repeat(40)
    await fs.write(`${gitdir}/shallow`, `${validOid}\ninvalid-oid\nshort\n${'c'.repeat(40)}\n`, 'utf8')
    
    const oids = await ShallowManager.read({ fs, gitdir })
    
    assert.strictEqual(oids.size, 2) // Only valid OIDs
    assert.ok(oids.has(validOid))
    assert.ok(oids.has('c'.repeat(40)))
  })

  await t.test('edge:read-empty-shallow-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write empty shallow file
    await fs.write(`${gitdir}/shallow`, '', 'utf8')
    
    const oids = await ShallowManager.read({ fs, gitdir })
    
    assert.strictEqual(oids.size, 0)
  })

  await t.test('edge:read-whitespace-only-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write whitespace-only shallow file
    await fs.write(`${gitdir}/shallow`, '   \n  \n', 'utf8')
    
    const oids = await ShallowManager.read({ fs, gitdir })
    
    assert.strictEqual(oids.size, 0)
  })

  await t.test('ok:read-trims-whitespace-OIDs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'a'.repeat(40)
    await fs.write(`${gitdir}/shallow`, `  ${oid}  \n`, 'utf8')
    
    const oids = await ShallowManager.read({ fs, gitdir })
    
    assert.strictEqual(oids.size, 1)
    assert.ok(oids.has(oid))
  })

  await t.test('ok:write-creates-shallow-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oids = new Set(['a'.repeat(40), 'b'.repeat(40)])
    await ShallowManager.write({ fs, gitdir, oids })
    
    const content = await fs.read(`${gitdir}/shallow`, 'utf8')
    const contentStr = typeof content === 'string' ? content : content.toString('utf8')
    const lines = contentStr.trim().split('\n')
    assert.strictEqual(lines.length, 2)
    assert.ok(lines.includes('a'.repeat(40)))
    assert.ok(lines.includes('b'.repeat(40)))
  })

  await t.test('write removes shallow file when OIDs set is empty', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create shallow file first
    await fs.write(`${gitdir}/shallow`, 'a'.repeat(40) + '\n', 'utf8')
    
    // Write empty set
    await ShallowManager.write({ fs, gitdir, oids: new Set() })
    
    // File should be removed
    const exists = await fs.exists(`${gitdir}/shallow`)
    assert.strictEqual(exists, false)
  })

  await t.test('write handles removing non-existent shallow file gracefully', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Try to remove shallow file that doesn't exist
    await ShallowManager.write({ fs, gitdir, oids: new Set() })
    
    // Should not throw
    assert.ok(true)
  })

  await t.test('write overwrites existing shallow file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Create initial shallow file
    await fs.write(`${gitdir}/shallow`, 'a'.repeat(40) + '\n', 'utf8')
    
    // Write new OIDs
    const newOids = new Set(['b'.repeat(40), 'c'.repeat(40)])
    await ShallowManager.write({ fs, gitdir, oids: newOids })
    
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

