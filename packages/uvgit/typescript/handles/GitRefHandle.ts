/**
 * The Ref Handle (refs/heads/main)
 * It acts like a file (you can read the text), but it also acts like a pointer.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';
import type { GitDir } from '../GitDir.ts';

// FileSystemCreateWritableOptions is not exported, so we define it inline
export interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean;
}

export class GitRefHandle extends GitBaseHandle<FileSystemFileHandle>
  implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  private context: GitDir;

  constructor(
    rawHandle: FileSystemFileHandle,
    context: GitDir // Inject context to allow resolving references
  ) {
    super(rawHandle);
    this.context = context;
  }

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
   * Directly reads the OID string, trimming whitespace.
   */
  async readOid(): Promise<string> {
    const file = await this.getFile();
    const text = await file.text();
    return text.trim();
  }

  /**
   * Follows the reference.
   * If it's a symbolic ref (ref: refs/heads/...), it returns that handle.
   * If it's a direct ref (SHA), it returns the Object Handle from the ODB.
   */
  async resolve(): Promise<FileSystemHandle | null> {
    const content = await this.readOid();

    if (content.startsWith('ref: ')) {
      const targetRef = content.substring(5).trim();
      return this.context.resolve(targetRef);
    }

    // It is an OID, so we return the handle to the Object in the ODB
    // effectively: .git/objects/ab/cdef...
    // OID format: 40-char hex string, split into 2-char prefix and 38-char suffix
    if (content.length === 40 && /^[0-9a-f]{40}$/i.test(content)) {
      const prefix = content.substring(0, 2);
      const suffix = content.substring(2);
      return this.context.resolve(`objects/${prefix}/${suffix}`);
    }

    return null;
  }

  /**
   * Updates the reference to point to a new OID.
   * @param oid - The new OID to write (40-char hex string for SHA-1)
   */
  async updateOid(oid: string): Promise<void> {
    // Validate OID format
    if (oid.length !== 40 || !/^[0-9a-f]{40}$/i.test(oid)) {
      throw new Error(`Invalid OID format: ${oid}`);
    }

    const writable = await this.createWritable();
    const encoder = new TextEncoder();
    await writable.write(encoder.encode(oid + '\n'));
    await writable.close();
  }

  /**
   * Updates the reference to point to another reference (symbolic ref).
   * @param targetRef - The target reference path (e.g., 'refs/heads/main')
   */
  async updateSymbolicRef(targetRef: string): Promise<void> {
    const writable = await this.createWritable();
    const encoder = new TextEncoder();
    await writable.write(encoder.encode(`ref: ${targetRef}\n`));
    await writable.close();
  }
}
