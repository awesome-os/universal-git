/**
 * Mock provider for testing GitDir functionality
 */
import type { 
  FileSystemHandle,
  FileSystemFileHandle,
  FileSystemDirectoryHandle 
} from '@awesome-os/native-file-system-adapter-src';
import type { GitDir } from '../../GitDir.ts';
import type { GitDirProvider } from '../../providers/GitDirProvider.ts';

// Symbol for adapter property (required by FileSystemHandle interface)
const kAdapter = Symbol('adapter');

/**
 * Creates a mock provider for testing
 */
export class MockProvider implements GitDirProvider {
  public readonly mountPoint: string;
  private handles: Map<string, FileSystemHandle | null> = new Map();
  public initCallCount = 0;

  constructor(mountPoint: string) {
    this.mountPoint = mountPoint;
  }

  /**
   * Register a handle for a path
   */
  registerHandle(pathSegments: string[], handle: FileSystemHandle | null): void {
    const key = pathSegments.join('/');
    this.handles.set(key, handle);
  }

  /**
   * Register a handle that should not be found
   */
  registerNotFound(pathSegments: string[]): void {
    this.registerHandle(pathSegments, null);
  }

  async getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    const key = pathSegments.join('/');
    return this.handles.get(key) ?? null;
  }

  async init(): Promise<void> {
    this.initCallCount++;
  }

  /**
   * Clear all registered handles
   */
  clear(): void {
    this.handles.clear();
  }
}

/**
 * Creates a mock FileSystemHandle for testing
 */
export class MockFileHandle implements FileSystemHandle {
  public readonly kind = 'file' as const;
  public readonly name: string;
  private fileContent: File | null = null;
  // @ts-ignore - kAdapter symbol property required by FileSystemHandle interface
  [kAdapter]: any = null;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Set the file content for getFile()
   */
  setFile(file: File): void {
    this.fileContent = file;
  }

  async getFile(): Promise<File> {
    if (this.fileContent) {
      return this.fileContent;
    }
    // Default: return empty file
    return new File([], this.name);
  }

  async createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream> {
    // Return a mock writable stream
    return {
      write: async (data: string | BufferSource | Blob) => {},
      seek: async (position: number) => {},
      truncate: async (size: number) => {},
      close: async () => {},
    } as any;
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return this === other;
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async remove(options: { recursive?: boolean } = {}): Promise<void> {
    // Mock implementation - no-op for testing
  }
}

/**
 * Creates a mock FileSystemDirectoryHandle for testing
 */
export class MockDirectoryHandle implements FileSystemDirectoryHandle {
  public readonly kind = 'directory' as const;
  public readonly name: string;
  private files: Map<string, FileSystemFileHandle> = new Map();
  private directories: Map<string, FileSystemDirectoryHandle> = new Map();
  // @ts-ignore - kAdapter symbol property required by FileSystemHandle interface
  [kAdapter]: any = null;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Register a file in this directory
   */
  registerFile(name: string, handle: FileSystemFileHandle): void {
    this.files.set(name, handle);
  }

  /**
   * Register a directory in this directory
   */
  registerDirectory(name: string, handle: FileSystemDirectoryHandle): void {
    this.directories.set(name, handle);
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return this === other;
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async remove(options: { recursive?: boolean } = {}): Promise<void> {
    // Mock implementation - no-op for testing
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const handle = this.files.get(name);
    if (handle) {
      return handle;
    }
    if (options?.create) {
      const newHandle = new MockFileHandle(name);
      this.files.set(name, newHandle);
      return newHandle;
    }
    throw new Error(`File not found: ${name}`);
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    const handle = this.directories.get(name);
    if (handle) {
      return handle;
    }
    if (options?.create) {
      const newHandle = new MockDirectoryHandle(name);
      this.directories.set(name, newHandle);
      return newHandle;
    }
    throw new Error(`Directory not found: ${name}`);
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    throw new Error('Not implemented in mock');
  }

  async resolve(name: string): Promise<FileSystemHandle | null> {
    throw new Error('Not implemented in mock');
  }

  keys(): AsyncIterableIterator<string> {
    throw new Error('Not implemented in mock');
  }

  values(): AsyncIterableIterator<FileSystemHandle> {
    throw new Error('Not implemented in mock');
  }

  entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    throw new Error('Not implemented in mock');
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]> {
    return this.entries();
  }
}
