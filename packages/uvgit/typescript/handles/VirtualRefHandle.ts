/**
 * Virtual Ref Handle (Packed/Computed)
 * Implements FileSystemFileHandle but operations are handled in memory or denied.
 */
import type {
  FileSystemFileHandle,
  FileSystemHandle,
  FileSystemWritableFileStream,
} from '@awesome-os/native-file-system-adapter-src';

export class VirtualRefHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  readonly name: string;
  private oid: string;

  constructor(name: string, oid: string) {
    this.name = name;
    this.oid = oid;
  }

  async getFile(): Promise<File> {
    // Create a virtual file object on the fly
    return new File([this.oid + '\n'], this.name, { type: 'text/plain' });
  }

  // Packed refs are read-only via this handle.
  // To update, one must write a new loose ref (masking the packed one)
  // or rewrite the packed-refs file.
  async createWritable(): Promise<FileSystemWritableFileStream> {
    throw new Error(
      'Cannot write directly to a packed ref. Use the RefManager to promote to loose ref.'
    );
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    if (other instanceof VirtualRefHandle) {
      return other.name === this.name && other.oid === this.oid;
    }
    return false;
  }

  // Smart Method
  async readOid(): Promise<string> {
    return this.oid;
  }
}
