/**
 * Base interface for GitDir providers.
 * Providers are responsible for resolving paths within a specific mount point.
 */
import type { FileSystemHandle } from '@awesome-os/native-file-system-adapter-src';
import type { GitDir } from '../GitDir.ts';

export interface GitDirProvider {
  /**
   * The mount point where this provider is mounted (e.g., '', 'refs', 'objects').
   */
  readonly mountPoint: string;

  /**
   * Resolves a path relative to the mount point.
   * @param pathSegments - Array of path segments (e.g., ['heads', 'main'] for 'refs/heads/main' when mounted at 'refs')
   * @param context - The GitDir context for cross-provider resolution
   * @returns The handle for the resolved path, or null if not found
   */
  getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null>;

  /**
   * Initialize the provider (e.g., load caches, verify structure).
   */
  init?(): Promise<void>;
}
