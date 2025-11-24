// FileSystemProvider is not exported as subpath, use relative path
import type { FileSystemProvider } from '@awesome-os/universal-git-src/models/FileSystem.ts'
// Import write functions from source (not exported as subpath)
import { writeBlob } from '@awesome-os/universal-git-src/commands/writeBlob.ts'
import { writeCommit } from '@awesome-os/universal-git-src/commands/writeCommit.ts'
import { writeTree } from '@awesome-os/universal-git-src/commands/writeTree.ts'
import { writeTag } from '@awesome-os/universal-git-src/commands/writeTag.ts'

/**
 * Helper functions for using dryRun in tests.
 * 
 * These helpers make it easier to compute OIDs without writing objects to disk,
 * which can significantly improve test performance, especially on slower filesystems.
 * 
 * Use these helpers when:
 * - Test only verifies OID computation
 * - Test only checks return value format (e.g., `typeof oid === 'string'`)
 * - Test verifies structure without reading back from disk
 * - Creating objects for setup that won't be read back
 * 
 * DON'T use these helpers when:
 * - Test reads objects back from disk (e.g., `readObject`, `readCommit`, `readBlob`)
 * - Test verifies reflog entries (requires real writes)
 * - Test checks branch/ref updates (requires real writes)
 * - Test verifies object existence
 * - Test needs objects for subsequent operations
 */

/**
 * Compute blob OID without writing to disk
 * 
 * @param fs - File system client
 * @param params - Parameters for writeBlob (blob is required, gitdir/dir optional)
 * @returns Promise resolving to the computed OID
 * 
 * @example
 * ```typescript
 * const oid = await computeBlobOid(fs, {
 *   gitdir,
 *   blob: new Uint8Array([1, 2, 3])
 * })
 * assert.strictEqual(typeof oid, 'string')
 * ```
 */
export async function computeBlobOid(
  fs: FileSystemProvider,
  params: {
    dir?: string
    gitdir?: string
    blob: Uint8Array
    objectFormat?: 'sha1' | 'sha256'
  }
): Promise<string> {
  return await writeBlob({
    fs,
    ...params,
    dryRun: true,
  })
}

/**
 * Compute commit OID without writing to disk
 * 
 * @param fs - File system client
 * @param params - Parameters for writeCommit (commit is required, gitdir/dir optional)
 * @returns Promise resolving to the computed OID
 * 
 * @example
 * ```typescript
 * const oid = await computeCommitOid(fs, {
 *   gitdir,
 *   commit: { message: 'Test', tree: 'abc123...', parent: [] }
 * })
 * assert.strictEqual(typeof oid, 'string')
 * ```
 */
export async function computeCommitOid(
  fs: FileSystemProvider,
  params: {
    dir?: string
    gitdir?: string
    commit: {
      message: string
      tree: string
      parent: string[]
      author: {
        name: string
        email: string
        timestamp: number
        timezoneOffset: number
      }
      committer: {
        name: string
        email: string
        timestamp: number
        timezoneOffset: number
      }
      gpgsig?: string
    }
    objectFormat?: 'sha1' | 'sha256'
  }
): Promise<string> {
  return await writeCommit({
    fs,
    ...params,
    dryRun: true,
  })
}

/**
 * Compute tree OID without writing to disk
 * 
 * @param fs - File system client
 * @param params - Parameters for writeTree (tree is required, gitdir/dir optional)
 * @returns Promise resolving to the computed OID
 * 
 * @example
 * ```typescript
 * const oid = await computeTreeOid(fs, {
 *   gitdir,
 *   tree: [{ path: 'file.txt', mode: '100644', oid: 'abc123...' }]
 * })
 * assert.strictEqual(typeof oid, 'string')
 * ```
 */
export async function computeTreeOid(
  fs: FileSystemProvider,
  params: {
    dir?: string
    gitdir?: string
    tree: Array<{
      path: string
      mode: string
      oid: string
      type: 'blob' | 'tree' | 'commit' | 'tag'
    }>
    objectFormat?: 'sha1' | 'sha256'
  }
): Promise<string> {
  return await writeTree({
    fs,
    ...params,
    dryRun: true,
  })
}

/**
 * Compute tag OID without writing to disk
 * 
 * @param fs - File system client
 * @param params - Parameters for writeTag (tag is required, gitdir/dir optional)
 * @returns Promise resolving to the computed OID
 * 
 * @example
 * ```typescript
 * const oid = await computeTagOid(fs, {
 *   gitdir,
 *   tag: {
 *     object: 'abc123...',
 *     type: 'commit',
 *     tag: 'v1.0.0',
 *     message: 'Release 1.0.0'
 *   }
 * })
 * assert.strictEqual(typeof oid, 'string')
 * ```
 */
export async function computeTagOid(
  fs: FileSystemProvider,
  params: {
    dir?: string
    gitdir?: string
    tag: {
      object: string
      type: 'blob' | 'tree' | 'commit' | 'tag'
      tag: string
      tagger: {
        name: string
        email: string
        timestamp: number
        timezoneOffset: number
      }
      message: string
      gpgsig?: string
    }
    objectFormat?: 'sha1' | 'sha256'
  }
): Promise<string> {
  return await writeTag({
    fs,
    ...params,
    dryRun: true,
  })
}

/**
 * Generic helper to compute OID for any write operation without writing to disk
 * 
 * This is a convenience wrapper that automatically adds `dryRun: true` to any
 * write operation. Use this when you need to compute an OID but don't need
 * the object persisted.
 * 
 * @param operation - The write operation function (writeBlob, writeCommit, etc.)
 * @param params - Parameters for the operation (dryRun will be added automatically)
 * @returns Promise resolving to the computed OID
 * 
 * @example
 * ```typescript
 * const oid = await computeOidOnly(writeBlob, {
 *   fs,
 *   gitdir,
 *   blob: new Uint8Array([1, 2, 3])
 * })
 * ```
 */
export async function computeOidOnly<T extends { dryRun?: boolean }>(
  operation: (params: T) => Promise<string>,
  params: Omit<T, 'dryRun'>
): Promise<string> {
  return await operation({
    ...params,
    dryRun: true,
  } as T)
}

