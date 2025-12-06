/**
 * Shallow Boundary
 * Manages shallow repository boundaries defined in .git/shallow file.
 * 
 * Shallow repositories have "cut off" points where history stops.
 * These are defined by OIDs in .git/shallow file.
 */
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';

export class ShallowBoundary {
  private shallowOids: Set<string> = new Set();
  private enabled: boolean = false;

  /**
   * Loads shallow OIDs from .git/shallow file.
   */
  static async fromFile(
    shallowHandle: FileSystemFileHandle
  ): Promise<ShallowBoundary> {
    const boundary = new ShallowBoundary();
    await boundary.load(shallowHandle);
    return boundary;
  }

  /**
   * Creates a shallow boundary from OID array.
   */
  static fromOids(oids: string[]): ShallowBoundary {
    const boundary = new ShallowBoundary();
    boundary.setOids(oids);
    return boundary;
  }

  /**
   * Loads shallow OIDs from file.
   */
  async load(shallowHandle: FileSystemFileHandle): Promise<void> {
    try {
      const file = await shallowHandle.getFile();
      const text = await file.text();
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      this.setOids(lines);
      this.enabled = true;
    } catch {
      // File doesn't exist or can't be read - not a shallow repo
      this.enabled = false;
    }
  }

  /**
   * Sets shallow OIDs.
   */
  setOids(oids: string[]): void {
    this.shallowOids.clear();
    for (const oid of oids) {
      // Normalize OID (lowercase, remove whitespace)
      const normalized = oid.trim().toLowerCase();
      if (normalized.length === 40) {
        // SHA-1
        this.shallowOids.add(normalized);
      } else if (normalized.length === 64) {
        // SHA-256
        this.shallowOids.add(normalized);
      }
    }
    this.enabled = this.shallowOids.size > 0;
  }

  /**
   * Checks if a commit OID is a shallow boundary.
   * If true, this commit has no parents (virtually).
   */
  isBoundary(oid: string): boolean {
    if (!this.enabled) {
      return false;
    }
    return this.shallowOids.has(oid.toLowerCase());
  }

  /**
   * Gets all shallow boundary OIDs.
   */
  getBoundaries(): readonly string[] {
    return Array.from(this.shallowOids);
  }

  /**
   * Checks if shallow mode is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Adds a shallow boundary OID.
   */
  addBoundary(oid: string): void {
    const normalized = oid.trim().toLowerCase();
    if (normalized.length === 40 || normalized.length === 64) {
      this.shallowOids.add(normalized);
      this.enabled = true;
    }
  }

  /**
   * Removes a shallow boundary OID.
   */
  removeBoundary(oid: string): void {
    this.shallowOids.delete(oid.toLowerCase());
    this.enabled = this.shallowOids.size > 0;
  }

  /**
   * Clears all shallow boundaries (makes repo non-shallow).
   */
  clear(): void {
    this.shallowOids.clear();
    this.enabled = false;
  }

  /**
   * Filters parent OIDs, removing any that are shallow boundaries.
   * Used during ancestry traversal to stop at shallow boundaries.
   */
  filterParents(parents: string[]): string[] {
    if (!this.enabled) {
      return parents;
    }
    return parents.filter((parent) => !this.isBoundary(parent));
  }
}
