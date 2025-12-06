/**
 * Git Namespace Provider
 * A virtual provider that remaps reference paths.
 * 
 * When operating in a namespace, references are transparently translated:
 * - Request: "refs/heads/main"
 * - Actual: "refs/namespaces/my-namespace/refs/heads/main"
 * 
 * This allows different references to exist in the same repository without colliding.
 * The core logic doesn't need to know namespaces exist - the provider handles translation.
 */
import type { FileSystemHandle } from '@awesome-os/native-file-system-adapter-src';
import type { GitDirProvider } from './GitDirProvider.ts';
import type { GitDir } from '../GitDir.ts';

export class GitDirNamespaceProvider implements GitDirProvider {
  public readonly mountPoint = '';
  private baseProvider: GitDirProvider;
  private namespace: string;

  constructor(baseProvider: GitDirProvider, namespace: string) {
    this.baseProvider = baseProvider;
    this.namespace = namespace;
  }

  async getHandle(
    pathSegments: string[],
    context: GitDir
  ): Promise<FileSystemHandle | null> {
    // If no segments, return root (no namespace translation needed)
    if (pathSegments.length === 0) {
      return this.baseProvider.getHandle(pathSegments, context);
    }

    const firstSegment = pathSegments[0];

    // Namespace translation only applies to refs
    if (firstSegment === 'refs') {
      // Translate: refs/heads/main -> refs/namespaces/{namespace}/refs/heads/main
      const namespacedSegments = [
        'refs',
        'namespaces',
        this.namespace,
        ...pathSegments,
      ];
      return this.baseProvider.getHandle(namespacedSegments, context);
    }

    // HEAD might point to a namespaced ref
    if (firstSegment === 'HEAD') {
      // First try to read HEAD normally
      const headHandle = await this.baseProvider.getHandle(
        ['HEAD'],
        context
      );
      if (headHandle) {
        // If HEAD is a symbolic ref pointing to a refs/ path, we need to translate it
        // For now, return the handle as-is - the GitRefHandle will handle resolution
        return headHandle;
      }
    }

    // For all other paths (objects, config, etc.), pass through unchanged
    // Objects are shared across namespaces
    // Config might be namespace-specific, but for now we pass through
    return this.baseProvider.getHandle(pathSegments, context);
  }

  /**
   * Gets the namespace name.
   */
  getNamespace(): string {
    return this.namespace;
  }

  /**
   * Gets the base provider.
   */
  getBaseProvider(): GitDirProvider {
    return this.baseProvider;
  }

  /**
   * Translates a reference path to its namespaced version.
   * @param refPath - Reference path (e.g., "refs/heads/main")
   * @returns Namespaced path (e.g., "refs/namespaces/my-ns/refs/heads/main")
   */
  translateRefPath(refPath: string): string {
    if (refPath.startsWith('refs/')) {
      return `refs/namespaces/${this.namespace}/${refPath}`;
    }
    return refPath;
  }

  /**
   * Untranslates a namespaced reference path back to its original form.
   * @param namespacedPath - Namespaced path
   * @returns Original path or null if not a namespaced ref
   */
  untranslateRefPath(namespacedPath: string): string | null {
    const prefix = `refs/namespaces/${this.namespace}/refs/`;
    if (namespacedPath.startsWith(prefix)) {
      return 'refs/' + namespacedPath.substring(prefix.length);
    }
    return null;
  }

  async init(): Promise<void> {
    if (this.baseProvider.init) {
      await this.baseProvider.init();
    }
  }
}
