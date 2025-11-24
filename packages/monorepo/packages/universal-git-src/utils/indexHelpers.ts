import type { IndexEntry } from '../core-utils/index/Index.ts'
import type { ExtendedStat } from './statHelpers.ts'
import { statIsDirectory, statIsFile, statIsSymbolicLink } from './statHelpers.ts'

/**
 * Extended IndexEntry with additional computed properties
 * Optimizes type inference for common operations
 */
export interface ExtendedIndexEntry extends IndexEntry {
  /**
   * Computed stage property (derived from flags.stage for convenience)
   * This is a convenience property that accesses entry.flags.stage
   */
  stage: number
  /**
   * Optional stat property for file system metadata
   */
  stat?: ExtendedStat
  /**
   * Check if entry represents a directory
   */
  isDirectory(): boolean
  /**
   * Check if entry represents a file
   */
  isFile(): boolean
  /**
   * Check if entry represents a symbolic link
   */
  isSymbolicLink(): boolean
}

/**
 * Type guard to check if IndexEntry has extended properties
 * Optimizes type inference
 */
export function isExtendedIndexEntry(entry: IndexEntry): entry is ExtendedIndexEntry {
  return 'stage' in entry || 'stat' in entry || typeof (entry as ExtendedIndexEntry).isDirectory === 'function'
}

/**
 * Helper to extend IndexEntry with computed properties
 * Optimizes type inference by returning properly typed ExtendedIndexEntry
 */
export function extendIndexEntry(
  entry: IndexEntry,
  stat?: ExtendedStat
): ExtendedIndexEntry {
  const extended = { ...entry } as ExtendedIndexEntry
  
  // Add computed stage property (derived from flags.stage)
  Object.defineProperty(extended, 'stage', {
    get() {
      return this.flags.stage
    },
    enumerable: true,
    configurable: true
  })
  
  // Add stat if provided
  if (stat) {
    extended.stat = stat
  }
  
  // Add computed methods
  Object.defineProperty(extended, 'isDirectory', {
    value: function() {
      if (this.stat) {
        return statIsDirectory(this.stat)
      }
      return (this.mode & 0o170000) === 0o040000
    },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isFile', {
    value: function() {
      if (this.stat) {
        return statIsFile(this.stat)
      }
      return (this.mode & 0o170000) === 0o100000
    },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isSymbolicLink', {
    value: function() {
      if (this.stat) {
        return statIsSymbolicLink(this.stat)
      }
      return (this.mode & 0o170000) === 0o120000
    },
    enumerable: false,
    configurable: true
  })
  
  return extended
}

/**
 * Type-safe helper to get stage from IndexEntry
 * Optimizes type inference with proper null handling
 */
export function getIndexEntryStage(entry: IndexEntry | ExtendedIndexEntry): number {
  if (isExtendedIndexEntry(entry)) {
    return entry.stage
  }
  // Access flags.stage for base IndexEntry
  return entry.flags.stage
}
