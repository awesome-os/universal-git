/**
 * Commit Graph Handle
 * Parses and provides access to .git/objects/info/commit-graph file.
 * 
 * The commit graph enables fast reachability queries and merge-base calculations
 * without parsing full commit objects.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface CommitGraphEntry {
  oid: string;
  generation: number;
  parents: string[];
}

export class CommitGraphHandle extends GitBaseHandle<FileSystemFileHandle> {
  get kind(): 'file' {
    return 'file';
  }
  private _parsed: Map<string, CommitGraphEntry> | null = null;

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

  /**
   * Parses the commit graph file.
   * Implements commit graph format version 1 with chunks: OIDF, OIDL, CDAT
   */
  async parse(): Promise<Map<string, CommitGraphEntry>> {
    if (this._parsed) {
      return this._parsed;
    }

    const file = await this.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());

    // Check magic number: "CGPH" (Commit Graph)
    const magic = new TextDecoder().decode(buffer.slice(0, 4));
    if (magic !== 'CGPH') {
      throw new Error(`Invalid commit graph: wrong magic number ${magic}`);
    }

    // Read version (1 byte)
    const version = buffer[4];
    if (version !== 1 && version !== 2) {
      throw new Error(`Unsupported commit graph version: ${version} (only 1 and 2 supported)`);
    }

    // Read hash version (1 byte): 1 = SHA-1, 2 = SHA-256
    const hashVersion = buffer[5];
    const oidLength = hashVersion === 1 ? 20 : 32;

    // Read chunk count (1 byte)
    const chunkCount = buffer[6];

    // Chunk IDs
    const CHUNK_ID_OIDFANOUT = 0x4f494446; // 'OIDF'
    const CHUNK_ID_OIDLOOKUP = 0x4f49444c; // 'OIDL'
    const CHUNK_ID_COMMITDATA = 0x43444154; // 'CDAT'

    // Read chunk table (each chunk: 4 bytes ID + 8 bytes offset)
    interface ChunkInfo {
      id: number;
      offset: number;
    }
    const chunks: ChunkInfo[] = [];
    let offset = 8; // After header (4 magic + 1 version + 1 hash version + 1 chunk count + 1 reserved)
    
    // Skip reserved byte
    offset += 1;

    for (let i = 0; i < chunkCount; i++) {
      const id = this.readUInt32BE(buffer, offset);
      offset += 4;
      // For version 1, offset is 4 bytes. For version 2, it's 8 bytes.
      const chunkOffset = version === 1 
        ? this.readUInt32BE(buffer, offset)
        : Number(this.readUInt64BE(buffer, offset));
      offset += version === 1 ? 4 : 8;
      chunks.push({ id, offset: chunkOffset });
    }

    // Find required chunks
    const oidfanoutChunk = chunks.find((c) => c.id === CHUNK_ID_OIDFANOUT);
    const oidlookupChunk = chunks.find((c) => c.id === CHUNK_ID_OIDLOOKUP);
    const commitdataChunk = chunks.find((c) => c.id === CHUNK_ID_COMMITDATA);

    if (!oidfanoutChunk || !oidlookupChunk || !commitdataChunk) {
      throw new Error('Missing required commit graph chunks');
    }

    // Read OID fanout table (256 entries, 4 bytes each)
    offset = oidfanoutChunk.offset;
    const oidFanout: number[] = [];
    for (let i = 0; i < 256; i++) {
      oidFanout.push(this.readUInt32BE(buffer, offset));
      offset += 4;
    }
    const totalCommits = oidFanout[255];

    // Read OID lookup table (sorted list of commit OIDs)
    offset = oidlookupChunk.offset;
    const oidLookup: string[] = [];
    for (let i = 0; i < totalCommits; i++) {
      const oidBytes = buffer.slice(offset, offset + oidLength);
      oidLookup.push(
        Array.from(oidBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      );
      offset += oidLength;
    }

    // Read commit data chunk
    // Each entry: tree OID (oidLength bytes) + parent list + generation number + commit time + ...
    offset = commitdataChunk.offset;
    const entries = new Map<string, CommitGraphEntry>();

    for (let i = 0; i < totalCommits; i++) {
      const oid = oidLookup[i];
      
      // Skip tree OID (oidLength bytes)
      offset += oidLength;

      // Read parent count (1 or 2 bytes depending on version)
      let parentCount: number;
      if (version === 1) {
        parentCount = buffer[offset];
        offset += 1;
      } else {
        // Version 2: variable-width encoding
        parentCount = this.readVarInt(buffer, offset);
        offset += this.getVarIntLength(buffer, offset);
      }

      // Read parent OIDs
      const parents: string[] = [];
      for (let p = 0; p < parentCount; p++) {
        // Parent OID is stored as an index into oidLookup (4 bytes for version 1)
        const parentIndex = this.readUInt32BE(buffer, offset);
        offset += 4;
        if (parentIndex < oidLookup.length) {
          parents.push(oidLookup[parentIndex]);
        }
      }

      // Read generation number (4 bytes for version 1, variable for version 2)
      let generation: number;
      if (version === 1) {
        generation = this.readUInt32BE(buffer, offset);
        offset += 4;
      } else {
        generation = this.readVarInt(buffer, offset);
        offset += this.getVarIntLength(buffer, offset);
      }

      // Skip commit time and other fields (we focus on generation and parents)
      // For version 1: commit time (8 bytes) + root generation (1 byte)
      // For version 2: variable-width fields
      if (version === 1) {
        offset += 8 + 1; // commit time + root generation
      } else {
        // Version 2 has variable-width fields - skip them for now
        // In a full implementation, we'd parse these properly
        offset += 8; // Approximate skip
      }

      entries.set(oid.toLowerCase(), {
        oid,
        generation,
        parents,
      });
    }

    this._parsed = entries;
    return entries;
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

  /**
   * Helper to read a 64-bit big-endian unsigned integer from buffer.
   */
  private readUInt64BE(buffer: Uint8Array, offset: number): bigint {
    const high = this.readUInt32BE(buffer, offset);
    const low = this.readUInt32BE(buffer, offset + 4);
    return (BigInt(high) << 32n) | BigInt(low);
  }

  /**
   * Reads a variable-width integer (used in commit graph version 2).
   */
  private readVarInt(buffer: Uint8Array, offset: number): number {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = buffer[offset++];
      value |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  }

  /**
   * Gets the length of a variable-width integer.
   */
  private getVarIntLength(buffer: Uint8Array, offset: number): number {
    let length = 0;
    let byte: number;
    do {
      byte = buffer[offset + length];
      length++;
    } while (byte & 0x80);
    return length;
  }

  /**
   * Gets the generation number for a commit OID.
   * Generation numbers enable efficient reachability queries.
   */
  async getGeneration(oid: string): Promise<number | null> {
    const graph = await this.parse();
    const entry = graph.get(oid.toLowerCase());
    return entry ? entry.generation : null;
  }

  /**
   * Gets parent OIDs for a commit.
   */
  async getParents(oid: string): Promise<string[]> {
    const graph = await this.parse();
    const entry = graph.get(oid.toLowerCase());
    return entry ? entry.parents : [];
  }

  /**
   * Checks if a commit exists in the graph.
   */
  async hasCommit(oid: string): Promise<boolean> {
    const graph = await this.parse();
    return graph.has(oid.toLowerCase());
  }
}
