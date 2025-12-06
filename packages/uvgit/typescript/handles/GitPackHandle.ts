/**
 * The PackFile Handle (objects/pack/*.pack)
 * It acts like a file, but can perform optimized random access reads.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export class GitPackHandle extends GitBaseHandle<FileSystemFileHandle> {
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
   * Optimized read for specific byte range (essential for Packfiles).
   * Uses the native slice/blob logic to avoid reading the whole 1GB file into RAM.
   * @param start - Start byte offset (inclusive)
   * @param end - End byte offset (exclusive)
   * @returns The bytes in the specified range
   */
  async readChunk(start: number, end: number): Promise<Uint8Array> {
    const file = await this.getFile();
    const slice = file.slice(start, end);
    return new Uint8Array(await slice.arrayBuffer());
  }

  /**
   * Reads the pack file trailer (last 20 bytes for SHA-1, 32 bytes for SHA-256).
   * The trailer contains the pack file's checksum.
   * @param oidLength - Length of OID in bytes (20 for SHA-1, 32 for SHA-256)
   * @returns The pack file checksum as a hex string
   */
  async readTrailer(oidLength: number = 20): Promise<string> {
    const file = await this.getFile();
    const size = file.size;
    const trailer = await this.readChunk(size - oidLength, size);
    return Array.from(trailer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Verifies the pack file checksum by reading the trailer.
   * Note: Full verification would require reading and hashing the entire pack file,
   * which is expensive. This just reads the stored checksum.
   * @param expectedChecksum - Expected checksum (optional, will read from trailer if not provided)
   * @returns true if the trailer checksum matches (basic validation)
   */
  async verifyChecksum(expectedChecksum?: string): Promise<boolean> {
    try {
      const trailerChecksum = await this.readTrailer();
      if (expectedChecksum) {
        return trailerChecksum === expectedChecksum;
      }
      // If no expected checksum provided, just verify the trailer is readable
      return trailerChecksum.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Gets the size of the pack file.
   */
  async getSize(): Promise<number> {
    const file = await this.getFile();
    return file.size;
  }
}
