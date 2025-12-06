/**
 * Git Index Handle
 * Parses and serializes the .git/index file (binary format).
 * This is a complex binary format with strict ordering.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';
import { computeSha1 } from '../utils/objectWriter.ts';

export interface IndexEntry {
  path: string;
  oid: string; // 40-char hex string
  mode: number; // File mode (e.g., 100644 for regular file, 040000 for directory)
  ctimeSeconds: number;
  ctimeNanoseconds: number;
  mtimeSeconds: number;
  mtimeNanoseconds: number;
  dev: number;
  ino: number;
  uid: number;
  gid: number;
  size: number;
  stage?: number; // 0-3, default 0
  assumeValid?: boolean;
  skipWorktree?: boolean;
  intentToAdd?: boolean;
}

export class GitIndexHandle extends GitBaseHandle<FileSystemFileHandle>
  implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  private _parsed: IndexEntry[] | null = null;
  private _version: number = 2;

  async getFile(): Promise<File> {
    return this.rawHandle.getFile();
  }

  async createWritable(
    options?: { keepExistingData?: boolean }
  ): Promise<FileSystemWritableFileStream> {
    return this.rawHandle.createWritable(options);
  }

  // --- SMART METHODS ---

  /**
   * Parses the index file and returns entries.
   * Caches the result for subsequent calls.
   */
  async parse(): Promise<IndexEntry[]> {
    if (this._parsed) {
      return this._parsed;
    }

    const file = await this.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());

    if (buffer.length === 0) {
      this._parsed = [];
      return [];
    }

    // Check magic number: "DIRC"
    const magic = new TextDecoder().decode(buffer.slice(0, 4));
    if (magic !== 'DIRC') {
      throw new Error(`Invalid index file: wrong magic number ${magic}`);
    }

    // Read version (4 bytes)
    this._version = this.readUInt32BE(buffer, 4);
    if (this._version !== 2 && this._version !== 3) {
      throw new Error(`Unsupported index version: ${this._version}`);
    }

    // Read number of entries (4 bytes)
    const numEntries = this.readUInt32BE(buffer, 8);

    const entries: IndexEntry[] = [];
    let offset = 12; // After header

    for (let i = 0; i < numEntries; i++) {
      const entry = this.parseEntry(buffer, offset);
      entries.push(entry.entry);
      offset = entry.nextOffset;
    }

    // Verify checksum (last 20 bytes)
    const mainBuffer = buffer.slice(0, -20);
    const computedSha = await computeSha1(mainBuffer);
    const storedSha = Array.from(buffer.slice(-20))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (computedSha !== storedSha) {
      throw new Error(
        `Index checksum mismatch: expected ${storedSha}, got ${computedSha}`
      );
    }

    this._parsed = entries;
    return entries;
  }

  /**
   * Parses a single index entry.
   */
  private parseEntry(
    buffer: Uint8Array,
    offset: number
  ): { entry: IndexEntry; nextOffset: number } {
    const startOffset = offset;

    const entry: Partial<IndexEntry> = {};

    // Read fixed fields (62 bytes)
    entry.ctimeSeconds = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.ctimeNanoseconds = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.mtimeSeconds = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.mtimeNanoseconds = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.dev = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.ino = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.mode = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.uid = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.gid = this.readUInt32BE(buffer, offset);
    offset += 4;
    entry.size = this.readUInt32BE(buffer, offset);
    offset += 4;

    // Read OID (20 bytes)
    const oidBytes = buffer.slice(offset, offset + 20);
    entry.oid = Array.from(oidBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    offset += 20;

    // Read flags (2 bytes)
    const flags = this.readUInt16BE(buffer, offset);
    offset += 2;

    const assumeValid = Boolean(flags & 0b1000000000000000);
    const extended = Boolean(flags & 0b0100000000000000);
    const stage = (flags & 0b0011000000000000) >> 12;
    let nameLength = flags & 0b0000111111111111;

    entry.assumeValid = assumeValid;
    entry.stage = stage;

    // Version 3: Read extended flags if present
    let skipWorktree = false;
    let intentToAdd = false;
    if (this._version === 3 && extended) {
      const extendedFlags = this.readUInt16BE(buffer, offset);
      offset += 2;
      skipWorktree = Boolean(extendedFlags & 0b0000000000000001);
      intentToAdd = Boolean(extendedFlags & 0b0000000000000010);
      entry.skipWorktree = skipWorktree;
      entry.intentToAdd = intentToAdd;
    }

    // Handle large pathnames (nameLength === 0xFFF)
    if (nameLength === 0xfff) {
      nameLength = this.readUInt16BE(buffer, offset);
      offset += 2;
    }

    // Read path (find null terminator)
    const nullIndex = buffer.indexOf(0, offset);
    if (nullIndex === -1) {
      throw new Error('Could not find null terminator for path');
    }
    const pathBytes = buffer.slice(offset, nullIndex);
    entry.path = new TextDecoder().decode(pathBytes);
    offset = nullIndex + 1;

    // Skip padding to 8-byte boundary
    const entrySize = offset - startOffset;
    const padding = (8 - (entrySize % 8)) % 8;
    offset += padding;

    return { entry: entry as IndexEntry, nextOffset: offset };
  }

  /**
   * Updates the index with new entries.
   * Calculates SHA, sorting, and binary padding automatically.
   */
  async update(entries: IndexEntry[]): Promise<void> {
    // Sort entries by path (Git requires sorted index)
    const sorted = [...entries].sort((a, b) => {
      if (a.path < b.path) return -1;
      if (a.path > b.path) return 1;
      return (a.stage || 0) - (b.stage || 0);
    });

    const buffer = await this.serialize(sorted);
    const writable = await this.createWritable();
    await writable.write(buffer);
    await writable.close();

    // Clear cache
    this._parsed = null;
  }

  /**
   * Serializes index entries to binary format.
   */
  private async serialize(entries: IndexEntry[]): Promise<Uint8Array> {
    const header = new Uint8Array(12);
    const encoder = new TextEncoder();
    encoder.encodeInto('DIRC', header);
    this.writeUInt32BE(header, 4, this._version);
    this.writeUInt32BE(header, 8, entries.length);

    const entryBuffers: Uint8Array[] = [];

    for (const entry of entries) {
      const pathBytes = encoder.encode(entry.path);
      const nameLength = pathBytes.length > 0xfff ? 0xfff : pathBytes.length;
      const needsExtendedPathLength = pathBytes.length > 0xfff;

      // Calculate entry size
      let baseSize = 62; // Fixed fields
      if (this._version === 3 && (entry.skipWorktree || entry.intentToAdd)) {
        baseSize += 2; // Extended flags
      }
      if (needsExtendedPathLength) {
        baseSize += 2; // Path length
      }
      const totalSize = baseSize + pathBytes.length + 1; // +1 for null
      const length = Math.ceil(totalSize / 8) * 8; // Align to 8 bytes
      const padding = length - totalSize;

      const entryBuffer = new Uint8Array(length);
      let offset = 0;

      // Write fixed fields
      this.writeUInt32BE(entryBuffer, offset, entry.ctimeSeconds);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.ctimeNanoseconds);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.mtimeSeconds);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.mtimeNanoseconds);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.dev);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.ino);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.mode);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.uid);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.gid);
      offset += 4;
      this.writeUInt32BE(entryBuffer, offset, entry.size);
      offset += 4;

      // Write OID
      const oidBytes = entry.oid
        .match(/.{1,2}/g)!
        .map((b) => parseInt(b, 16));
      entryBuffer.set(oidBytes, offset);
      offset += 20;

      // Write flags
      const stage = entry.stage || 0;
      const assumeValid = entry.assumeValid ? 0b1000000000000000 : 0;
      const extended =
        this._version === 3 && (entry.skipWorktree || entry.intentToAdd)
          ? 0b0100000000000000
          : 0;
      const flags = assumeValid | extended | ((stage & 0b11) << 12) | nameLength;
      this.writeUInt16BE(entryBuffer, offset, flags);
      offset += 2;

      // Write extended flags (version 3)
      if (this._version === 3 && (entry.skipWorktree || entry.intentToAdd)) {
        const extendedFlags =
          (entry.skipWorktree ? 0b0000000000000001 : 0) |
          (entry.intentToAdd ? 0b0000000000000010 : 0);
        this.writeUInt16BE(entryBuffer, offset, extendedFlags);
        offset += 2;
      }

      // Write path length for large paths
      if (needsExtendedPathLength) {
        this.writeUInt16BE(entryBuffer, offset, pathBytes.length);
        offset += 2;
      }

      // Write path
      entryBuffer.set(pathBytes, offset);
      offset += pathBytes.length;
      entryBuffer[offset++] = 0; // Null terminator

      // Write padding
      for (let i = 0; i < padding; i++) {
        entryBuffer[offset++] = 0;
      }

      entryBuffers.push(entryBuffer);
    }

    // Combine header and entries
    const body = this.concatBuffers(entryBuffers);
    const main = this.concatBuffers([header, body]);

    // Compute checksum
    const sha = await computeSha1(main);
    const shaBytes = sha.match(/.{1,2}/g)!.map((b) => parseInt(b, 16));
    const checksum = new Uint8Array(shaBytes);

    return this.concatBuffers([main, checksum]);
  }

  /**
   * Streams index entries without loading the whole file into RAM.
   * Useful for `git status` on massive repos.
   */
  async *entries(): AsyncGenerator<IndexEntry> {
    const parsed = await this.parse();
    for (const entry of parsed) {
      yield entry;
    }
  }

  /**
   * Updates the 'skip-worktree' bit for all entries based on
   * the current SparseCheckoutManager patterns.
   * @param manager - The sparse checkout manager with patterns
   */
  async applySparsePatterns(
    manager: import('../utils/SparseCheckoutManager').SparseCheckoutManager
  ): Promise<void> {
    const entries = await this.parse();

    for (const entry of entries) {
      const shouldBeInWorktree = manager.matches(entry.path);
      // If matches, clear skip-worktree. If not, set it.
      if (!entry.skipWorktree) {
        entry.skipWorktree = !shouldBeInWorktree;
      } else {
        entry.skipWorktree = !shouldBeInWorktree;
      }
    }

    // Write updated entries back
    await this.update(entries);
  }

  /**
   * Flushes the index (writes changes to disk).
   * Alias for update() with current entries.
   */
  async flush(): Promise<void> {
    const entries = await this.parse();
    await this.update(entries);
  }

  // Helper methods
  private readUInt32BE(buffer: Uint8Array, offset: number): number {
    return (
      buffer[offset] * 0x1000000 +
      buffer[offset + 1] * 0x10000 +
      buffer[offset + 2] * 0x100 +
      buffer[offset + 3]
    );
  }

  private readUInt16BE(buffer: Uint8Array, offset: number): number {
    return buffer[offset] * 0x100 + buffer[offset + 1];
  }

  private writeUInt32BE(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = (value >>> 24) & 0xff;
    buffer[offset + 1] = (value >>> 16) & 0xff;
    buffer[offset + 2] = (value >>> 8) & 0xff;
    buffer[offset + 3] = value & 0xff;
  }

  private writeUInt16BE(buffer: Uint8Array, offset: number, value: number): void {
    buffer[offset] = (value >>> 8) & 0xff;
    buffer[offset + 1] = value & 0xff;
  }

  private concatBuffers(buffers: Uint8Array[]): Uint8Array {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }
}
