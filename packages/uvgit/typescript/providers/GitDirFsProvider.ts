/**
 * Basic FileSystem Provider
 * Navigates folders using the standard File System Access API.
 */
import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from '@awesome-os/native-file-system-adapter-src';
import type { GitDirProvider } from './GitDirProvider.ts';
import type { GitDir } from '../GitDir.ts';
import { GitRefHandle } from '../handles/GitRefHandle.ts';
import { GitLooseObjectHandle } from '../handles/GitLooseObjectHandle.ts';
import { GitPackHandle } from '../handles/GitPackHandle.ts';
import { GitPackIndexHandle } from '../handles/GitPackIndexHandle.ts';

export class GitDirFsProvider implements GitDirProvider {
  public readonly mountPoint: string;
  private rootHandle: FileSystemDirectoryHandle;

  constructor(
    mountPoint: string,
    rootHandle: FileSystemDirectoryHandle // The physical root (e.g. .git folder)
  ) {
    this.mountPoint = mountPoint;
    this.rootHandle = rootHandle;
  }

  async getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    // Traverse the standard FS API
    let current: FileSystemHandle = this.rootHandle;

    for (const segment of pathSegments) {
      if (current.kind !== 'directory') return null;

      const dir = current as FileSystemDirectoryHandle;
      try {
        // Try file first
        current = await dir.getFileHandle(segment);
      } catch {
        try {
          // Then directory
          current = await dir.getDirectoryHandle(segment);
        } catch {
          return null; // Not found
        }
      }
    }

    // WRAP IT before returning
    // This ensures that asking for "refs/heads/main" returns a GitRefHandle
    if (current.kind === 'file') {
      const fileHandle = current as FileSystemFileHandle;

      // Factory logic: determine handle type based on path
      const fullPath = this.mountPoint
        ? `${this.mountPoint}/${pathSegments.join('/')}`
        : pathSegments.join('/');

      // Check if it's a loose object (objects/ab/cd...) - check before refs to avoid conflicts
      if (
        this.mountPoint === 'objects' ||
        (this.mountPoint === '' &&
          pathSegments.length >= 3 &&
          pathSegments[0] === 'objects' &&
          pathSegments[1].length === 2 &&
          /^[0-9a-f]{2}$/i.test(pathSegments[1])) ||
        (this.mountPoint === '' &&
          pathSegments.length === 2 &&
          pathSegments[0].length === 2 &&
          /^[0-9a-f]{2}$/i.test(pathSegments[0]) &&
          pathSegments[0] !== 'refs'
        )
      ) {
        return new GitLooseObjectHandle(fileHandle) as unknown as FileSystemHandle;
      }

      // Check if it's a ref
      if (
        this.mountPoint === 'refs' ||
        fullPath.startsWith('refs/') ||
        pathSegments[0] === 'refs'
      ) {
        return new GitRefHandle(fileHandle, context) as unknown as FileSystemHandle;
      }

      // Check if it's a pack file
      if (current.name.endsWith('.pack')) {
        return new GitPackHandle(fileHandle) as unknown as FileSystemHandle;
      }

      // Check if it's a pack index file
      if (current.name.endsWith('.idx') && pathSegments[0] === 'pack') {
        return new GitPackIndexHandle(fileHandle) as unknown as FileSystemHandle;
      }

      // Default: return raw handle
      return current;
    } else {
      // Directory: return as-is (could be wrapped in GitDirectoryHandle in future)
      return current;
    }
  }

  async init(): Promise<void> {
    // No initialization needed for basic FS provider
  }
}
