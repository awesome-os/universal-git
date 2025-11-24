import { InternalError } from "../../errors/InternalError.ts"
import { UnsafeFilepathError } from "../../errors/UnsafeFilepathError.ts"
import { BufferCursor } from "../../utils/BufferCursor.ts"
import { comparePath } from "../../utils/comparePath.ts"
import { normalizeStats } from "../../utils/normalizeStats.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import { shasum } from '../ShaHasher.ts'
import type { Stat } from "../../models/FileSystem.ts"

type CacheEntryFlags = {
  assumeValid: boolean
  extended: boolean
  stage: number
  nameLength: number
  skipWorktree?: boolean
  intentToAdd?: boolean
}

export type IndexEntry = {
  path: string
  oid: string
  mode: number
  ctimeSeconds: number
  ctimeNanoseconds: number
  mtimeSeconds: number
  mtimeNanoseconds: number
  dev: number
  ino: number
  uid: number
  gid: number
  size: number
  flags: CacheEntryFlags
  stages: IndexEntry[]
}

export type IndexObject = {
  entries: Map<string, IndexEntry>
  unmergedPaths: Set<string>
  version: number
}

function parseCacheEntryFlags(bits: number): CacheEntryFlags {
  return {
    assumeValid: Boolean(bits & 0b1000000000000000),
    extended: Boolean(bits & 0b0100000000000000),
    stage: (bits & 0b0011000000000000) >> 12,
    nameLength: bits & 0b0000111111111111,
    skipWorktree: Boolean(bits & 0b0000100000000000), // Extended flag bit
    intentToAdd: Boolean(bits & 0b0000010000000000), // Extended flag bit
  }
}

function renderCacheEntryFlags(entry: IndexEntry, version: number = 2): { flags: number; extendedFlags?: number; pathLengthBytes?: number } {
  const flags = entry.flags
  const pathBytes = UniversalBuffer.from(entry.path)
  const pathLength = pathBytes.length
  
  // For large pathnames (>4095), use 0xFFF as marker and store actual length separately
  const nameLength = pathLength > 0xfff ? 0xfff : pathLength
  const needsExtendedPathLength = pathLength > 0xfff
  
  // Set extended bit if explicitly set, or if version 3 and extended flags properties exist
  const hasExtendedFlags = flags.extended || (version === 3 && (flags.skipWorktree !== undefined || flags.intentToAdd !== undefined))
  const baseFlags = (
    (flags.assumeValid ? 0b1000000000000000 : 0) +
    (hasExtendedFlags ? 0b0100000000000000 : 0) +
    ((flags.stage & 0b11) << 12) +
    (nameLength & 0b111111111111)
  )
  
  let extendedFlags: number | undefined
  // In version 3, if extended flag bit is set OR if skipWorktree/intentToAdd properties exist (even if false),
  // we need to write extended flags. If the properties don't exist (undefined), we don't write extended flags.
  if (version === 3 && (flags.extended || flags.skipWorktree !== undefined || flags.intentToAdd !== undefined)) {
    extendedFlags = (
      ((flags.skipWorktree !== undefined && flags.skipWorktree) ? 0b0000000000000001 : 0) +
      ((flags.intentToAdd !== undefined && flags.intentToAdd) ? 0b0000000000000010 : 0)
    )
  }
  
  return {
    flags: baseFlags,
    extendedFlags,
    pathLengthBytes: needsExtendedPathLength ? pathLength : undefined,
  }
}

/**
 * Parses a Git index buffer into an IndexObject
 */
export const parse = async (buffer: UniversalBuffer | Uint8Array): Promise<IndexObject> => {
  const buf = UniversalBuffer.isBuffer(buffer) ? buffer : UniversalBuffer.from(buffer)
  
  if (buf.length === 0) {
    // Empty index - throw error
    throw new InternalError('Index file is empty (.git/index)')
  }

  const reader = new BufferCursor(buf)
  const magic = reader.toString('utf8', 4)
  if (magic !== 'DIRC') {
    throw new InternalError(`Invalid dircache magic file number: ${magic}`)
  }

  // Verify shasum after we ensured that the file has a magic number
  const shaComputed = await shasum(buf.slice(0, -20))
  const shaClaimed = buf.slice(-20).toString('hex')
  if (shaClaimed !== shaComputed) {
    throw new InternalError(
      `Invalid checksum in GitIndex buffer: expected ${shaClaimed} but saw ${shaComputed}`
    )
  }

  const version = reader.readUInt32BE()
  if (version !== 2 && version !== 3) {
    throw new InternalError(`Unsupported dircache version: ${version}`)
  }
  const numEntries = reader.readUInt32BE()
  
  const entries = new Map<string, IndexEntry>()
  const unmergedPaths = new Set<string>()
  
  let i = 0
  while (!reader.eof() && i < numEntries) {
    const entry: Partial<IndexEntry> = {}
    entry.ctimeSeconds = reader.readUInt32BE()
    entry.ctimeNanoseconds = reader.readUInt32BE()
    entry.mtimeSeconds = reader.readUInt32BE()
    entry.mtimeNanoseconds = reader.readUInt32BE()
    entry.dev = reader.readUInt32BE()
    entry.ino = reader.readUInt32BE()
    entry.mode = reader.readUInt32BE()
    entry.uid = reader.readUInt32BE()
    entry.gid = reader.readUInt32BE()
    entry.size = reader.readUInt32BE()
    entry.oid = reader.slice(20).toString('hex')
    const flags = reader.readUInt16BE()
    entry.flags = parseCacheEntryFlags(flags)
    
    // Version 3: Read extended flags if present
    if (version === 3 && entry.flags.extended) {
      const extendedFlags = reader.readUInt16BE()
      entry.flags.skipWorktree = Boolean(extendedFlags & 0b0000000000000001)
      entry.flags.intentToAdd = Boolean(extendedFlags & 0b0000000000000010)
      // Reserved bits should be zero
      if (extendedFlags & 0b1111111111111100) {
        throw new InternalError(`Reserved extended flag bits are set: ${extendedFlags.toString(2)}`)
      }
    }
    
    // Handle pathname: if nameLength is 0xFFF, the actual length is stored separately
    let pathlength: number
    if (entry.flags.nameLength === 0xfff) {
      // Large pathname: read actual length from next 2 bytes
      pathlength = reader.readUInt16BE()
    } else {
      pathlength = entry.flags.nameLength
    }
    
    // Find null terminator for path
    const nullPos = buf.indexOf(0, reader.tell())
    if (nullPos === -1) {
      throw new InternalError('Could not find null terminator for path')
    }
    const actualPathLength = nullPos - reader.tell()
    if (actualPathLength < 1) {
      throw new InternalError(`Got a path length of: ${actualPathLength}`)
    }
    
    entry.path = reader.toString('utf8', actualPathLength)

    // Prevent malicious paths like "..\foo"
    if (entry.path.includes('..\\') || entry.path.includes('../')) {
      throw new UnsafeFilepathError(entry.path)
    }

    // The next bit is awkward. We expect 1 to 8 null characters
    // such that the total size of the entry is a multiple of 8 bits.
    // (Hence subtract 12 bytes for the header.)
    let padding = 8 - ((reader.tell() - 12) % 8)
    if (padding === 0) padding = 8
    while (padding--) {
      const tmp = reader.readUInt8()
      if (tmp !== 0) {
        throw new InternalError(
          `Expected 1-8 null characters but got '${tmp}' after ${entry.path}`
        )
      } else if (reader.eof()) {
        throw new InternalError('Unexpected end of file')
      }
    }
    // end of awkward part
    entry.stages = []

    const fullEntry = entry as IndexEntry
    
    // Add entry to map
    if (entry.flags!.stage === 0) {
      fullEntry.stages = [fullEntry]
      entries.set(fullEntry.path, fullEntry)
      unmergedPaths.delete(fullEntry.path)
    } else {
      let existingEntry = entries.get(fullEntry.path)
      if (!existingEntry) {
        entries.set(fullEntry.path, fullEntry)
        existingEntry = fullEntry
      }
      existingEntry.stages[entry.flags!.stage] = fullEntry
      unmergedPaths.add(fullEntry.path)
    }

    i++
  }

  return {
    entries,
    unmergedPaths,
    version,
  }
}

/**
 * Serializes an IndexObject into a Git index buffer
 */
export const serialize = async (index: IndexObject): Promise<UniversalBuffer> => {
  const version = index.version || 2
  const header = UniversalBuffer.alloc(12)
  const writer = new BufferCursor(header)
  writer.write('DIRC', 4, 'utf8')
  writer.writeUInt32BE(version)
  
  // Flatten entries (include all stages)
  const entriesFlat: IndexEntry[] = []
  for (const entry of index.entries.values()) {
    entriesFlat.push(entry)
    if (entry.stages.length > 1) {
      for (const stage of entry.stages) {
        if (stage && stage !== entry) {
          entriesFlat.push(stage)
        }
      }
    }
  }
  
  writer.writeUInt32BE(entriesFlat.length)

  const entryBuffers: UniversalBuffer[] = []
  for (const entry of entriesFlat) {
    const bpath = UniversalBuffer.from(entry.path)
    const flagInfo = renderCacheEntryFlags(entry, version)
    
    // Calculate entry size: base (62 includes flags) + extended flags (2 if version 3) + path length (2 if large) + path + null + padding
    let baseSize = 62 // ctime, mtime, dev, ino, mode, uid, gid, size, oid, flags (62 bytes total)
    if (version === 3 && flagInfo.extendedFlags !== undefined) {
      baseSize += 2 // extended flags
    }
    // Path length bytes are written when pathLength > 0xFFF (matches parse logic which reads when nameLength === 0xfff)
    if (flagInfo.pathLengthBytes !== undefined) {
      baseSize += 2 // path length for large paths
    }
    const totalSize = baseSize + bpath.length + 1 // +1 for null terminator
    const length = Math.ceil(totalSize / 8) * 8 // Align to 8 bytes
    
    const written = UniversalBuffer.alloc(length)
    const entryWriter = new BufferCursor(written)
    const stat = normalizeStats(entry as Partial<Stat>)
    entryWriter.writeUInt32BE(stat.ctimeSeconds)
    entryWriter.writeUInt32BE(stat.ctimeNanoseconds)
    entryWriter.writeUInt32BE(stat.mtimeSeconds)
    entryWriter.writeUInt32BE(stat.mtimeNanoseconds)
    entryWriter.writeUInt32BE(stat.dev)
    entryWriter.writeUInt32BE(stat.ino)
    entryWriter.writeUInt32BE(stat.mode)
    entryWriter.writeUInt32BE(stat.uid)
    entryWriter.writeUInt32BE(stat.gid)
    entryWriter.writeUInt32BE(stat.size)
    entryWriter.write(entry.oid, 20, 'hex')
    entryWriter.writeUInt16BE(flagInfo.flags)
    
    // Version 3: Write extended flags if needed
    if (version === 3 && flagInfo.extendedFlags !== undefined) {
      entryWriter.writeUInt16BE(flagInfo.extendedFlags)
    }
    
    // Write path length for large paths (when pathLength > 0xFFF)
    // This must match the parse logic which reads path length when nameLength === 0xfff
    if (flagInfo.pathLengthBytes !== undefined) {
      entryWriter.writeUInt16BE(flagInfo.pathLengthBytes)
    }
    
    // Write path as bytes directly to ensure exact byte count
    entryWriter.copy(bpath, 0, bpath.length)
    entryWriter.writeUInt8(0) // Null terminator
    
    // Verify we're at the expected position before padding
    const currentPos = entryWriter.tell()
    const expectedPos = totalSize
    if (currentPos !== expectedPos) {
      throw new InternalError(
        `Index entry size mismatch: expected position ${expectedPos} but got ${currentPos} for path ${entry.path}`
      )
    }
    
    // Pad to 8-byte boundary
    const padding = length - totalSize
    for (let i = 0; i < padding; i++) {
      entryWriter.writeUInt8(0)
    }
    entryBuffers.push(written)
  }

  const body = UniversalBuffer.concat(entryBuffers)
  const main = UniversalBuffer.concat([header, body])
  const sum = await shasum(main)
  return UniversalBuffer.concat([main, UniversalBuffer.from(sum, 'hex')])
}
