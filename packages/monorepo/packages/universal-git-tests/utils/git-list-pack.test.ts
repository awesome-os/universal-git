import { test } from 'node:test'
import assert from 'node:assert'
import { listpack } from '@awesome-os/universal-git-src/utils/git-list-pack.ts'
import { InternalError } from '@awesome-os/universal-git-src/errors/InternalError.ts'
import { deflate } from '@awesome-os/universal-git-src/utils/deflate.ts'
import { UniversalBuffer } from '@awesome-os/universal-git-src/utils/UniversalBuffer.ts'

// Helper to create a simple packfile header
function createPackHeader(version: number, numObjects: number): UniversalBuffer {
  const header = UniversalBuffer.alloc(12)
  header.write('PACK', 0, 4, 'ascii')
  header.writeUInt32BE(version, 4)
  header.writeUInt32BE(numObjects, 8)
  return header
}

// Helper to create an object header byte
// Type: bits 6-4, Length continuation: bit 7, Length: bits 3-0
function createObjectHeader(type: number, length: number, hasMoreLength: boolean = false): number {
  // Type is in bits 6-4 (shift left by 4)
  const typeBits = (type & 0b111) << 4
  // Length continuation bit (bit 7)
  const continuationBit = hasMoreLength ? 0b10000000 : 0
  // Lower 4 bits of length
  const lengthBits = length & 0b1111
  return continuationBit | typeBits | lengthBits
}

// Helper to encode variable-length length encoding
function encodeLength(length: number): number[] {
  const bytes: number[] = []
  let remaining = length >>> 4 // Remove lower 4 bits (already in header)
  let shift = 4
  
  while (remaining > 0) {
    const byte = (remaining & 0b01111111) | (remaining > 0b01111111 ? 0b10000000 : 0)
    bytes.push(byte)
    remaining >>>= 7
    shift += 7
  }
  
  return bytes
}

async function* createPackStream(packData: UniversalBuffer): AsyncIterableIterator<UniversalBuffer> {
  // Split into chunks to simulate streaming
  const chunkSize = 1024
  for (let i = 0; i < packData.length; i += chunkSize) {
    yield packData.slice(i, i + chunkSize)
  }
}

test('git-list-pack', async (t) => {
  await t.test('ok:parses-single-blob', async () => {
    const content = UniversalBuffer.from('test content')
    const compressed = await deflate(content)
    
    const header = createPackHeader(2, 1)
    const objHeader = createObjectHeader(3, content.length) // type 3 = blob
    const packData = UniversalBuffer.concat([header, UniversalBuffer.from([objHeader]), compressed])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 1)
    assert.strictEqual(objects[0].type, 'blob')
    assert.strictEqual(objects[0].num, 0) // remainingObjects after processing
    assert.deepStrictEqual(UniversalBuffer.from(objects[0].data), content)
  })

  await t.test('ok:parses-multiple-objects', async () => {
    const content1 = UniversalBuffer.from('content1')
    const content2 = UniversalBuffer.from('content2')
    const compressed1 = await deflate(content1)
    const compressed2 = await deflate(content2)
    
    const header = createPackHeader(2, 2)
    const objHeader1 = createObjectHeader(3, content1.length) // blob
    const objHeader2 = createObjectHeader(3, content2.length) // blob
    const packData = UniversalBuffer.concat([
      header,
      UniversalBuffer.from([objHeader1]),
      compressed1,
      UniversalBuffer.from([objHeader2]),
      compressed2,
    ])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 2)
    assert.strictEqual(objects[0].type, 'blob')
    assert.strictEqual(objects[1].type, 'blob')
    assert.deepStrictEqual(UniversalBuffer.from(objects[0].data), content1)
    assert.deepStrictEqual(UniversalBuffer.from(objects[1].data), content2)
  })

  await t.test('ok:parses-different-object-types', async () => {
    const blobContent = UniversalBuffer.from('blob content')
    const treeContent = UniversalBuffer.from('tree content')
    const commitContent = UniversalBuffer.from('commit content')
    const tagContent = UniversalBuffer.from('tag content')
    
    const compressedBlob = await deflate(blobContent)
    const compressedTree = await deflate(treeContent)
    const compressedCommit = await deflate(commitContent)
    const compressedTag = await deflate(tagContent)
    
    const header = createPackHeader(2, 4)
    const packData = UniversalBuffer.concat([
      header,
      UniversalBuffer.from([createObjectHeader(3, blobContent.length)]), // blob
      compressedBlob,
      UniversalBuffer.from([createObjectHeader(2, treeContent.length)]), // tree
      compressedTree,
      UniversalBuffer.from([createObjectHeader(1, commitContent.length)]), // commit
      compressedCommit,
      UniversalBuffer.from([createObjectHeader(4, tagContent.length)]), // tag
      compressedTag,
    ])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 4)
    assert.strictEqual(objects[0].type, 'blob')
    assert.strictEqual(objects[1].type, 'tree')
    assert.strictEqual(objects[2].type, 'commit')
    assert.strictEqual(objects[3].type, 'tag')
  })

  await t.test('error:invalid-PACK-header', async () => {
    const invalidHeader = UniversalBuffer.from('INVALID')
    
    await assert.rejects(
      async () => {
        await listpack(createPackStream(invalidHeader), async () => {})
      },
      (error: any) => {
        return error instanceof InternalError && 
               error.message.includes('Invalid PACK header')
      }
    )
  })

  await t.test('error:empty-stream', async () => {
    await assert.rejects(
      async () => {
        await listpack(createPackStream(UniversalBuffer.alloc(0)), async () => {})
      },
      (error: any) => {
        return error instanceof InternalError && 
               error.message.includes('empty stream')
      }
    )
  })

  await t.test('error:invalid-version', async () => {
    const header = createPackHeader(1, 1) // version 1 (invalid, should be 2)
    
    await assert.rejects(
      async () => {
        await listpack(createPackStream(header), async () => {})
      },
      (error: any) => {
        return error instanceof InternalError && 
               error.message.includes('Invalid packfile version')
      }
    )
  })

  await t.test('edge:empty-packfile', async () => {
    const header = createPackHeader(2, 0)
    
    const objects: any[] = []
    await listpack(createPackStream(header), async (data) => {
      objects.push(data)
    })
    
    // Should return early without processing
    assert.strictEqual(objects.length, 0)
  })

  await t.test('ok:handles-ofs-delta', async () => {
    const content = UniversalBuffer.from('delta content')
    const compressed = await deflate(content)
    
    const header = createPackHeader(2, 1)
    // Type 6 = ofs-delta
    const objHeader = createObjectHeader(6, content.length)
    // Delta offset encoding (simplified - just one byte for offset)
    const deltaOffset = UniversalBuffer.from([0x01]) // offset = 1
    const packData = UniversalBuffer.concat([
      header,
      UniversalBuffer.from([objHeader]),
      deltaOffset,
      compressed,
    ])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 1)
    assert.strictEqual(objects[0].type, 'ofs-delta')
    assert.ok(objects[0].ofs !== undefined)
    assert.strictEqual(objects[0].reference, undefined) // ofs-delta doesn't have reference, only ofs
  })

  await t.test('ok:handles-ref-delta', async () => {
    const content = UniversalBuffer.from('delta content')
    const compressed = await deflate(content)
    const refOid = UniversalBuffer.alloc(20)
    refOid.fill(0xAB) // Mock OID
    
    const header = createPackHeader(2, 1)
    // Type 7 = ref-delta
    const objHeader = createObjectHeader(7, content.length)
    const packData = UniversalBuffer.concat([
      header,
      UniversalBuffer.from([objHeader]),
      refOid, // 20-byte reference OID
      compressed,
    ])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 1)
    assert.strictEqual(objects[0].type, 'ref-delta')
    assert.ok(objects[0].reference !== undefined)
    assert.strictEqual(objects[0].reference.length, 20)
  })

  await t.test('ok:tracks-offset-end-positions', async () => {
    const content = UniversalBuffer.from('test')
    const compressed = await deflate(content)
    
    const header = createPackHeader(2, 1)
    const objHeader = createObjectHeader(3, content.length)
    const packData = UniversalBuffer.concat([header, UniversalBuffer.from([objHeader]), compressed])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 1)
    assert.ok(objects[0].offset >= 12) // After header
    assert.ok(objects[0].end > objects[0].offset)
  })

  await t.test('ok:handles-large-length-encoding', async () => {
    // Create content that requires multi-byte length encoding
    const largeContent = UniversalBuffer.alloc(300) // > 0x7F requires continuation bytes
    largeContent.fill('A')
    const compressed = await deflate(largeContent)
    
    const header = createPackHeader(2, 1)
    // Length > 15 requires continuation bytes
    const objHeader = createObjectHeader(3, largeContent.length & 0b1111, true)
    const lengthBytes = encodeLength(largeContent.length)
    const packData = UniversalBuffer.concat([
      header,
      UniversalBuffer.from([objHeader]),
      UniversalBuffer.from(lengthBytes),
      compressed,
    ])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 1)
    assert.strictEqual(objects[0].data.length, largeContent.length)
  })

  await t.test('error:size-mismatch', async () => {
    const content = UniversalBuffer.from('test')
    const wrongContent = UniversalBuffer.from('wrong')
    const compressed = await deflate(wrongContent) // Wrong size
    
    const header = createPackHeader(2, 1)
    const objHeader = createObjectHeader(3, content.length) // Says content.length
    const packData = UniversalBuffer.concat([header, UniversalBuffer.from([objHeader]), compressed])
    
    await assert.rejects(
      async () => {
        await listpack(createPackStream(packData), async () => {})
      },
      (error: any) => {
        return error instanceof InternalError && 
               error.message.includes('Inflated object size is different')
      }
    )
  })

  await t.test('ok:handles-ReadableStream-input', async () => {
    const content = UniversalBuffer.from('test')
    const compressed = await deflate(content)
    
    const header = createPackHeader(2, 1)
    const objHeader = createObjectHeader(3, content.length)
    const packData = UniversalBuffer.concat([header, UniversalBuffer.from([objHeader]), compressed])
    
    // Create a ReadableStream
    const { Readable } = await import('readable-stream')
    const stream = new Readable({
      read() {
        this.push(packData)
        this.push(null)
      },
    })
    
    const objects: any[] = []
    await listpack(stream, async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 1)
    assert.strictEqual(objects[0].type, 'blob')
  })

  await t.test('ok:processes-objects-in-order', async () => {
    const contents = [
      UniversalBuffer.from('first'),
      UniversalBuffer.from('second'),
      UniversalBuffer.from('third'),
    ]
    const compressed = contents.map(c => deflate(c))
    const allCompressed = await Promise.all(compressed)
    
    const header = createPackHeader(2, 3)
    const packData = UniversalBuffer.concat([
      header,
      UniversalBuffer.from([createObjectHeader(3, contents[0].length)]),
      allCompressed[0],
      UniversalBuffer.from([createObjectHeader(3, contents[1].length)]),
      allCompressed[1],
      UniversalBuffer.from([createObjectHeader(3, contents[2].length)]),
      allCompressed[2],
    ])
    
    const objects: any[] = []
    await listpack(createPackStream(packData), async (data) => {
      objects.push(data)
    })
    
    assert.strictEqual(objects.length, 3)
    assert.deepStrictEqual(UniversalBuffer.from(objects[0].data), contents[0])
    assert.deepStrictEqual(UniversalBuffer.from(objects[1].data), contents[1])
    assert.deepStrictEqual(UniversalBuffer.from(objects[2].data), contents[2])
  })
})

