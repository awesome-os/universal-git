/**
 * LFS Worktree Handle
 * Handles Git LFS files in the worktree.
 * 
 * SMUDGE: Reading from Object DB to write to Disk.
 * Instead of writing the 100 bytes pointer, download the 1GB file.
 */
import { GitBaseHandle } from './GitBaseHandle.ts';
import type {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';
import { LFSPointerParser, type LFSPointer } from '../utils/LFSPointerParser.ts';

export interface LFSCache {
  /**
   * Gets cached LFS object by OID.
   */
  get(oid: string): Promise<Uint8Array | null>;

  /**
   * Stores LFS object in cache.
   */
  set(oid: string, data: Uint8Array): Promise<void>;
}

export interface LFSClient {
  /**
   * Downloads LFS object from server.
   */
  download(oid: string): Promise<Uint8Array>;
}

export class LFSWorktreeHandle extends GitBaseHandle<FileSystemFileHandle>
  implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  private lfsCache: LFSCache;
  private lfsClient: LFSClient;

  constructor(
    rawHandle: FileSystemFileHandle,
    lfsCache: LFSCache,
    lfsClient: LFSClient
  ) {
    super(rawHandle);
    this.lfsCache = lfsCache;
    this.lfsClient = lfsClient;
  }

  async getFile(): Promise<File> {
    return this.rawHandle.getFile();
  }

  async createWritable(
    options?: { keepExistingData?: boolean }
  ): Promise<FileSystemWritableFileStream> {
    return this.rawHandle.createWritable(options);
  }

  /**
   * SMUDGE: Reading from Object DB to write to Disk.
   * Instead of writing the 100 bytes pointer, download the 1GB file.
   * @param pointerContent - The LFS pointer file content
   */
  async writeSmudge(pointerContent: Uint8Array): Promise<void> {
    const pointer = LFSPointerParser.parse(pointerContent);

    // 1. Check LFS Cache (usually .git/lfs/objects/...)
    const cached = await this.lfsCache.get(pointer.oid);

    if (cached) {
      // Write cached data
      const writable = await this.createWritable();
      await writable.write(cached);
      await writable.close();
    } else {
      // 2. Download from LFS Server via HTTP
      const data = await this.lfsClient.download(pointer.oid);

      // Store in cache for future use
      await this.lfsCache.set(pointer.oid, data);

      // Write downloaded data
      const writable = await this.createWritable();
      await writable.write(data);
      await writable.close();
    }
  }

  /**
   * CLEAN: Writing from Worktree to Object DB.
   * Instead of storing the 1GB file, create a 100 bytes pointer.
   * @param fileContent - The large file content
   * @returns LFS pointer file content
   */
  async createClean(fileContent: Uint8Array): Promise<Uint8Array> {
    // Compute SHA-256 hash of file content
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileContent);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const oid = 'sha256:' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Store in LFS cache
    await this.lfsCache.set(oid, fileContent);

    // Create pointer file
    const pointer: LFSPointer = {
      version: 'https://git-lfs.github.com/spec/v1',
      oid,
      size: fileContent.length,
    };

    const pointerContent = LFSPointerParser.create(pointer);
    return new TextEncoder().encode(pointerContent);
  }
}
