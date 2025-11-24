import type { Stat } from '../models/FileSystem.ts'

/**
 * Extended Stat type with computed properties
 * Uses interface to allow proper type inference
 */
export interface ExtendedStat extends Stat {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
  isBlockDevice(): boolean
  isCharacterDevice(): boolean
  isFIFO(): boolean
  isSocket(): boolean
}

/**
 * Type guard to check if Stat has extended methods
 * Optimizes type inference
 */
export function isExtendedStat(stat: Stat): stat is ExtendedStat {
  return typeof (stat as ExtendedStat).isDirectory === 'function'
}

/**
 * Helper to create ExtendedStat from Stat with optimal type inference
 * Uses Object.defineProperty for better performance and type safety
 */
export function extendStat(stat: Stat): ExtendedStat {
  if (isExtendedStat(stat)) {
    return stat
  }

  const extended = { ...stat } as ExtendedStat
  
  // Use Object.defineProperty for computed properties (better for type inference)
  Object.defineProperty(extended, 'isDirectory', {
    value: function() { return (stat.mode & 0o170000) === 0o040000 },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isFile', {
    value: function() { return (stat.mode & 0o170000) === 0o100000 },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isSymbolicLink', {
    value: function() { return (stat.mode & 0o170000) === 0o120000 },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isBlockDevice', {
    value: function() { return (stat.mode & 0o170000) === 0o060000 },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isCharacterDevice', {
    value: function() { return (stat.mode & 0o170000) === 0o020000 },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isFIFO', {
    value: function() { return (stat.mode & 0o170000) === 0o010000 },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(extended, 'isSocket', {
    value: function() { return (stat.mode & 0o170000) === 0o140000 },
    enumerable: false,
    configurable: true
  })
  
  return extended
}

/**
 * Type-safe helper to check if stat is directory
 * Optimizes type inference by narrowing the type
 */
export function statIsDirectory(stat: Stat | ExtendedStat): boolean {
  if (isExtendedStat(stat)) {
    return stat.isDirectory()
  }
  return (stat.mode & 0o170000) === 0o040000
}

/**
 * Type-safe helper to check if stat is file
 * Optimizes type inference by narrowing the type
 */
export function statIsFile(stat: Stat | ExtendedStat): boolean {
  if (isExtendedStat(stat)) {
    return stat.isFile()
  }
  return (stat.mode & 0o170000) === 0o100000
}

/**
 * Type-safe helper to check if stat is symbolic link
 * Optimizes type inference by narrowing the type
 */
export function statIsSymbolicLink(stat: Stat | ExtendedStat): boolean {
  if (isExtendedStat(stat)) {
    return stat.isSymbolicLink()
  }
  return (stat.mode & 0o170000) === 0o120000
}

