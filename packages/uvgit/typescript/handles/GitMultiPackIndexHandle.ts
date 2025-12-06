/**
 * Git Multi-Pack Index Handle
 * Parses objects/info/multi-pack-index files to provide efficient OID lookups
 * across multiple packfiles without checking each .idx file individually.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';

export type PermissionState = 'granted' | 'denied' | 'prompt';

// MIDX chunk IDs
const CHUNK_ID_PACKNAMES = 0x504e414d; // 'PNAM'
const CHUNK_ID_OIDFANOUT = 0x4f494446; // 'OIDF'
const CHUNK_ID_OIDLOOKUP = 0x4f49444c; // 'OIDL'
const CHUNK_ID_OBJOFFSETS = 0x4f4f4646; // 'OOFF'
const CHUNK_ID_LARGE_OFFSETS = 0x4c4f4646; // 'LOFF'
const CHUNK_ID_OBJ_TYPES = 0x54595045; // 'TYPE'

interface ChunkInfo {
  id: number;
  offset: number;
}

export interface MidxLookupResult {
  packfileIndex: number;
  offset: number;
  objectType?: string;
}

export class GitMultiPackIndexHandle extends GitBaseHandle<FileSystemFileHandle> {
  private _parsed: boolean = false;
  private packfileNames: string[] = [];
  private oidFanout: number[] = [];
  private oidLookup: string[] = [];
  private objectOffsets: Map<string, { packfileIndex: number; offset: number }> =
    new Map();
  private largeOffsets: Map<string, number> = new Map();
  private objectTypes: Map<string, string> = new Map();
  private version: number = 0;
  private objectIdVersion: number = 1; // 1 = SHA-1, 2 = SHA-256

  async getFile(): Promise<File> {
    return this.rawHandle.getFile();
  }

  async createWritable(
    options?: { keepExistingData?: boolean }
  ): Promise<FileSystemWritableFileStream> {
    return this.rawHandle.createWritable(options);
  }

  async queryPermission(): Promise<PermissionState> {
    return this.rawHandle.queryPermission();
  }

  async requestPermission(): Promise<PermissionState> {
    return this.rawHandle.requestPermission();
  }

  async remove(options: { recursive?: boolean } = {}): Promise<void> {
    return this.rawHandle.remove(options);
  }

  // --- SMART METHODS ---

  /**
   * Parses the MIDX file.
   * Caches the result for subsequent calls.
   */
  async parse(): Promise<void> {
    if (this._parsed) {
      return;
    }

    const file = await this.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());

    // Read header
    const magic = new TextDecoder().decode(buffer.slice(0, 4));
    if (magic !== 'MIDX') {
      throw new Error(`Invalid MIDX magic: expected 'MIDX', got '${magic}'`);
    }

    this.version = buffer[4];
    if (this.version !== 1) {
      throw new Error(
        `Unsupported MIDX version: ${this.version} (only version 1 supported)`
      );
    }

    this.objectIdVersion = buffer[5];
    if (this.objectIdVersion !== 1 && this.objectIdVersion !== 2) {
      throw new Error(
        `Unsupported object ID version: ${this.objectIdVersion} (only SHA-1 (1) and SHA-256 (2) supported)`
      );
    }

    const chunkCount = buffer[6];
    const baseMidx = buffer[7];
    if (baseMidx !== 0) {
      throw new Error('Base MIDX not yet supported');
    }

    // Read chunk IDs and offsets table
    const chunks: ChunkInfo[] = [];
    let offset = 8; // After header
    for (let i = 0; i < chunkCount; i++) {
      const id = this.readUInt32BE(buffer, offset);
      offset += 4;
      const chunkOffset = this.readUInt32BE(buffer, offset);
      offset += 4;
      chunks.push({ id, offset: chunkOffset });
    }

    // Find chunk offsets
    const packnamesChunk = chunks.find((c) => c.id === CHUNK_ID_PACKNAMES);
    const oidfanoutChunk = chunks.find((c) => c.id === CHUNK_ID_OIDFANOUT);
    const oidlookupChunk = chunks.find((c) => c.id === CHUNK_ID_OIDLOOKUP);
    const objoffsetsChunk = chunks.find((c) => c.id === CHUNK_ID_OBJOFFSETS);
    const largeOffsetsChunk = chunks.find((c) => c.id === CHUNK_ID_LARGE_OFFSETS);
    const objTypesChunk = chunks.find((c) => c.id === CHUNK_ID_OBJ_TYPES);

    if (!packnamesChunk || !oidfanoutChunk || !oidlookupChunk || !objoffsetsChunk) {
      throw new Error('Missing required MIDX chunks');
    }

    // Read packfile names chunk
    offset = packnamesChunk.offset;
    const packfileCount = this.readUInt32BE(buffer, offset);
    offset += 4;
    this.packfileNames = [];
    for (let i = 0; i < packfileCount; i++) {
      // Packfile names are null-terminated strings
      const nameBytes: number[] = [];
      while (offset < buffer.length && buffer[offset] !== 0) {
        nameBytes.push(buffer[offset]);
        offset++;
      }
      if (offset < buffer.length) {
        offset++; // Skip null terminator
      }
      this.packfileNames.push(new TextDecoder().decode(new Uint8Array(nameBytes)));
    }

    // Read OID fanout table
    offset = oidfanoutChunk.offset;
    this.oidFanout = [];
    for (let i = 0; i < 256; i++) {
      this.oidFanout.push(this.readUInt32BE(buffer, offset));
      offset += 4;
    }

    // Calculate total object count
    const totalObjects = this.oidFanout[255];

    // Read OID lookup table
    // OID length: 20 bytes for SHA-1 (objectIdVersion 1), 32 bytes for SHA-256 (objectIdVersion 2)
    const oidByteLength = this.objectIdVersion === 2 ? 32 : 20;
    offset = oidlookupChunk.offset;
    this.oidLookup = [];
    for (let i = 0; i < totalObjects; i++) {
      const oidBytes = buffer.slice(offset, offset + oidByteLength);
      this.oidLookup.push(
        Array.from(oidBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      );
      offset += oidByteLength;
    }

    // Read object offsets table
    offset = objoffsetsChunk.offset;
    for (let i = 0; i < totalObjects; i++) {
      const oid = this.oidLookup[i];
      // Each entry is 8 bytes: 4 bytes for packfile index, 4 bytes for offset
      const packfileIndex = this.readUInt32BE(buffer, offset);
      offset += 4;
      const offsetValue = this.readUInt32BE(buffer, offset);
      offset += 4;

      // Check if this is a large offset marker (0x80000000 bit set)
      if (offsetValue & 0x80000000) {
        // This is a large offset - the lower 31 bits are an index into the large offsets table
        const largeOffsetIndex = offsetValue & 0x7fffffff;
        // We'll resolve this after reading the large offsets chunk
        this.objectOffsets.set(oid, {
          packfileIndex,
          offset: largeOffsetIndex | 0x80000000,
        });
      } else {
        this.objectOffsets.set(oid, { packfileIndex, offset: offsetValue });
      }
    }

    // Read large offsets table (if present)
    if (largeOffsetsChunk) {
      offset = largeOffsetsChunk.offset;
      const largeOffsetCount = this.readUInt32BE(buffer, offset);
      offset += 4;

      // Find all OIDs that have large offsets
      const largeOffsetOids: string[] = [];
      for (const [oid, entry] of this.objectOffsets.entries()) {
        if (entry.offset & 0x80000000) {
          largeOffsetOids.push(oid);
        }
      }

      // Read large offsets and map them to OIDs
      for (let i = 0; i < largeOffsetCount && i < largeOffsetOids.length; i++) {
        const oid = largeOffsetOids[i];
        const lowBits = this.readUInt32BE(buffer, offset); // Lower 32 bits
        offset += 4;
        const highBits = this.readUInt32BE(buffer, offset); // Upper 32 bits
        offset += 4;
        const fullOffset = Number((BigInt(highBits) << 32n) | BigInt(lowBits));
        this.largeOffsets.set(oid, fullOffset);

        // Update the object offset
        const entry = this.objectOffsets.get(oid);
        if (entry) {
          entry.offset = fullOffset;
        }
      }
    }

    // Read object types table (if present)
    if (objTypesChunk) {
      offset = objTypesChunk.offset;
      const typeMap: Record<number, string> = {
        1: 'commit',
        2: 'tree',
        3: 'blob',
        4: 'tag',
      };
      for (let i = 0; i < totalObjects; i++) {
        const oid = this.oidLookup[i];
        const typeByte = buffer[offset];
        offset++;
        const type = typeMap[typeByte];
        if (type) {
          this.objectTypes.set(oid, type);
        }
      }
    }

    // Note: Checksum verification would go here, but we skip it for now
    // Checksum length: 20 bytes for SHA-1, 32 bytes for SHA-256
    // const checksumByteLength = this.objectIdVersion === 2 ? 32 : 20;

    this._parsed = true;
  }

  /**
   * Looks up an OID and returns which packfile contains it and the offset.
   * Uses binary search with fanout table for O(log n) lookup.
   */
  async lookup(oid: string): Promise<MidxLookupResult | null> {
    await this.parse();

    // Normalize OID to lowercase
    const normalizedOid = oid.toLowerCase();

    // Use fanout table for binary search
    const firstByte = parseInt(normalizedOid.substring(0, 2), 16);
    const start = firstByte === 0 ? 0 : this.oidFanout[firstByte - 1];
    const end = this.oidFanout[firstByte];

    // Binary search within the range
    let left = start;
    let right = end - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midOid = this.oidLookup[mid];
      const comparison = normalizedOid.localeCompare(midOid);

      if (comparison === 0) {
        // Found it!
        const offsetEntry = this.objectOffsets.get(normalizedOid);
        if (!offsetEntry) {
          return null;
        }

        const result: MidxLookupResult = {
          packfileIndex: offsetEntry.packfileIndex,
          offset: offsetEntry.offset,
        };

        // Add object type if available
        const objectType = this.objectTypes.get(normalizedOid);
        if (objectType) {
          result.objectType = objectType;
        }

        return result;
      } else if (comparison < 0) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return null;
  }

  /**
   * Gets the packfile name for a given index.
   */
  async getPackfileName(index: number): Promise<string | null> {
    await this.parse();
    if (index >= 0 && index < this.packfileNames.length) {
      return this.packfileNames[index];
    }
    return null;
  }

  /**
   * Gets all packfile names.
   */
  async getPackfileNames(): Promise<string[]> {
    await this.parse();
    return [...this.packfileNames];
  }

  /**
   * Gets the total number of objects indexed.
   */
  async getObjectCount(): Promise<number> {
    await this.parse();
    return this.oidLookup.length;
  }

  /**
   * Gets the version of this MIDX.
   */
  async getVersion(): Promise<number> {
    await this.parse();
    return this.version;
  }

  /**
   * Helper to read a 32-bit big-endian unsigned integer from buffer.
   */
  private readUInt32BE(buffer: Uint8Array, offset: number): number {
    return (
      buffer[offset] * 0x1000000 +
      buffer[offset + 1] * 0x10000 +
      buffer[offset + 2] * 0x100 +
      buffer[offset + 3]
    );
  }
}
