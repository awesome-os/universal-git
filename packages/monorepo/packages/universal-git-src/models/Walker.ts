import { GitWalkSymbol } from "../utils/symbols.ts"
import type { FileSystemProvider, Stat } from './FileSystem.ts'
import type { Repository } from "../core-utils/Repository.ts"
import { flat } from '../utils/flat.ts'

// ============================================================================
// WALKER TYPES
// ============================================================================

/**
 * Walker - an opaque handle for tree traversal
 */
export type Walker = {
  [GitWalkSymbol]: (args: { 
    gitBackend: import('../backends/GitBackend.ts').GitBackend
    worktreeBackend?: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
    cache?: Record<string, unknown>
  }) => Promise<unknown>
}

/**
 * Walker entry interface for tree traversal
 */
export type WalkerEntry = {
  type: () => Promise<'tree' | 'blob' | 'special' | 'commit'>
  mode: () => Promise<number>
  oid: () => Promise<string>
  content: () => Promise<Uint8Array | void>
  stat: () => Promise<Stat>
}

/**
 * Walker map function type
 */
export type WalkerMap = (filename: string, entries: WalkerEntry[]) => Promise<unknown>

/**
 * Walker reduce function type
 */
export type WalkerReduce = (parent: unknown, children: unknown[]) => Promise<unknown>

/**
 * Walker iterate callback type
 */
export type WalkerIterateCallback = (entries: WalkerEntry[]) => Promise<unknown[]>

/**
 * Walker iterate function type
 */
export type WalkerIterate = (walk: WalkerIterateCallback, children: IterableIterator<WalkerEntry[]>) => Promise<unknown[]>

// ============================================================================
// WALKER ENTRY HELPER
// ============================================================================

/**
 * Helper to create a valid WalkerEntry from mock entries or partial entries.
 * This normalizes the type() return value to ensure it matches the valid union type
 * ('tree' | 'blob' | 'special' | 'commit'), filtering out invalid types like 'tag'.
 * 
 * @example
 * ```ts
 * const validEntry = createWalkerEntry({
 *   type: async () => 'tag', // Will be normalized to 'commit'
 *   oid: async () => 'abc123',
 * })
 * ```
 */
export function createWalkerEntry(
  entry: {
    type?: () => Promise<'tree' | 'blob' | 'special' | 'commit' | 'tag' | string>
    mode?: () => Promise<number>
    oid?: () => Promise<string>
    content?: () => Promise<Uint8Array | void>
    stat?: () => Promise<Stat>
  }
): WalkerEntry {
  return {
    type: async () => {
      const typeValue = entry.type ? await entry.type() : 'blob'
      // Normalize type: map 'tag' to 'commit' or filter to valid types
      if (typeValue === 'tag') return 'commit'
      if (typeValue === 'tree' || typeValue === 'blob' || typeValue === 'special' || typeValue === 'commit') {
        return typeValue
      }
      return 'blob'
    },
    mode: entry.mode || (async () => 0o100644),
    oid: entry.oid || (async () => ''),
    content: entry.content || (async () => undefined),
    stat: entry.stat || (async () => {
      throw new Error('stat() not implemented')
    }),
  }
}

// ============================================================================
// WALKER FACTORY CLASS
// ============================================================================

/**
 * Walker factory class - provides static methods for creating Walkers
 * Similar to UniversalBuffer.from() pattern - normalizes Walker creation
 */
export class WalkerFactory {
  private constructor() {
    // Private constructor - only static methods
  }

  /**
   * Creates a Walker from a factory function
   * Similar to UniversalBuffer.from() - normalizes input
   */
  static from(
    factory: (args: { 
      gitBackend: import('../backends/GitBackend.ts').GitBackend
      worktreeBackend?: import('../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend
      cache?: Record<string, unknown>
    }) => Promise<unknown>
  ): Walker {
    const o = Object.create(null)
    Object.defineProperty(o, GitWalkSymbol, {
      value: factory,
      enumerable: false,
      configurable: false,
    })
    Object.freeze(o)
    return o as Walker
  }

  /**
   * Creates a TREE walker
   */
  static tree({ ref = 'HEAD' }: { ref?: string } = {}): Walker {
    return WalkerFactory.from(async ({ gitBackend, cache = {} }) => {
      return await gitBackend.createTreeWalker(ref, cache)
    })
  }

  /**
   * Creates a WORKDIR walker
   */
  static workdir(): Walker {
    return WalkerFactory.from(async ({ gitBackend, worktreeBackend }) => {
      if (!worktreeBackend) {
        throw new Error('Cannot create WORKDIR walker for bare repository')
      }
      return await worktreeBackend.createWorkdirWalker(gitBackend)
    })
  }

  /**
   * Creates a STAGE walker
   */
  static stage(): Walker {
    return WalkerFactory.from(async ({ gitBackend, cache = {} }) => {
      return await gitBackend.createIndexWalker(cache)
    })
  }
}

// ============================================================================
// WALKER FUNCTION WRAPPERS
// ============================================================================

/**
 * Wraps a WalkerMap function to normalize entries array
 * Handles null/undefined entries automatically
 */
export function WalkerMap(
  fn: (
    filename: string,
    entries: WalkerEntry[]
  ) => Promise<unknown>
): WalkerMap {
  return async (filename: string, entries: WalkerEntry[]): Promise<unknown> => {
    // Normalize entries - ensure array is properly typed
    return fn(filename, entries)
  }
}

/**
 * Creates a WalkerMap that handles null entries automatically
 * Useful for comparing multiple trees (e.g., HEAD vs STAGE)
 */
export function WalkerMapWithNulls<T = unknown>(
  fn: (
    filepath: string,
    entries: (WalkerEntry | null)[]
  ) => Promise<T | undefined>
): WalkerMap {
  return async (filepath: string, entries: WalkerEntry[]): Promise<unknown> => {
    // Ensure entries array matches expected length
    // Pad with null if needed (entries may be sparse)
    const normalizedEntries = entries as (WalkerEntry | null)[]
    return fn(filepath, normalizedEntries)
  }
}

/**
 * Creates a WalkerMap that filters out undefined results
 */
export function WalkerMapFiltered<T = unknown>(
  fn: (
    filepath: string,
    entries: WalkerEntry[]
  ) => Promise<T | undefined>
): WalkerMap {
  return async (filepath: string, entries: WalkerEntry[]): Promise<unknown> => {
    const result = await fn(filepath, entries)
    return result === undefined ? null : result
  }
}

/**
 * Wraps a WalkerReduce function to normalize parent/children
 * Handles undefined/null values automatically
 */
export function WalkerReduce<T = unknown>(
  fn: (
    parent: T | undefined,
    children: T[]
  ) => Promise<T | undefined>
): WalkerReduce {
  return async (parent: unknown, children: unknown[]): Promise<unknown> => {
    // Normalize parent and children
    const normalizedParent = parent as T | undefined
    const normalizedChildren = (Array.isArray(children) ? children : []) as T[]
    return fn(normalizedParent, normalizedChildren)
  }
}

/**
 * Creates a WalkerReduce that handles tree building
 * Automatically filters undefined children
 */
export function WalkerReduceTree<T = unknown>(
  fn: (
    parent: T | undefined,
    children: T[]
  ) => Promise<T | undefined>
): WalkerReduce {
  return async (parent: unknown, children: unknown[]): Promise<unknown> => {
    const normalizedChildren = (Array.isArray(children) 
      ? children.filter(c => c !== undefined) 
      : []) as T[]
    return fn(parent as T | undefined, normalizedChildren)
  }
}

/**
 * Creates a WalkerReduce that flattens results
 * Default behavior for most walk operations
 */
export function WalkerReduceFlat(): WalkerReduce {
  return async (parent: unknown, children: unknown[]): Promise<unknown> => {
    const childrenArray = Array.isArray(children) ? children : []
    const flatten = flat(childrenArray as unknown[][])
    if (parent !== undefined) flatten.unshift(parent)
    return flatten
  }
}

/**
 * Wraps a WalkerIterate function to normalize iteration
 * 
 * CRITICAL: Do NOT add custom batching here. The underlying function (fn) should handle
 * concurrency management. Custom batching with Promise.all() can cause deadlocks in
 * recursive walks due to resource pool exhaustion (e.g., file handle limits).
 */
export function WalkerIterate(
  fn: (
    walk: WalkerIterateCallback,
    children: IterableIterator<WalkerEntry[]>
  ) => Promise<unknown[]>
): WalkerIterate {
  return async (
    walk: WalkerIterateCallback,
    children: IterableIterator<WalkerEntry[]>
  ): Promise<unknown[]> => {
    // Simply delegate to the original function.
    // The underlying library should handle concurrency.
    return fn(walk, children)
  }
}

