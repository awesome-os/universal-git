/**
 * Type wrapper for better-sqlite3
 * Provides type definitions when the package is not installed or types are incompatible
 */

export type BetterSqlite3Database = {
  exec(sql: string): void
  pragma(sql: string, options?: unknown): unknown
  prepare(sql: string): BetterSqlite3Statement
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
  close(): void
  [key: string]: unknown
}

export type BetterSqlite3Statement = {
  run(...params: unknown[]): BetterSqlite3RunResult
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  iterate(...params: unknown[]): IterableIterator<unknown>
  bind(...params: unknown[]): BetterSqlite3Statement
  [key: string]: unknown
}

export type BetterSqlite3RunResult = {
  changes: number
  lastInsertRowid: number | bigint
  [key: string]: unknown
}

export type BetterSqlite3Module = {
  default: new (path: string, options?: unknown) => BetterSqlite3Database
  Database: new (path: string, options?: unknown) => BetterSqlite3Database
}

/**
 * Type-safe import wrapper for better-sqlite3
 */
export async function importBetterSqlite3(): Promise<BetterSqlite3Module> {
  try {
    // Use dynamic import with type assertion
    return await import('better-sqlite3') as unknown as BetterSqlite3Module
  } catch {
    // Return a stub type that will cause runtime errors if used
    throw new Error('better-sqlite3 module not available')
  }
}

