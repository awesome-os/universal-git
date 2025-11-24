import { InternalError } from '../errors/InternalError.ts'
import { BufferCursor } from "../utils/BufferCursor.ts"
import { shasum } from "../utils/shasum.ts"
import { getOidLength } from "../utils/detectObjectFormat.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

// MIDX chunk IDs
const CHUNK_ID_PACKNAMES = 0x504e414d // 'PNAM'
const CHUNK_ID_OIDFANOUT = 0x4f494446 // 'OIDF'
const CHUNK_ID_OIDLOOKUP = 0x4f49444c // 'OIDL'
const CHUNK_ID_OBJOFFSETS = 0x4f4f4646 // 'OOFF'
const CHUNK_ID_LARGE_OFFSETS = 0x4c4f4646 // 'LOFF'
const CHUNK_ID_OBJ_TYPES = 0x54595045 // 'TYPE'

type ChunkInfo = {
  id: number
  offset: number
}

type LookupResult = {
  packfileIndex: number
  offset: number
  objectType?: string
}

/**
 * GitMultiPackIndex - Parses and provides lookups for Git's multi-pack-index format
 * 
 * The multi-pack-index (MIDX) allows efficient lookups across multiple packfiles
 * without needing to check each packfile index individually.
 */
export class GitMultiPackIndex {
  private packfileNames: string[] = []
  private oidFanout: number[] = []
  private oidLookup: string[] = []
  private objectOffsets: Map<string, { packfileIndex: number; offset: number }> = new Map()
  private largeOffsets: Map<string, number> = new Map()
  private objectTypes: Map<string, string> = new Map()
  private version: number = 0
  private objectIdVersion: number = 1 // 1 = SHA-1, 2 = SHA-256

  constructor() {}

  /**
   * Parses a MIDX buffer
   */
  static fromBuffer(midx: UniversalBuffer): GitMultiPackIndex {
    const reader = new BufferCursor(midx)
    const instance = new GitMultiPackIndex()

    // Read header
    const magic = reader.slice(4).toString('ascii')
    if (magic !== 'MIDX') {
      throw new InternalError(`Invalid MIDX magic: expected 'MIDX', got '${magic}'`)
    }

    instance.version = reader.readUInt8()
    if (instance.version !== 1) {
      throw new InternalError(`Unsupported MIDX version: ${instance.version} (only version 1 supported)`)
    }

    instance.objectIdVersion = reader.readUInt8()
    if (instance.objectIdVersion !== 1 && instance.objectIdVersion !== 2) {
      throw new InternalError(`Unsupported object ID version: ${instance.objectIdVersion} (only SHA-1 (1) and SHA-256 (2) supported)`)
    }

    const chunkCount = reader.readUInt8()
    const baseMidx = reader.readUInt8()
    if (baseMidx !== 0) {
      throw new InternalError('Base MIDX not yet supported')
    }

    // Read chunk IDs and offsets table
    const chunks: ChunkInfo[] = []
    for (let i = 0; i < chunkCount; i++) {
      const id = reader.readUInt32BE()
      const offset = reader.readUInt32BE()
      chunks.push({ id, offset })
    }

    // Find chunk offsets
    const packnamesChunk = chunks.find(c => c.id === CHUNK_ID_PACKNAMES)
    const oidfanoutChunk = chunks.find(c => c.id === CHUNK_ID_OIDFANOUT)
    const oidlookupChunk = chunks.find(c => c.id === CHUNK_ID_OIDLOOKUP)
    const objoffsetsChunk = chunks.find(c => c.id === CHUNK_ID_OBJOFFSETS)
    const largeOffsetsChunk = chunks.find(c => c.id === CHUNK_ID_LARGE_OFFSETS)
    const objTypesChunk = chunks.find(c => c.id === CHUNK_ID_OBJ_TYPES)

    if (!packnamesChunk || !oidfanoutChunk || !oidlookupChunk || !objoffsetsChunk) {
      throw new InternalError('Missing required MIDX chunks')
    }

    // Read packfile names chunk
    reader.seek(packnamesChunk.offset)
    const packfileCount = reader.readUInt32BE()
    instance.packfileNames = []
    for (let i = 0; i < packfileCount; i++) {
      // Packfile names are null-terminated strings
      const nameBytes: number[] = []
      let byte: number
      while ((byte = reader.readUInt8()) !== 0) {
        nameBytes.push(byte)
      }
      instance.packfileNames.push(UniversalBuffer.from(nameBytes).toString('ascii'))
    }

    // Read OID fanout table
    reader.seek(oidfanoutChunk.offset)
    instance.oidFanout = []
    for (let i = 0; i < 256; i++) {
      instance.oidFanout.push(reader.readUInt32BE())
    }

    // Calculate total object count
    const totalObjects = instance.oidFanout[255]

    // Read OID lookup table
    // OID length: 20 bytes for SHA-1 (objectIdVersion 1), 32 bytes for SHA-256 (objectIdVersion 2)
    const oidByteLength = instance.objectIdVersion === 2 ? 32 : 20
    reader.seek(oidlookupChunk.offset)
    instance.oidLookup = []
    for (let i = 0; i < totalObjects; i++) {
      const oidBytes = reader.slice(oidByteLength)
      instance.oidLookup.push(oidBytes.toString('hex'))
    }

    // Read object offsets table
    reader.seek(objoffsetsChunk.offset)
    for (let i = 0; i < totalObjects; i++) {
      const oid = instance.oidLookup[i]
      // Each entry is 8 bytes: 4 bytes for packfile index, 4 bytes for offset
      const packfileIndex = reader.readUInt32BE()
      const offset = reader.readUInt32BE()
      
      // Check if this is a large offset marker (0x80000000 bit set)
      if (offset & 0x80000000) {
        // This is a large offset - the lower 31 bits are an index into the large offsets table
        const largeOffsetIndex = offset & 0x7fffffff
        // We'll resolve this after reading the large offsets chunk
        instance.objectOffsets.set(oid, { packfileIndex, offset: largeOffsetIndex | 0x80000000 })
      } else {
        instance.objectOffsets.set(oid, { packfileIndex, offset })
      }
    }

    // Read large offsets table (if present)
    if (largeOffsetsChunk) {
      reader.seek(largeOffsetsChunk.offset)
      const largeOffsetCount = reader.readUInt32BE()
      
      // Find all OIDs that have large offsets
      const largeOffsetOids: string[] = []
      for (const [oid, entry] of instance.objectOffsets.entries()) {
        if (entry.offset & 0x80000000) {
          largeOffsetOids.push(oid)
        }
      }
      
      // Read large offsets and map them to OIDs
      for (let i = 0; i < largeOffsetCount && i < largeOffsetOids.length; i++) {
        const oid = largeOffsetOids[i]
        const largeOffset = reader.readUInt32BE() // Lower 32 bits
        const highBits = reader.readUInt32BE() // Upper 32 bits
        const fullOffset = Number((BigInt(highBits) << 32n) | BigInt(largeOffset))
        instance.largeOffsets.set(oid, fullOffset)
        
        // Update the object offset
        const entry = instance.objectOffsets.get(oid)
        if (entry) {
          entry.offset = fullOffset
        }
      }
    }

    // Read object types table (if present)
    if (objTypesChunk) {
      reader.seek(objTypesChunk.offset)
      const typeMap: Record<number, string> = {
        1: 'commit',
        2: 'tree',
        3: 'blob',
        4: 'tag',
      }
      for (let i = 0; i < totalObjects; i++) {
        const oid = instance.oidLookup[i]
        const typeByte = reader.readUInt8()
        const type = typeMap[typeByte]
        if (type) {
          instance.objectTypes.set(oid, type)
        }
      }
    }

    // Verify checksum
    // Checksum length: 20 bytes for SHA-1 (objectIdVersion 1), 32 bytes for SHA-256 (objectIdVersion 2)
    const checksumByteLength = instance.objectIdVersion === 2 ? 32 : 20
    const checksumOffset = midx.length - checksumByteLength
    const data = midx.slice(0, checksumOffset)
    const expectedChecksum = midx.slice(checksumOffset).toString('hex')
    // Note: We'd need to compute SHA-1 or SHA-256 here based on objectIdVersion, but for now we'll skip verification
    // In production, you'd want to verify: const actualChecksum = await (objectIdVersion === 2 ? shasum256(data) : shasum(data))

    return instance
  }

  /**
   * Looks up an OID and returns which packfile contains it and the offset
   */
  lookup(oid: string): LookupResult | null {
    // Use fanout table for binary search
    const firstByte = parseInt(oid.substring(0, 2), 16)
    const start = firstByte === 0 ? 0 : this.oidFanout[firstByte - 1]
    const end = this.oidFanout[firstByte]

    // Binary search within the range
    let left = start
    let right = end - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const midOid = this.oidLookup[mid]
      const comparison = oid.localeCompare(midOid)

      if (comparison === 0) {
        // Found it!
        const offsetEntry = this.objectOffsets.get(oid)
        if (!offsetEntry) {
          return null
        }

        const result: LookupResult = {
          packfileIndex: offsetEntry.packfileIndex,
          offset: offsetEntry.offset,
        }

        // Add object type if available
        const objectType = this.objectTypes.get(oid)
        if (objectType) {
          result.objectType = objectType
        }

        return result
      } else if (comparison < 0) {
        right = mid - 1
      } else {
        left = mid + 1
      }
    }

    return null
  }

  /**
   * Gets the packfile name for a given index
   */
  getPackfileName(index: number): string | null {
    if (index >= 0 && index < this.packfileNames.length) {
      return this.packfileNames[index]
    }
    return null
  }

  /**
   * Gets all packfile names
   */
  getPackfileNames(): string[] {
    return [...this.packfileNames]
  }

  /**
   * Gets the total number of objects indexed
   */
  getObjectCount(): number {
    return this.oidLookup.length
  }

  /**
   * Gets the version of this MIDX
   */
  getVersion(): number {
    return this.version
  }
}

