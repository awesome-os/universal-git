/**
 * Base class for all Smart Handles.
 * It strictly implements the Standard File System Access API.
 */
import type {
  FileSystemHandle,
} from '@awesome-os/native-file-system-adapter-src';

export type FileSystemHandleKind = 'file' | 'directory';

/**
 * Base class for all our Smart Handles.
 * It strictly implements the Standard API.
 */
export abstract class GitBaseHandle<T extends FileSystemHandle> {
  protected readonly rawHandle: T;

  constructor(rawHandle: T) {
    this.rawHandle = rawHandle;
  }

  get kind(): FileSystemHandleKind {
    return this.rawHandle.kind;
  }

  get name(): string {
    return this.rawHandle.name;
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    // If the other is also one of our wrappers, unwrap it
    const target =
      other instanceof GitBaseHandle ? other.rawHandle : other;
    return this.rawHandle.isSameEntry(target);
  }

  // Allow access to the raw handle if needed by external libs
  get native(): T {
    return this.rawHandle;
  }
}
