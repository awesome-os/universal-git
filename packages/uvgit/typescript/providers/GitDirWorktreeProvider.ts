/**
 * Git Worktree Provider
 * A composite provider that combines:
 * - Shared: Objects and Refs from main repository
 * - Private: HEAD and Index from worktree directory
 * 
 * This allows multiple working directories to share the same repository history
 * while maintaining separate staging areas and HEAD pointers.
 */
import type { FileSystemHandle, FileSystemDirectoryHandle } from '@awesome-os/native-file-system-adapter-src';
import type { GitDirProvider } from './GitDirProvider.ts';
import type { GitDir } from '../GitDir.ts';
import { GitDirFsProvider } from './GitDirFsProvider.ts';
import { GitDirObjectsProvider } from './GitDirObjectsProvider.ts';

export class GitDirWorktreeProvider implements GitDirProvider {
  public readonly mountPoint = '';
  private mainRepoProvider: GitDirProvider | null = null;
  private worktreeDirHandle: FileSystemDirectoryHandle;
  private objectsProvider: GitDirObjectsProvider | null = null;
  private refsProvider: GitDirProvider | null = null;
  private worktreeName: string;

  constructor(
    worktreeDirHandle: FileSystemDirectoryHandle,
    mainRepoDirHandle: FileSystemDirectoryHandle,
    worktreeName: string
  ) {
    this.worktreeDirHandle = worktreeDirHandle;
    this.worktreeName = worktreeName;
    
    // Create shared providers from main repo
    // Objects are shared
    this.objectsProvider = new GitDirObjectsProvider(mainRepoDirHandle);
    
    // Refs are shared (use main repo's refs provider)
    this.refsProvider = new GitDirFsProvider('refs', mainRepoDirHandle);
    
    // Main repo provider for other shared resources (config, etc.)
    this.mainRepoProvider = new GitDirFsProvider('', mainRepoDirHandle);
  }

  async getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    if (pathSegments.length === 0) {
      // Root: return worktree directory
      return this.worktreeDirHandle;
    }

    const firstSegment = pathSegments[0];

    // Private to worktree: HEAD and index
    if (firstSegment === 'HEAD') {
      try {
        return await this.worktreeDirHandle.getFileHandle('HEAD');
      } catch {
        return null;
      }
    }

    if (firstSegment === 'index') {
      try {
        return await this.worktreeDirHandle.getFileHandle('index');
      } catch {
        return null;
      }
    }

    // State files (MERGE_HEAD, rebase-merge/, etc.) are also private
    if (
      firstSegment === 'MERGE_HEAD' ||
      firstSegment === 'CHERRY_PICK_HEAD' ||
      firstSegment === 'REBASE_HEAD' ||
      firstSegment.startsWith('rebase-') ||
      firstSegment.startsWith('sequencer')
    ) {
      try {
        if (pathSegments.length === 1) {
          return await this.worktreeDirHandle.getFileHandle(firstSegment);
        } else {
          // Directory (e.g., rebase-merge/)
          let current: FileSystemDirectoryHandle = this.worktreeDirHandle;
          for (const segment of pathSegments) {
            current = await current.getDirectoryHandle(segment);
          }
          return current;
        }
      } catch {
        return null;
      }
    }

    // Shared: objects
    if (firstSegment === 'objects') {
      if (this.objectsProvider) {
        return this.objectsProvider.getHandle(
          pathSegments.slice(1),
          context
        );
      }
    }

    // Shared: refs
    if (firstSegment === 'refs') {
      if (this.refsProvider) {
        return this.refsProvider.getHandle(pathSegments.slice(1), context);
      }
    }

    // Shared: config and other files from main repo
    if (
      firstSegment === 'config' ||
      firstSegment === 'hooks' ||
      firstSegment === 'info' ||
      firstSegment === 'logs'
    ) {
      if (this.mainRepoProvider) {
        return this.mainRepoProvider.getHandle(pathSegments, context);
      }
    }

    // Default: try worktree directory first, then main repo
    try {
      if (pathSegments.length === 1) {
        return await this.worktreeDirHandle.getFileHandle(firstSegment);
      } else {
        let current: FileSystemDirectoryHandle = this.worktreeDirHandle;
        for (const segment of pathSegments) {
          try {
            current = await current.getDirectoryHandle(segment);
          } catch {
            // Try as file
            return await current.getFileHandle(segment);
          }
        }
        return current;
      }
    } catch {
      // Fallback to main repo
      if (this.mainRepoProvider) {
        return this.mainRepoProvider.getHandle(pathSegments, context);
      }
    }

    return null;
  }

  /**
   * Gets the worktree name.
   */
  getWorktreeName(): string {
    return this.worktreeName;
  }

  /**
   * Gets the objects provider (for writing objects).
   */
  getObjectsProvider(): GitDirObjectsProvider | null {
    return this.objectsProvider;
  }

  async init(): Promise<void> {
    // Initialize shared providers
    if (this.objectsProvider?.init) {
      await this.objectsProvider.init();
    }
    if (this.mainRepoProvider?.init) {
      await this.mainRepoProvider.init();
    }
  }
}
