/**
 * Sparse Checkout Manager
 * Parses patterns from .git/info/sparse-checkout and decides what belongs in the worktree.
 * 
 * Cone Mode: Strictly prefix-based matching (O(1) lookup via Set/Hash Map)
 * - Include: Root files
 * - Include: Recursive contents of specified directories
 */
import type { FileSystemFileHandle, FileSystemDirectoryHandle } from '@awesome-os/native-file-system-adapter-src';

export type SparseCheckoutMode = 'cone' | 'no-cone';

export class SparseCheckoutManager {
  private patterns: Set<string> = new Set();
  private directories: Set<string> = new Set();
  private exactPatterns: Set<string> = new Set(); // Track exact patterns for cone mode
  private mode: SparseCheckoutMode = 'cone';
  private enabled: boolean = false;

  /**
   * Loads sparse checkout patterns from .git/info/sparse-checkout file.
   */
  static async fromFile(
    handle: FileSystemFileHandle
  ): Promise<SparseCheckoutManager> {
    const manager = new SparseCheckoutManager();
    await manager.load(handle);
    return manager;
  }

  /**
   * Creates a manager from patterns array.
   */
  static fromPatterns(
    patterns: string[],
    mode: SparseCheckoutMode = 'cone'
  ): SparseCheckoutManager {
    const manager = new SparseCheckoutManager();
    manager.mode = mode;
    manager.setPatterns(patterns);
    manager.enabled = true;
    return manager;
  }

  /**
   * Loads patterns from a file handle.
   */
  async load(handle: FileSystemFileHandle): Promise<void> {
    const file = await handle.getFile();
    const text = await file.text();
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // Check for mode specification
    let modeLine = lines.find((line) => line.startsWith('!'));
    if (modeLine) {
      if (modeLine.includes('/*')) {
        this.mode = 'cone';
      } else {
        this.mode = 'no-cone';
      }
    }

    // Filter out mode lines
    const patternLines = lines.filter(
      (line) => !line.startsWith('!') && !line.startsWith('#')
    );

    this.setPatterns(patternLines);
    this.enabled = true;
  }

  /**
   * Sets patterns and builds lookup structures.
   */
  setPatterns(patterns: string[]): void {
    this.patterns.clear();
    this.directories.clear();
    this.exactPatterns.clear();

    for (const pattern of patterns) {
      // Normalize pattern (remove leading/trailing slashes)
      const normalized = pattern.replace(/^\/+|\/+$/g, '');

      if (normalized.length === 0) {
        continue;
      }

      if (this.mode === 'cone') {
        // Cone mode: prefix-based matching
        // Patterns are directories that should be included recursively
        this.exactPatterns.add(normalized);
        this.directories.add(normalized);
        // Also add all parent directories
        const parts = normalized.split('/');
        for (let i = 1; i <= parts.length; i++) {
          this.directories.add(parts.slice(0, i).join('/'));
        }
      } else {
        // No-cone mode: pattern matching (simplified - full implementation would need glob matching)
        this.patterns.add(normalized);
      }
    }
  }

  /**
   * Checks if a path matches the sparse checkout patterns.
   * @param path - File path relative to repository root
   * @returns true if the path should be included in the worktree
   */
  matches(path: string): boolean {
    if (!this.enabled) {
      return true; // If sparse checkout is not enabled, include everything
    }

    // Normalize path (remove leading slash)
    const normalized = path.replace(/^\/+/, '');

    if (this.mode === 'cone') {
      // Cone mode: O(1) prefix matching
      // Root files are always included
      if (!normalized.includes('/')) {
        return true;
      }

      // Check if path starts with any exact pattern
      for (const pattern of this.exactPatterns) {
        if (normalized === pattern || normalized.startsWith(pattern + '/')) {
          return true;
        }
      }

      // Check if path is a direct child of a parent directory (only 2-part paths)
      // This allows "src/index.ts" to match when pattern is "src/utils", but not "src/other/file.ts"
      const parts = normalized.split('/');
      if (parts.length === 2) {
        const parentDir = parts[0];
        // Only match if there's an exact pattern that shares this parent
        for (const pattern of this.exactPatterns) {
          if (pattern.startsWith(parentDir + '/')) {
            return true;
          }
        }
      }

      return false;
    } else {
      // No-cone mode: pattern matching
      // Simplified glob matching (full implementation would need full glob support)
      for (const pattern of this.patterns) {
        // Wildcard matches everything
        if (pattern === '*') {
          return true;
        }
        
        // Handle ** glob pattern (matches any path starting with prefix)
        // Pattern can be like "src/**" or "src**" - both mean "everything under src/"
        if (pattern.includes('**')) {
          // Find where ** starts
          const starIndex = pattern.indexOf('**');
          const prefix = pattern.slice(0, starIndex);
          // Remove trailing slash if present
          const cleanPrefix = prefix.replace(/\/+$/, '');
          if (cleanPrefix === '' || normalized === cleanPrefix || normalized.startsWith(cleanPrefix + '/')) {
            return true;
          }
        }
        // Handle * prefix pattern (e.g., *.md matches any file ending with .md)
        else if (pattern.startsWith('*.')) {
          const suffix = pattern.slice(1); // Remove '*' to get '.md'
          if (normalized.endsWith(suffix) || normalized === suffix.slice(1)) {
            return true;
          }
        }
        // Simple prefix matching for other patterns
        else if (normalized.startsWith(pattern)) {
          return true;
        }
      }
      return false;
    }
  }

  /**
   * Gets all included directories (cone mode).
   */
  getDirectories(): readonly string[] {
    return Object.freeze(Array.from(this.directories));
  }

  /**
   * Gets all patterns (no-cone mode).
   */
  getPatterns(): readonly string[] {
    return Object.freeze(Array.from(this.patterns));
  }

  /**
   * Checks if sparse checkout is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Gets the current mode.
   */
  getMode(): SparseCheckoutMode {
    return this.mode;
  }

  /**
   * Enables or disables sparse checkout.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
