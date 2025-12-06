/**
 * Git Loose Object Handle
 * Wraps a physical file (e.g., objects/0a/1b2c...).
 * readParsed(): Reads file -> Zlib Inflate -> Strip Header -> Return.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
  // PermissionState has no exported member, removing
} from '@awesome-os/native-file-system-adapter-src';

export type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag';

export interface ParsedGitObject {
  type: GitObjectType;
  content: Uint8Array;
  size: number;
}

export class GitLooseObjectHandle extends GitBaseHandle<FileSystemFileHandle> {
  get kind(): 'file' {
    return 'file';
  }

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
   * Reads and inflates the object.
   * Returns parsed type and raw content.
   */
  async readParsed(): Promise<ParsedGitObject> {
    const file = await this.getFile();
    const compressed = new Uint8Array(await file.arrayBuffer());

    // Decompress using zlib
    const decompressed = await this.inflate(compressed);

    // Parse header: "type size\0content"
    const nullIndex = decompressed.indexOf(0);
    if (nullIndex === -1) {
      throw new Error('Invalid git object format: missing null separator');
    }

    const header = new TextDecoder().decode(
      decompressed.slice(0, nullIndex)
    );
    const [type, sizeStr] = header.split(' ');

    if (!type || !sizeStr) {
      throw new Error('Invalid git object header format');
    }

    const size = parseInt(sizeStr, 10);
    if (isNaN(size)) {
      throw new Error('Invalid size in git object header');
    }

    const content = decompressed.slice(nullIndex + 1);

    // Verify size matches
    if (content.length !== size) {
      throw new Error(
        `Object size mismatch: expected ${size}, got ${content.length}`
      );
    }

    return {
      type: type as GitObjectType,
      content,
      size,
    };
  }

  /**
   * Helper to verify hash integrity.
   * Note: This requires the OID to be known, which should be derived from the path.
   */
  async verifyHash(expectedOid: string): Promise<boolean> {
    const parsed = await this.readParsed();
    const computedOid = await this.computeOid(parsed);
    return computedOid === expectedOid;
  }

  /**
   * Computes the SHA-1 hash of the object.
   */
  private async computeOid(parsed: ParsedGitObject): Promise<string> {
    // Reconstruct the object format: "type size\0content"
    const header = `${parsed.type} ${parsed.size}\0`;
    const headerBytes = new TextEncoder().encode(header);
    const combined = new Uint8Array(headerBytes.length + parsed.content.length);
    combined.set(headerBytes);
    combined.set(parsed.content, headerBytes.length);

    // Compute SHA-1
    const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Inflates zlib-compressed data.
   * Uses the Web Compression API (available in modern browsers and Node.js 18+).
   * Falls back to dynamic import of pako if available.
   */
  private async inflate(compressed: Uint8Array): Promise<Uint8Array> {
    // Try Web Compression API first (browser/Node.js 18+)
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new DecompressionStream('deflate');
        const writer = stream.writable.getWriter();
        // Ensure we pass a Uint8Array, because DecompressionStream needs BufferSource (not ArrayBuffer)
        // and the compressed input is already Uint8Array.
        // Fix: Ensure compressed is a regular Uint8Array backed by an ArrayBuffer (not SharedArrayBuffer or custom).
        const uint8 =
          compressed instanceof Uint8Array && compressed.buffer instanceof ArrayBuffer
            ? compressed
            : new Uint8Array(Uint8Array.prototype.slice.call(compressed));
        await writer.write(uint8);
        await writer.close();
        const reader = stream.readable.getReader();

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
        // If DecompressionStream fails, try fallback
        console.warn('DecompressionStream failed, trying fallback', error);
      }
    }

    // Fallback: try to use pako if available (common in Node.js environments)
    try {
      // Dynamic import to avoid requiring pako as a hard dependency
      const pako = await import('pako');
      return pako.inflate(compressed);
    } catch (error) {
      // If pako is not available, throw a helpful error
      throw new Error(
        'Zlib decompression not available. Please use an environment with DecompressionStream (Node.js 18+, modern browsers) or install pako: npm install pako'
      );
    }
  }
}
