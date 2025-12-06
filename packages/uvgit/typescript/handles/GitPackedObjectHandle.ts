/**
 * Git Packed Object Handle
 * This is a Virtual Handle. It does not represent a file on disk.
 * It represents a slice of a .pack file.
 * Constructed with: (PackFileHandle, Offset, Length).
 * readParsed(): Calls PackFileHandle.readChunk(offset) -> Apply Deltas (if needed) -> Return.
 */
import type { GitObjectType, ParsedGitObject } from './GitLooseObjectHandle.ts';
import { GitPackHandle } from './GitPackHandle.ts';

export class GitPackedObjectHandle {
  private packHandle: GitPackHandle;
  private offset: number;
  private oid: string;

  constructor(
    packHandle: GitPackHandle,
    offset: number,
    oid: string
  ) {
    this.packHandle = packHandle;
    this.offset = offset;
    this.oid = oid;
  }

  /**
   * Reads and parses the object from the pack file.
   * This is a simplified implementation that handles basic objects.
   * Full implementation would need to handle deltas (ref-delta and ofs-delta).
   */
  async readParsed(): Promise<ParsedGitObject> {
    // Read the object header from the pack file
    // Pack file format: [type:3 bits][size variable-length encoding]
    const headerStart = this.offset;
    const headerData = await this.packHandle.readChunk(
      headerStart,
      headerStart + 16
    ); // Read enough for header

    // Parse object type and size from pack format
    const firstByte = headerData[0];
    const objectType = (firstByte >> 4) & 0x07; // Bits 4-6
    const sizeStart = firstByte & 0x0f; // Lower 4 bits are first size bits

    // Decode variable-length size
    let size = sizeStart;
    let sizeBytes = 1;
    if (sizeStart & 0x0f) {
      // More size bytes follow
      let shift = 4;
      for (let i = 1; i < headerData.length; i++) {
        const byte = headerData[i];
        size |= (byte & 0x7f) << shift;
        sizeBytes++;
        if (!(byte & 0x80)) break; // Last byte
        shift += 7;
      }
    }

    // Map pack object type to git object type
    const typeMap: Record<number, GitObjectType> = {
      1: 'commit',
      2: 'tree',
      3: 'blob',
      4: 'tag',
      6: 'ofs-delta', // Offset delta (not handled in this simplified version)
      7: 'ref-delta', // Reference delta (not handled in this simplified version)
    };

    const gitType = typeMap[objectType];
    if (!gitType) {
      throw new Error(`Unknown pack object type: ${objectType}`);
    }

    // For deltas, we'd need to resolve them here
    // For now, we only handle non-delta objects
    if (objectType === 6 || objectType === 7) {
      throw new Error(
        'Delta objects are not yet supported in this implementation'
      );
    }

    // Read the compressed object data
    const dataStart = this.offset + sizeBytes;
    // We need to read until we find the end of the zlib stream
    // For now, we'll read a reasonable chunk and decompress
    // In a full implementation, we'd need to find the exact end of the zlib stream
    const estimatedEnd = dataStart + size * 2; // Rough estimate
    const compressedData = await this.packHandle.readChunk(
      dataStart,
      Math.min(estimatedEnd, dataStart + 1024 * 1024)
    ); // Read up to 1MB

    // Decompress the data
    const decompressed = await this.inflate(compressedData);

    // The decompressed data should match the size
    if (decompressed.length !== size) {
      // This might happen if we didn't read enough compressed data
      // In a full implementation, we'd need to read more or find the exact boundary
      throw new Error(
        `Size mismatch: expected ${size}, got ${decompressed.length}`
      );
    }

    return {
      type: gitType,
      content: decompressed,
      size,
    };
  }

  /**
   * Inflates zlib-compressed data.
   * Uses the Web Compression API or pako fallback.
   */
  private async inflate(compressed: Uint8Array): Promise<Uint8Array> {
    // Try Web Compression API first
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new DecompressionStream('deflate');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();

        writer.write(compressed);
        writer.close();

        const chunks: Uint8Array[] = [];
        let done = false;

        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            chunks.push(value);
          }
        }

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        return result;
      } catch (error) {
        console.warn('DecompressionStream failed, trying fallback', error);
      }
    }

    // Fallback: try pako
    try {
      const pako = await import('pako');
      return pako.inflate(compressed);
    } catch (error) {
      throw new Error(
        'Zlib decompression not available. Please use an environment with DecompressionStream or install pako.'
      );
    }
  }

  /**
   * Gets the OID of this object.
   */
  getOid(): string {
    return this.oid;
  }

  /**
   * Gets the offset in the pack file.
   */
  getOffset(): number {
    return this.offset;
  }
}
