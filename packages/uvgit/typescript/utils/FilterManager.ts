/**
 * Filter Manager
 * Manages clean/smudge filters for Git LFS and other transformations.
 * 
 * Sits between the ODB (Object Database) and the Worktree.
 * - Clean (Worktree -> ODB): Transform files before storing (e.g., big file -> pointer)
 * - Smudge (ODB -> Worktree): Transform files after reading (e.g., pointer -> big file)
 */
import { LFSPointerParser } from './LFSPointerParser.ts';
import type { LFSClient, LFSCache } from '../handles/LFSWorktreeHandle.ts';

export interface GitAttributesEntry {
  pattern: string; // Glob pattern (e.g., "*.psd", "large-files/**")
  attributes: Record<string, string>; // e.g., { "filter": "lfs", "diff": "lfs", "merge": "lfs" }
}

export interface Filter {
  /**
   * CLEAN: Transform content from worktree format to ODB format.
   * @param content - Original content from worktree
   * @param path - File path
   * @returns Transformed content for ODB
   */
  clean?(content: Uint8Array, path: string): Promise<Uint8Array>;

  /**
   * SMUDGE: Transform content from ODB format to worktree format.
   * @param content - Content from ODB
   * @param path - File path
   * @returns Transformed content for worktree
   */
  smudge?(content: Uint8Array, path: string): Promise<Uint8Array>;
}

export class FilterManager {
  private filters: Map<string, Filter> = new Map();
  private attributes: GitAttributesEntry[] = [];

  /**
   * Registers a filter by name.
   */
  registerFilter(name: string, filter: Filter): void {
    this.filters.set(name, filter);
  }

  /**
   * Loads .gitattributes file.
   */
  async loadAttributes(
    attributesHandle: FileSystemFileHandle
  ): Promise<void> {
    const file = await attributesHandle.getFile();
    const text = await file.text();
    this.parseAttributes(text);
  }

  /**
   * Parses .gitattributes content.
   */
  parseAttributes(content: string): void {
    this.attributes = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) {
        continue;
      }

      const pattern = parts[0];
      const attributes: Record<string, string> = {};

      for (let i = 1; i < parts.length; i++) {
        const attr = parts[i];
        if (attr.includes('=')) {
          const [key, value] = attr.split('=');
          attributes[key] = value;
        } else {
          attributes[attr] = 'true';
        }
      }

      this.attributes.push({ pattern, attributes });
    }
  }

  /**
   * Gets attributes for a file path.
   */
  getAttributes(path: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Check patterns in order (last match wins)
    for (const entry of this.attributes) {
      if (this.matchesPattern(entry.pattern, path)) {
        Object.assign(result, entry.attributes);
      }
    }

    return result;
  }

  /**
   * Checks if a path matches a glob pattern.
   * Simplified implementation - full version would need proper glob matching.
   */
  private matchesPattern(pattern: string, path: string): boolean {
    // Convert glob to regex (simplified)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Applies CLEAN filter to content.
   */
  async applyClean(
    content: Uint8Array,
    path: string
  ): Promise<Uint8Array> {
    const attributes = this.getAttributes(path);
    const filterName = attributes['filter'];

    if (!filterName) {
      return content; // No filter, return as-is
    }

    const filter = this.filters.get(filterName);
    if (!filter || !filter.clean) {
      return content; // Filter not found or no clean method
    }

    return filter.clean(content, path);
  }

  /**
   * Applies SMUDGE filter to content.
   */
  async applySmudge(
    content: Uint8Array,
    path: string
  ): Promise<Uint8Array> {
    const attributes = this.getAttributes(path);
    const filterName = attributes['filter'];

    if (!filterName) {
      return content; // No filter, return as-is
    }

    const filter = this.filters.get(filterName);
    if (!filter || !filter.smudge) {
      return content; // Filter not found or no smudge method
    }

    return filter.smudge(content, path);
  }

  /**
   * Creates an LFS filter.
   */
  static createLFSFilter(
    lfsCache: LFSCache,
    lfsClient: LFSClient
  ): Filter {
    return {
      async clean(content: Uint8Array, path: string): Promise<Uint8Array> {
        // Only clean if content is large (LFS typically for large files)
        // In practice, this would check file size or other criteria
        if (content.length > 100 * 1024) {
          // Create LFS pointer
          const hashBuffer = await crypto.subtle.digest('SHA-256', content);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const oid =
            'sha256:' +
            hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

          // Store in LFS cache
          await lfsCache.set(oid, content);

          // Create pointer file
          const pointerContent = LFSPointerParser.create({
            version: 'https://git-lfs.github.com/spec/v1',
            oid,
            size: content.length,
          });

          return new TextEncoder().encode(pointerContent);
        }
        return content;
      },

      async smudge(content: Uint8Array, path: string): Promise<Uint8Array> {
        // Check if content is an LFS pointer
        if (LFSPointerParser.isPointer(content)) {
          const pointer = LFSPointerParser.parse(content);

          // Check cache first
          const cached = await lfsCache.get(pointer.oid);
          if (cached) {
            return cached;
          }

          // Download from LFS server
          const data = await lfsClient.download(pointer.oid);
          await lfsCache.set(pointer.oid, data);
          return data;
        }

        return content;
      },
    };
  }
}
