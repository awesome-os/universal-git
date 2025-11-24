import { InternalError } from '../errors/InternalError.ts'
import { StreamReader } from './StreamReader.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'
import { StatefulPackDecompressor } from './pako-stream.ts'

type PackData = {
  data: Uint8Array
  type: string
  num: number
  offset: number
  end: number
  reference?: UniversalBuffer
  ofs?: number
}

export const listpack = async (
  stream: AsyncIterable<UniversalBuffer> | ReadableStream,
  onData: (data: PackData) => Promise<void>
): Promise<void> => {
  const rawReader = new StreamReader(stream)
  const reader = new StatefulPackDecompressor(rawReader)

  const PACK = await reader.read(4)
  if (!PACK || PACK.length === 0) {
    throw new InternalError(`empty stream`)
  }
  if (PACK.toString('utf8') !== 'PACK') {
    throw new InternalError(`Invalid PACK header`)
  }

  const version = await reader.read(4)
  if (!version) {
    throw new InternalError(`Invalid packfile version`)
  }
  // Handle both UniversalBuffer and Uint8Array
  const versionNum = version instanceof UniversalBuffer
    ? version.readUInt32BE(0)
    : new DataView(version.buffer, version.byteOffset, version.byteLength).getUint32(0, false)
  if (versionNum !== 2) {
    throw new InternalError(`Invalid packfile version`)
  }

  const numObjectsBuf = await reader.read(4)
  if (!numObjectsBuf) {
    throw new InternalError('Invalid packfile: missing object count')
  }
  const numObjects = numObjectsBuf instanceof UniversalBuffer
    ? numObjectsBuf.readUInt32BE(0)
    : new DataView(numObjectsBuf.buffer, numObjectsBuf.byteOffset, numObjectsBuf.byteLength).getUint32(0, false)
  if (numObjects < 1) return

  let remainingObjects = numObjects
  let objectCount = 0

  while (!reader.eof() && remainingObjects > 0) {
    remainingObjects--
    objectCount++
    
    const offset = reader.tell()
    const { type, length, ofs, reference } = await parseHeader(reader)
    const compressedDataStart = reader.tell()
    
    const { decompressed: inflatedData, bytesConsumed } = await reader.readAndDecompressObject(length)
    
    if (inflatedData.length !== length) {
      throw new InternalError(`Inflated object size mismatch: expected ${length}, got ${inflatedData.length}`)
    }
    
    const end = compressedDataStart + bytesConsumed

    await onData({
      data: inflatedData,
      type,
      num: remainingObjects,
      offset,
      end,
      reference,
      ofs,
    })
    
    // Performance: Yield to event loop every 50 objects to prevent UI freeze
    if (objectCount % 50 === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
  }
  
  // FIX: Check for truncated packfile
  // If the loop exited but we still have remaining objects, the packfile was truncated
  if (remainingObjects > 0) {
    throw new InternalError(
      `Truncated packfile: expected ${numObjects} objects, got ${objectCount}`
    )
  }
}

// Ensure parseHeader uses the Reader interface (StatefulPackDecompressor is compatible)
const parseHeader = async (reader: any): Promise<{
  type: string
  length: number
  ofs?: number
  reference?: UniversalBuffer
}> => {
  const byte = await reader.byte()
  if (byte === undefined) throw new InternalError('Unexpected end of packfile')
  
  const typeId = (byte >> 4) & 0b111
  let length = byte & 0b1111
  
  if (byte & 0b10000000) {
    let shift = 4
    let nextByte
    do {
      nextByte = await reader.byte()
      if (nextByte === undefined) throw new InternalError('Unexpected end of packfile')
      length |= (nextByte & 0b01111111) << shift
      shift += 7
    } while (nextByte & 0b10000000)
  }

  let ofs: number | undefined
  let reference: UniversalBuffer | undefined

  if (typeId === 6) { // ofs-delta
    let shift = 0
    ofs = 0
    let deltaByte
    do {
      deltaByte = await reader.byte()
      if (deltaByte === undefined) throw new InternalError('Unexpected end of packfile')
      ofs |= (deltaByte & 0b01111111) << shift
      shift += 7
    } while (deltaByte & 0b10000000)
  } else if (typeId === 7) { // ref-delta
    const buf = await reader.read(20)
    if (!buf) throw new InternalError('Unexpected end of packfile')
    reference = buf instanceof UniversalBuffer ? buf : UniversalBuffer.from(buf)
  }

  const typeMap: Record<number, string> = {
    1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag', 6: 'ofs-delta', 7: 'ref-delta',
  }

  return { type: typeMap[typeId] || String(typeId), length, ofs, reference }
}
