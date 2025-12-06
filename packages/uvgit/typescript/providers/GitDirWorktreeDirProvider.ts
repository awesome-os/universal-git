/**
 * Worktree Directory Provider
 * Projects the worktree directory, hiding files marked with skip-worktree.
 * 
 * When checkout runs, it consults the Index:
 * - If entry.skipWorktree == true: Do NOT write file to disk (hide it)
 * - If entry.skipWorktree == false: Write file to disk (show it)
 */
import type {
  FileSystemHandle,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
} from '@awesome-os/native-file-system-adapter-src';
import type { GitDirProvider } from './GitDirProvider.ts';
import type { GitDir } from '../GitDir.ts';
import { GitIndexHandle } from '../handles/GitIndexHandle.ts';

export class GitDirWorktreeDirProvider implements GitDirProvider {
  public readonly mountPoint = '';
  private worktreeDirHandle: FileSystemDirectoryHandle;
  private indexHandle: GitIndexHandle | null = null;
  private skipWorktreePaths: Set<string> = new Set();

  constructor(
    worktreeDirHandle: FileSystemDirectoryHandle,
    gitDir: GitDir
  ) {
    this.worktreeDirHandle = worktreeDirHandle;
    this.loadSkipWorktreePaths(gitDir);
  }

  /**
   * Loads the set of paths that should be skipped from the index.
   */
  private async loadSkipWorktreePaths(gitDir: GitDir): Promise<void> {
    try {
      const indexHandle = await gitDir.resolve('index');
      if (indexHandle instanceof GitIndexHandle) {
        this.indexHandle = indexHandle;
        const entries = await indexHandle.parse();
        for (const entry of entries) {
          if (entry.skipWorktree) {
            this.skipWorktreePaths.add(entry.path);
          }
        }
      }
    } catch {
      // Index might not exist yet, that's okay
    }
  }

  async getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    // Rebuild path from segments
    const path = pathSegments.join('/');

    // Check if this path should be skipped
    if (this.skipWorktreePaths.has(path)) {
      return null; // Hide the file
    }

    // Check parent directories - if any parent is skipped, this should be too
    const pathParts = path.split('/');
    for (let i = 1; i < pathParts.length; i++) {
      const parentPath = pathParts.slice(0, i).join('/');
      if (this.skipWorktreePaths.has(parentPath)) {
        return null; // Parent is skipped, so this is hidden
      }
    }

    // Path is not skipped, return the actual handle
    try {
      if (pathSegments.length === 0) {
        return this.worktreeDirHandle;
      }

      let current: FileSystemDirectoryHandle = this.worktreeDirHandle;
      for (let i = 0; i < pathSegments.length - 1; i++) {
        current = await current.getDirectoryHandle(pathSegments[i]);
      }

      const lastSegment = pathSegments[pathSegments.length - 1];
      try {
        return await current.getFileHandle(lastSegment);
      } catch {
        return await current.getDirectoryHandle(lastSegment);
      }
    } catch {
      return null;
    }
  }

  /**
   * Refreshes the skip-worktree paths from the index.
   * Call this after the index is updated.
   */
  async refresh(): Promise<void> {
    if (this.indexHandle) {
      this.skipWorktreePaths.clear();
      const entries = await this.indexHandle.parse();
      for (const entry of entries) {
        if (entry.skipWorktree) {
          this.skipWorktreePaths.add(entry.path);
        }
      }
    }
  }

  /**
   * Checks if a path is skipped (hidden from worktree).
   */
  isSkipped(path: string): boolean {
    return this.skipWorktreePaths.has(path);
  }

  async init(): Promise<void> {
    // Initialization handled in constructor
  }
}
