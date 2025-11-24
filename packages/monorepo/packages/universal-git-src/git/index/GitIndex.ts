import { InternalError } from '../../errors/InternalError.ts'
import { UnsafeFilepathError } from '../../errors/UnsafeFilepathError.ts'
import { BufferCursor } from "../../utils/BufferCursor.ts"
import { comparePath } from "../../utils/comparePath.ts"
import { normalizeStats } from "../../utils/normalizeStats.ts"
import { shasum } from "../../utils/shasum.ts"
import { getOidLength, type ObjectFormat } from '../../utils/detectObjectFormat.ts'
import type { Stat } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

type CacheEntryFlags = {
  assumeValid: boolean
  extended: boolean
  stage: number
  nameLength: number
  skipWorktree?: boolean
  intentToAdd?: boolean
}

type IndexEntry = {
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

// Extract 1-bit assume-valid, 1-bit extended flag, 2-bit merge state flag, 12-bit path length flag
function parseCacheEntryFlags(bits: number): CacheEntryFlags {
  return {
    assumeValid: Boolean(bits & 0b1000000000000000),
    extended: Boolean(bits & 0b0100000000000000),
    stage: (bits & 0b0011000000000000) >> 12,
    nameLength: bits & 0b0000111111111111,
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

export class GitIndex {
  // Unique ID for debugging - helps track index instances across operations
  public readonly id = Math.random()
  
  _entries: Map<string, IndexEntry>
  _dirty: boolean // Used to determine if index needs to be saved to filesystem
  _unmergedPaths: Set<string>
  _version: number // Track index version (2 or 3)

  constructor(
    entries?: Map<string, IndexEntry> | null,
    unmergedPaths?: Set<string>,
    version: number = 2
  ) {
    this._dirty = false
    this._unmergedPaths = unmergedPaths || new Set()
    this._entries = entries || new Map()
    this._version = version
  }

  _addEntry(entry: IndexEntry): void {
    if (entry.flags.stage === 0) {
      entry.stages = [entry]
      this._entries.set(entry.path, entry)
      this._unmergedPaths.delete(entry.path)
    } else {
      let existingEntry = this._entries.get(entry.path)
      if (!existingEntry) {
        this._entries.set(entry.path, entry)
        existingEntry = entry
      }
      existingEntry.stages[entry.flags.stage] = entry
      this._unmergedPaths.add(entry.path)
    }
  }

  static async from(
    buffer: UniversalBuffer | Uint8Array | null,
    objectFormat: ObjectFormat = 'sha1'
  ): Promise<GitIndex> {
    if (buffer !== null && (UniversalBuffer.isBuffer(buffer) || buffer instanceof Uint8Array)) {
      return GitIndex.fromBuffer(buffer, objectFormat)
    } else if (buffer === null) {
      return new GitIndex(null)
    } else {
      throw new InternalError('invalid type passed to GitIndex.from')
    }
  }

  static async fromBuffer(buffer: UniversalBuffer | Uint8Array, objectFormat: ObjectFormat = 'sha1'): Promise<GitIndex> {
    const buf = UniversalBuffer.isBuffer(buffer) ? buffer : UniversalBuffer.from(buffer)
    if (buf.length === 0) {
      throw new InternalError('Index file is empty (.git/index)')
    }

    const index = new GitIndex()
    const reader = new BufferCursor(buf)
    const magic = reader.toString('utf8', 4)
    if (magic !== 'DIRC') {
      throw new InternalError(`Invalid dircache magic file number: ${magic}`)
    }

    // Verify shasum after we ensured that the file has a magic number
    // SHA-1 uses 20 bytes, SHA-256 uses 32 bytes for checksum
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    const shaComputed = await shasum(buf.slice(0, -oidByteLength))
    const shaClaimed = buf.slice(-oidByteLength).toString('hex')
    if (shaClaimed !== shaComputed) {
      throw new InternalError(
        `Invalid checksum in GitIndex buffer: expected ${shaClaimed} but saw ${shaComputed}`
      )
    }

    const version = reader.readUInt32BE()
    if (version !== 2 && version !== 3) {
      throw new InternalError(`Unsupported dircache version: ${version}`)
    }
    index._version = version
    const numEntries = reader.readUInt32BE()
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
      // OID length: 20 bytes for SHA-1, 32 bytes for SHA-256
      const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
      entry.oid = reader.slice(oidByteLength).toString('hex')
      const flags = reader.readUInt16BE()
      entry.flags = parseCacheEntryFlags(flags)
      
      // Version 3: Read extended flags if present
      if (version === 3 && entry.flags.extended) {
        const extendedFlags = reader.readUInt16BE()
        // Add skipWorktree and intentToAdd to flags if they exist
        ;(entry.flags as any).skipWorktree = Boolean(extendedFlags & 0b0000000000000001)
        ;(entry.flags as any).intentToAdd = Boolean(extendedFlags & 0b0000000000000010)
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
      if (entry.path && (entry.path.includes('..\\') || entry.path.includes('../'))) {
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

      if (
        entry.path &&
        entry.oid &&
        entry.mode !== undefined &&
        entry.ctimeSeconds !== undefined &&
        entry.ctimeNanoseconds !== undefined &&
        entry.mtimeSeconds !== undefined &&
        entry.mtimeNanoseconds !== undefined &&
        entry.dev !== undefined &&
        entry.ino !== undefined &&
        entry.uid !== undefined &&
        entry.gid !== undefined &&
        entry.size !== undefined &&
        entry.flags
      ) {
        index._addEntry(entry as IndexEntry)
      }

      i++
    }
    return index
  }

  get unmergedPaths(): string[] {
    return [...this._unmergedPaths]
  }

  get entries(): IndexEntry[] {
    return [...this._entries.values()].sort(comparePath)
  }

  get entriesMap(): Map<string, IndexEntry> {
    return this._entries
  }

  get entriesFlat(): IndexEntry[] {
    return [...this.entries].flatMap(entry => {
      return entry.stages.length > 1 ? entry.stages.filter(x => x) : [entry]
    })
  }

  *[Symbol.iterator](): Generator<IndexEntry, void, unknown> {
    for (const entry of this.entries) {
      yield entry
    }
  }

  insert({
    filepath,
    stats,
    oid,
    stage = 0,
  }: {
    filepath: string
    stats?: Stat | null
    oid: string
    stage?: number
  }): void {
    let finalStats: Stat
    if (!stats) {
      finalStats = {
        ctimeSeconds: 0,
        ctimeNanoseconds: 0,
        mtimeSeconds: 0,
        mtimeNanoseconds: 0,
        dev: 0,
        ino: 0,
        mode: 0,
        uid: 0,
        gid: 0,
        size: 0,
      }
    } else {
      finalStats = normalizeStats(stats)
    }
    const bfilepath = UniversalBuffer.from(filepath)
    const entry: IndexEntry = {
      ctimeSeconds: finalStats.ctimeSeconds,
      ctimeNanoseconds: finalStats.ctimeNanoseconds,
      mtimeSeconds: finalStats.mtimeSeconds,
      mtimeNanoseconds: finalStats.mtimeNanoseconds,
      dev: finalStats.dev,
      ino: finalStats.ino,
      // We provide a fallback value for `mode` here because not all fs
      // implementations assign it, but we use it in GitTree.
      // '100644' is for a "regular non-executable file"
      mode: finalStats.mode || 0o100644,
      uid: finalStats.uid,
      gid: finalStats.gid,
      size: finalStats.size,
      path: filepath,
      oid,
      flags: {
        assumeValid: false,
        extended: false,
        stage,
        nameLength: bfilepath.length < 0xfff ? bfilepath.length : 0xfff,
      },
      stages: [],
    }

    this._addEntry(entry)

    this._dirty = true
  }

  delete({ filepath }: { filepath: string }): void {
    if (this._entries.has(filepath)) {
      this._entries.delete(filepath)
    } else {
      for (const key of this._entries.keys()) {
        if (key.startsWith(filepath + '/')) {
          this._entries.delete(key)
        }
      }
    }

    if (this._unmergedPaths.has(filepath)) {
      this._unmergedPaths.delete(filepath)
    }
    this._dirty = true
  }

  clear(): void {
    this._entries.clear()
    this._dirty = true
  }

  has({ filepath }: { filepath: string }): boolean {
    return this._entries.has(filepath)
  }

  render(): string {
    return this.entries
      .map(entry => `${entry.mode.toString(8)} ${entry.oid}    ${entry.path}`)
      .join('\n')
  }

  static async _entryToBuffer(entry: IndexEntry, objectFormat: ObjectFormat = 'sha1'): Promise<UniversalBuffer> {
    const bpath = UniversalBuffer.from(entry.path)
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    // Base size: 10 fields * 4 bytes (ctime, mtime, dev, ino, mode, uid, gid, size) = 40 bytes
    //            + oid (20 bytes for SHA-1, 32 bytes for SHA-256) + 2 bytes (flags) = 42 + oid
    const baseSize = 40 + oidByteLength + 2 // 40 (10 fields) + oid + 2 (flags)
    // the fixed length + the filename + at least one null char => align by 8
    const length = Math.ceil((baseSize + bpath.length + 1) / 8) * 8
    const written = UniversalBuffer.alloc(length)
    const writer = new BufferCursor(written)
    const stat = normalizeStats(entry)
    writer.writeUInt32BE(stat.ctimeSeconds)
    writer.writeUInt32BE(stat.ctimeNanoseconds)
    writer.writeUInt32BE(stat.mtimeSeconds)
    writer.writeUInt32BE(stat.mtimeNanoseconds)
    writer.writeUInt32BE(stat.dev)
    writer.writeUInt32BE(stat.ino)
    writer.writeUInt32BE(stat.mode)
    writer.writeUInt32BE(stat.uid)
    writer.writeUInt32BE(stat.gid)
    writer.writeUInt32BE(stat.size)
    writer.write(entry.oid, oidByteLength, 'hex')
    const flagInfo = renderCacheEntryFlags(entry)
    writer.writeUInt16BE(flagInfo.flags)
    writer.write(entry.path, bpath.length, 'utf8')
    return written
  }

  /**
   * Serializes the GitIndex to a buffer matching the .git/index file format
   */
  async toBuffer(objectFormat: ObjectFormat = 'sha1'): Promise<UniversalBuffer> {
    const version = this._version || 2
    const oidByteLength = getOidLength(objectFormat) / 2 // Convert hex chars to bytes
    const header = UniversalBuffer.alloc(12)
    const writer = new BufferCursor(header)
    writer.write('DIRC', 4, 'utf8')
    writer.writeUInt32BE(version)
    
    // Flatten entries (include all stages)
    const entriesFlat: IndexEntry[] = []
    for (const entry of this._entries.values()) {
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
      
      // Calculate entry size: base (42 + oid + 2 for flags) + extended flags (2 if version 3) + path length (2 if large) + path + null + padding
      // Base: 10 * 4 bytes (ctime, mtime, dev, ino, mode, uid, gid, size) = 40 bytes
      //       + oid (20 for SHA-1, 32 for SHA-256) + 2 bytes (flags) = 42 + oid
      let baseSize = 42 + oidByteLength // 42 = 10 * 4 + 2 (flags), + oid
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
      entryWriter.write(entry.oid, oidByteLength, 'hex')
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
    // Append checksum: 20 bytes for SHA-1, 32 bytes for SHA-256
    return UniversalBuffer.concat([main, UniversalBuffer.from(sum, 'hex')])
  }

  /**
   * Serializes the index to a buffer
   * Alias for toBuffer() for consistency with other Git object types
   */
  async toObject(): Promise<UniversalBuffer> {
    return this.toBuffer()
  }
}

