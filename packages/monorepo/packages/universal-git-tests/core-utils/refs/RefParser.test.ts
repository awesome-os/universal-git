import { test } from 'node:test'
import assert from 'node:assert'
import { 
  parsePackedRefs, 
  parseLooseRef, 
  serializePackedRefs, 
  serializeLooseRef 
} from '@awesome-os/universal-git-src/core-utils/refs/RefParser.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

test('parseLooseRef', async (t) => {
  await t.test('parses symbolic ref', () => {
    const buffer = UniversalBuffer.from('ref: refs/heads/master\n', 'utf8')
    const result = parseLooseRef(buffer)
    
    assert.strictEqual(result.symbolic, true)
    assert.strictEqual(result.target, 'refs/heads/master')
    assert.strictEqual(result.oid, undefined)
  })

  await t.test('parses SHA-1 OID ref', () => {
    const oid = 'a'.repeat(40)
    const buffer = UniversalBuffer.from(oid + '\n', 'utf8')
    const result = parseLooseRef(buffer)
    
    assert.strictEqual(result.symbolic, false)
    assert.strictEqual(result.oid, oid)
    assert.strictEqual(result.target, undefined)
  })

  await t.test('parses SHA-256 OID ref', () => {
    const oid = 'a'.repeat(64)
    const buffer = UniversalBuffer.from(oid + '\n', 'utf8')
    const result = parseLooseRef(buffer)
    
    assert.strictEqual(result.symbolic, false)
    assert.strictEqual(result.oid, oid)
  })

  await t.test('parses ref from string', () => {
    const result = parseLooseRef('ref: refs/heads/develop')
    
    assert.strictEqual(result.symbolic, true)
    assert.strictEqual(result.target, 'refs/heads/develop')
  })

  await t.test('trims whitespace from ref', () => {
    const buffer = UniversalBuffer.from('  ref: refs/heads/master  \n', 'utf8')
    const result = parseLooseRef(buffer)
    
    assert.strictEqual(result.symbolic, true)
    assert.strictEqual(result.target, 'refs/heads/master')
  })

  await t.test('throws error for invalid ref format', () => {
    assert.throws(
      () => {
        parseLooseRef(UniversalBuffer.from('invalid-ref\n', 'utf8'))
      },
      (error: any) => {
        return error instanceof Error && 
               error.message.includes('Invalid ref format')
      }
    )
  })

  await t.test('throws error for OID with wrong length', () => {
    assert.throws(
      () => {
        parseLooseRef(UniversalBuffer.from('a'.repeat(30) + '\n', 'utf8'))
      },
      (error: any) => {
        return error instanceof Error && 
               error.message.includes('Invalid ref format')
      }
    )
  })

  await t.test('throws error for non-hex OID', () => {
    assert.throws(
      () => {
        parseLooseRef(UniversalBuffer.from('g'.repeat(40) + '\n', 'utf8'))
      },
      (error: any) => {
        return error instanceof Error && 
               error.message.includes('Invalid ref format')
      }
    )
  })
})

test('serializeLooseRef', async (t) => {
  await t.test('serializes symbolic ref', () => {
    const ref = {
      symbolic: true,
      target: 'refs/heads/master',
    }
    
    const buffer = serializeLooseRef(ref)
    const text = buffer.toString('utf8')
    
    assert.strictEqual(text, 'ref: refs/heads/master\n')
  })

  await t.test('serializes OID ref', () => {
    const oid = 'a'.repeat(40)
    const ref = {
      symbolic: false,
      oid: oid,
    }
    
    const buffer = serializeLooseRef(ref)
    const text = buffer.toString('utf8')
    
    assert.strictEqual(text, oid + '\n')
  })

  await t.test('throws error when ref has neither oid nor target', () => {
    assert.throws(
      () => {
        serializeLooseRef({
          symbolic: false,
        } as any)
      },
      (error: any) => {
        return error instanceof Error && 
               error.message.includes('Invalid ref: must have either oid or target')
      }
    )
  })

  await t.test('throws error when symbolic ref has no target', () => {
    assert.throws(
      () => {
        serializeLooseRef({
          symbolic: true,
        } as any)
      },
      (error: any) => {
        return error instanceof Error && 
               error.message.includes('Invalid ref: must have either oid or target')
      }
    )
  })
})

test('serializePackedRefs', async (t) => {
  await t.test('serializes packed refs', () => {
    const refs = new Map<string, string>()
    refs.set('refs/heads/master', 'a'.repeat(40))
    refs.set('refs/heads/develop', 'b'.repeat(40))
    
    const buffer = serializePackedRefs(refs)
    const text = buffer.toString('utf8')
    
    assert.ok(text.includes('refs/heads/develop'))
    assert.ok(text.includes('refs/heads/master'))
    assert.ok(text.endsWith('\n'))
  })

  await t.test('serializes peeled tags with ^ prefix', () => {
    const refs = new Map<string, string>()
    refs.set('refs/tags/v1.0', 'a'.repeat(40))
    refs.set('refs/tags/v1.0^{}', 'b'.repeat(40))
    
    const buffer = serializePackedRefs(refs)
    const text = buffer.toString('utf8')
    
    // Peeled tag should come after the tag and have ^ prefix
    const lines = text.trim().split('\n')
    assert.ok(lines.some(line => line.startsWith('^' + 'b'.repeat(40))))
  })

  await t.test('sorts refs alphabetically', () => {
    const refs = new Map<string, string>()
    refs.set('refs/heads/zebra', 'a'.repeat(40))
    refs.set('refs/heads/alpha', 'b'.repeat(40))
    refs.set('refs/heads/middle', 'c'.repeat(40))
    
    const buffer = serializePackedRefs(refs)
    const text = buffer.toString('utf8')
    const lines = text.trim().split('\n')
    
    // Should be sorted alphabetically
    assert.ok(lines[0].includes('refs/heads/alpha'))
    assert.ok(lines[1].includes('refs/heads/middle'))
    assert.ok(lines[2].includes('refs/heads/zebra'))
  })

  await t.test('handles empty map', () => {
    const refs = new Map<string, string>()
    const buffer = serializePackedRefs(refs)
    const text = buffer.toString('utf8')
    
    assert.strictEqual(text, '\n')
  })
})

