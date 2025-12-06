/**
 * Git Pack Index Handle
 * Parses .idx files to provide OID-to-offset mapping for pack files.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PackIndexEntry {
  oid: string;
  offset: number;
  crc?: number;
}

export class GitPackIndexHandle extends GitBaseHandle<FileSystemFileHandle> {
  // 'kind' is inherited as an accessor from GitBaseHandle; do not override as a property
  private _parsed: Map<string, PackIndexEntry> | null = null;
  private _packfileSha: string | null = null;
  private _objectCount: number = 0;

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
   * Parses the .idx file and returns a map of OID -> offset.
   * Caches the result for subsequent calls.
   */
  async parse(): Promise<Map<string, PackIndexEntry>> {
    if (this._parsed) {
      return this._parsed;
    }

    const file = await this.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());
    const entries = new Map<string, PackIndexEntry>();

    // Check magic number (first 4 bytes: ff 74 4f 63)
    const magic = Array.from(buffer.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (magic !== 'ff744f63') {
      throw new Error('Invalid pack index file: wrong magic number');
    }

    // Read version (next 4 bytes, should be 2)
    const version = this.readUInt32BE(buffer, 4);
    if (version !== 2) {
      throw new Error(
        `Unsupported pack index version: ${version} (only version 2 is supported)`
      );
    }

    // Read fanout table (256 entries, 4 bytes each = 1024 bytes)
    // The fanout table at index i tells us how many objects have first byte <= i
    // Entry 255 contains the total number of objects
    const fanoutTable: number[] = [];
    for (let i = 0; i < 256; i++) {
      fanoutTable[i] = this.readUInt32BE(buffer, 8 + i * 4);
    }
    this._objectCount = fanoutTable[255];

    // Read hashes (objectCount * 20 bytes for SHA-1)
    const hashStart = 8 + 256 * 4; // After magic + version + fanout
    const hashes: string[] = [];
    for (let i = 0; i < this._objectCount; i++) {
      const hashBytes = buffer.slice(
        hashStart + i * 20,
        hashStart + i * 20 + 20
      );
      hashes[i] = Array.from(hashBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Read CRCs (objectCount * 4 bytes)
    const crcStart = hashStart + this._objectCount * 20;
    const crcs: number[] = [];
    for (let i = 0; i < this._objectCount; i++) {
      crcs[i] = this.readUInt32BE(buffer, crcStart + i * 4);
    }

    // Read offsets (objectCount * 4 bytes)
    const offsetStart = crcStart + this._objectCount * 4;
    const offsets: number[] = [];
    for (let i = 0; i < this._objectCount; i++) {
      offsets[i] = this.readUInt32BE(buffer, offsetStart + i * 4);
    }

    // Read packfile SHA (last 20 bytes)
    const packfileShaStart = buffer.length - 20;
    const packfileShaBytes = buffer.slice(
      packfileShaStart,
      packfileShaStart + 20
    );
    this._packfileSha = Array.from(packfileShaBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Build the map
    for (let i = 0; i < this._objectCount; i++) {
      entries.set(hashes[i], {
        oid: hashes[i],
        offset: offsets[i],
        crc: crcs[i],
      });
    }

    this._parsed = entries;
    return entries;
  }

  /**
   * Looks up an OID in the index and returns its offset in the pack file.
   * @param oid - The object ID (40-char hex string for SHA-1)
   * @returns The offset in the pack file, or null if not found
   */
  async lookup(oid: string): Promise<number | null> {
    const index = await this.parse();
    const entry = index.get(oid.toLowerCase());
    return entry ? entry.offset : null;
  }

  /**
   * Gets the packfile SHA from the index trailer.
   */
  async getPackfileSha(): Promise<string> {
    if (this._packfileSha) {
      return this._packfileSha;
    }
    await this.parse(); // This will set _packfileSha
    return this._packfileSha!;
  }

  /**
   * Gets the number of objects in this pack.
   */
  async getObjectCount(): Promise<number> {
    if (this._objectCount > 0) {
      return this._objectCount;
    }
    await this.parse(); // This will set _objectCount
    return this._objectCount;
  }

  /**
   * Gets all OIDs in this pack index.
   */
  async getAllOids(): Promise<string[]> {
    const index = await this.parse();
    return Array.from(index.keys());
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
