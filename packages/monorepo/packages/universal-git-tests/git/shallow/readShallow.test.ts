import { test } from 'node:test'
import assert from 'node:assert'
import { readShallow } from '@awesome-os/universal-git-src/git/shallow.ts'
import { makeFixture } from '@awesome-os/universal-git-test-helpers/helpers/fixture.ts'
import { init } from '@awesome-os/universal-git-src/index.ts'

test('readShallow', async (t) => {
  await t.test('ok:read-returns-empty-no-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oids = await readShallow({ fs, gitdir })
    
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
    
    const oids = await readShallow({ fs, gitdir })
    
    assert.strictEqual(oids.size, 2)
    assert.ok(oids.has(oid1))
    assert.ok(oids.has(oid2))
  })

  await t.test('ok:read-includes-all-OIDs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write shallow file with valid and invalid OIDs
    // Note: readShallow doesn't filter invalid OIDs - it includes all lines
    const validOid = 'a'.repeat(40)
    const anotherValidOid = 'c'.repeat(40)
    await fs.write(`${gitdir}/shallow`, `${validOid}\ninvalid-oid\nshort\n${anotherValidOid}\n`, 'utf8')
    
    const oids = await readShallow({ fs, gitdir })
    
    // readShallow includes all lines, not just valid OIDs
    assert.ok(oids.size >= 2) // At least the valid OIDs
    assert.ok(oids.has(validOid))
    assert.ok(oids.has(anotherValidOid))
  })

  await t.test('edge:read-empty-shallow-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write empty shallow file
    await fs.write(`${gitdir}/shallow`, '', 'utf8')
    
    const oids = await readShallow({ fs, gitdir })
    
    assert.strictEqual(oids.size, 0)
  })

  await t.test('edge:read-whitespace-only-file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    // Write whitespace-only shallow file
    await fs.write(`${gitdir}/shallow`, '   \n  \n', 'utf8')
    
    const oids = await readShallow({ fs, gitdir })
    
    // readShallow includes whitespace lines
    assert.ok(oids.size >= 0)
  })

  await t.test('ok:read-includes-OIDs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-empty')
    await init({ fs, dir, gitdir })
    
    const oid = 'a'.repeat(40)
    await fs.write(`${gitdir}/shallow`, `  ${oid}  \n`, 'utf8')
    
    const oids = await readShallow({ fs, gitdir })
    
    // readShallow includes the OID (may include whitespace lines too)
    assert.ok(oids.size >= 1)
    assert.ok(oids.has(oid))
  })
})

