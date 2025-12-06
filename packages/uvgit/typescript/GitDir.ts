/**
 * GitDir - The main coordinator class
 * Manages multiple providers and handles path resolution across them.
 */
import type {
  FileSystemHandle,
  FileSystemDirectoryHandle,
} from '@awesome-os/native-file-system-adapter-src';
import type { GitDirProvider } from './providers/GitDirProvider.ts';
import { GitDirFsProvider } from './providers/GitDirFsProvider.ts';
import { VirtualRefHandle } from './handles/VirtualRefHandle.ts';
import { GitDirWorktreeProvider } from './providers/GitDirWorktreeProvider.ts';
import { GitDirNamespaceProvider } from './providers/GitDirNamespaceProvider.ts';

export class GitDir {
  // Map for O(1) lookup by mount point, ensuring no overlap
  private providers: Map<string, GitDirProvider> = new Map();
  // Array to maintain insertion order for provider resolution
  private providerOrder: GitDirProvider[] = [];

  /**
   * Mount a provider at a specific mount point.
   * If a provider already exists at the same mount point, it will be replaced.
   * Providers are checked in order, so more specific providers should be mounted first.
   * @param provider - The provider to mount
   */
  mount(provider: GitDirProvider): void {
    const mountPoint = provider.mountPoint;
    
    // If a provider already exists at this mount point, replace it maintaining position
    const existing = this.providers.get(mountPoint);
    if (existing) {
      const index = this.providerOrder.indexOf(existing);
      if (index > -1) {
        // Replace at the same position
        this.providerOrder[index] = provider;
      } else {
        // Fallback: just add (shouldn't happen)
        this.providerOrder.push(provider);
      }
      // Update Map
      this.providers.set(mountPoint, provider);
    } else {
      // Add to both Map and ordered array
      this.providers.set(mountPoint, provider);
      this.providerOrder.push(provider);
    }
  }

  /**
   * Unmount a provider.
   * @param provider - The provider to unmount
   */
  unmount(provider: GitDirProvider): void {
    const mountPoint = provider.mountPoint;
    
    // Remove from Map if it matches
    if (this.providers.get(mountPoint) === provider) {
      this.providers.delete(mountPoint);
    }
    
    // Remove from ordered array
    const index = this.providerOrder.indexOf(provider);
    if (index > -1) {
      this.providerOrder.splice(index, 1);
    }
  }

  /**
   * Unmount a provider by its mount point.
   * @param mountPoint - The mount point of the provider to unmount
   */
  unmountByMountPoint(mountPoint: string): void {
    const provider = this.providers.get(mountPoint);
    if (provider) {
      this.unmount(provider);
    }
  }

  /**
   * Gets all mounted providers in mount order.
   */
  getProviders(): readonly GitDirProvider[] {
    // Return a frozen copy to ensure true readonly behavior
    return Object.freeze([...this.providerOrder]);
  }

  /**
   * Get a provider by its mount point.
   * @param mountPoint - The mount point to look up
   * @returns The provider at the mount point, or undefined if not found
   */
  getProvider(mountPoint: string): GitDirProvider | undefined {
    return this.providers.get(mountPoint);
  }

  /**
   * Check if a provider exists at a mount point.
   * @param mountPoint - The mount point to check
   * @returns True if a provider exists at the mount point
   */
  hasProvider(mountPoint: string): boolean {
    return this.providers.has(mountPoint);
  }

  /**
   * Get all mount points.
   * @returns An array of all mount points
   */
  getMountPoints(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Resolve a path to a handle.
   * Paths can be absolute (e.g., 'refs/heads/main') or relative.
   * @param path - The path to resolve (e.g., 'refs/heads/main', 'HEAD', 'objects/ab/cd...')
   * @returns The handle for the resolved path, or null if not found
   */
  async resolve(path: string): Promise<FileSystemHandle | null> {
    // Normalize path (remove .git/ prefix if present)
    if (path.startsWith('.git/')) {
      path = path.substring(5);
    }

    // Split path into segments
    const segments = path.split('/').filter((s) => s.length > 0);

    // Special handling for HEAD - use fast Map lookup for root provider
    if (path === 'HEAD' || (segments.length > 0 && segments[0] === 'HEAD')) {
      const rootProvider = this.providers.get('');
      if (rootProvider) {
        const handle = await rootProvider.getHandle(['HEAD'], this);
        if (handle) {
          return handle;
        }
      }
    }

    // Try each provider in reverse order (most specific first)
    // This ensures that more specific mount points are checked before general ones
    for (let i = this.providerOrder.length - 1; i >= 0; i--) {
      const provider = this.providerOrder[i];
      
      // Check if this path belongs to this provider's mount point
      if (provider.mountPoint === '') {
        // Root provider: try the full path (checked last)
        const handle = await provider.getHandle(segments, this);
        if (handle) {
          return handle;
        }
      } else if (segments.length > 0 && segments[0] === provider.mountPoint) {
        // Provider-specific path: remove mount point prefix
        const relativeSegments = segments.slice(1);
        const handle = await provider.getHandle(relativeSegments, this);
        if (handle) {
          return handle;
        }
      } else if (segments.length > 0 && provider.mountPoint.startsWith(segments[0])) {
        // Mount point is deeper (e.g., 'refs/heads' for path 'refs')
        const mountSegments = provider.mountPoint.split('/');
        if (
          segments.length >= mountSegments.length &&
          segments.slice(0, mountSegments.length).every(
            (seg, i) => seg === mountSegments[i]
          )
        ) {
          const relativeSegments = segments.slice(mountSegments.length);
          const handle = await provider.getHandle(relativeSegments, this);
          if (handle) {
            return handle;
          }
        }
      }
    }

    return null;
  }

  /**
   * Initialize all providers.
   */
  async init(): Promise<void> {
    for (const provider of this.providerOrder) {
      if (provider.init) {
        await provider.init();
      }
    }
  }

  /**
   * Create a GitDir from a FileSystemDirectoryHandle (convenience method).
   * This is the most common use case: opening a .git directory.
   */
  static async fromDirectoryHandle(
    rootHandle: FileSystemDirectoryHandle
  ): Promise<GitDir> {
    const gitDir = new GitDir();
    const provider = new GitDirFsProvider('', rootHandle);
    gitDir.mount(provider);
    await gitDir.init();
    return gitDir;
  }

  /**
   * Create a GitDir for a worktree.
   * @param worktreeDirHandle - Handle to .git/worktrees/{name} directory
   * @param mainRepoDirHandle - Handle to main .git directory
   * @param worktreeName - Name of the worktree
   */
  static async fromWorktree(
    worktreeDirHandle: FileSystemDirectoryHandle,
    mainRepoDirHandle: FileSystemDirectoryHandle,
    worktreeName: string
  ): Promise<GitDir> {
    const gitDir = new GitDir();
    const provider = new GitDirWorktreeProvider(
      worktreeDirHandle,
      mainRepoDirHandle,
      worktreeName
    );
    gitDir.mount(provider);
    await gitDir.init();
    return gitDir;
  }

  /**
   * Create a GitDir with a namespace.
   * @param baseGitDir - The base GitDir to wrap
   * @param namespace - The namespace name
   */
  static withNamespace(baseGitDir: GitDir, namespace: string): GitDir {
    const gitDir = new GitDir();
    
    // Wrap each provider with namespace
    for (const provider of baseGitDir.getProviders()) {
      const namespacedProvider = new GitDirNamespaceProvider(
        provider,
        namespace
      );
      gitDir.mount(namespacedProvider);
    }
    
    return gitDir;
  }
}
