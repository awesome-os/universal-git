/**
 * @deprecated RefManager is deprecated. Use functions from git/refs/ instead.
 * 
 * This file maintains backward compatibility by re-exporting from git/refs/.
 * All functionality has been moved to git/refs/ as standalone functions.
 * 
 * Migration guide:
 * - RefManager.resolve() -> resolveRef() from git/refs/readRef.ts
 * - RefManager.listRefs() -> listRefs() from git/refs/listRefs.ts
 * - RefManager.writeRef() -> writeRef() from git/refs/writeRef.ts
 * - RefManager.writeSymbolicRef() -> writeSymbolicRef() from git/refs/writeRef.ts
 * - RefManager.deleteRef() -> deleteRef() from git/refs/deleteRef.ts
 * - RefManager.deleteRefs() -> deleteRefs() from git/refs/deleteRef.ts
 * - RefManager.packedRefs() -> readPackedRefs() from git/refs/packedRefs.ts
 * - RefManager.exists() -> existsRef() from git/refs/expandRef.ts
 * - RefManager.expand() -> expandRef() from git/refs/expandRef.ts
 * - RefManager.expandAgainstMap() -> expandRefAgainstMap() from git/refs/expandRef.ts
 * - RefManager.resolveAgainstMap() -> resolveRefAgainstMap() from git/refs/expandRef.ts
 * - RefManager.updateRemoteRefs() -> updateRemoteRefs() from git/refs/updateRemoteRefs.ts
 */

import { InvalidOidError } from "../../errors/InvalidOidError.ts"
import { resolveRef as resolveRefDirect } from '../../git/refs/readRef.ts'
import { writeRef as writeRefDirect } from '../../git/refs/writeRef.ts'
import { listRefs as listRefsDirect } from '../../git/refs/listRefs.ts'
import { deleteRef as deleteRefDirect, deleteRefs as deleteRefsDirect } from '../../git/refs/deleteRef.ts'
import { readPackedRefs } from '../../git/refs/packedRefs.ts'
import { expandRef, existsRef, expandRefAgainstMap, resolveRefAgainstMap } from '../../git/refs/expandRef.ts'
import { updateRemoteRefs } from '../../git/refs/updateRemoteRefs.ts'
import { writeSymbolicRef as writeSymbolicRefDirect } from '../../git/refs/writeRef.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * @deprecated Use resolveRef() from git/refs/readRef.ts instead
 * High-level facade for all reference operations
 */
export class RefManager {
  /**
   * @deprecated Use resolveRef() from git/refs/readRef.ts instead
   * Resolves a ref to its object ID
   */
  static async resolve({
    fs,
    gitdir,
    ref,
    depth = 5,
  }: {
    fs: FileSystemProvider
    gitdir: string
    ref: string
    depth?: number
  }): Promise<string> {
    return resolveRefDirect({ fs, gitdir, ref, depth })
  }

  /**
   * @deprecated Use listRefs() from git/refs/listRefs.ts instead
   * Lists all refs matching a given filepath prefix
   */
  static async listRefs({
    fs,
    gitdir,
    filepath,
  }: {
    fs: FileSystemProvider
    gitdir: string
    filepath: string
  }): Promise<string[]> {
    return listRefsDirect({ fs, gitdir, filepath })
  }

  /**
   * @deprecated Use writeRef() from git/refs/writeRef.ts instead
   * Writes a ref to the file system
   */
  static async writeRef({
    fs,
    gitdir,
    ref,
    value,
  }: {
    fs: FileSystemProvider
    gitdir: string
    ref: string
    value: string
  }): Promise<void> {
    // Validate input
    if (!value.match(/[0-9a-f]{40}/)) {
      throw new InvalidOidError(value)
    }
    return writeRefDirect({ fs, gitdir, ref, value })
  }

  /**
   * @deprecated Use writeSymbolicRef() from git/refs/writeRef.ts instead
   * Writes a symbolic ref to the file system
   */
  static async writeSymbolicRef({
    fs,
    gitdir,
    ref,
    value,
  }: {
    fs: FileSystemProvider
    gitdir: string
    ref: string
    value: string
  }): Promise<void> {
    return writeSymbolicRefDirect({ fs, gitdir, ref, value })
  }

  /**
   * @deprecated Use deleteRef() from git/refs/deleteRef.ts instead
   * Deletes a single ref
   */
  static async deleteRef({
    fs,
    gitdir,
    ref,
  }: {
    fs: FileSystemProvider
    gitdir: string
    ref: string
  }): Promise<void> {
    return deleteRefDirect({ fs, gitdir, ref })
  }

  /**
   * @deprecated Use deleteRefs() from git/refs/deleteRef.ts instead
   * Deletes multiple refs
   */
  static async deleteRefs({
    fs,
    gitdir,
    refs,
  }: {
    fs: FileSystemProvider
    gitdir: string
    refs: string[]
  }): Promise<void> {
    return deleteRefsDirect({ fs, gitdir, refs })
  }

  /**
   * @deprecated Use readPackedRefs() from git/refs/packedRefs.ts instead
   * Reads the packed refs file and returns a map of refs
   */
  static async packedRefs({
    fs,
    gitdir,
  }: {
    fs: FileSystemProvider
    gitdir: string
  }): Promise<Map<string, string>> {
    return readPackedRefs({ fs, gitdir })
  }

  /**
   * @deprecated Use existsRef() from git/refs/expandRef.ts instead
   * Checks if a ref exists
   */
  static async exists({
    fs,
    gitdir,
    ref,
  }: {
    fs: FileSystemProvider
    gitdir: string
    ref: string
  }): Promise<boolean> {
    return existsRef({ fs, gitdir, ref })
  }

  /**
   * @deprecated Use expandRef() from git/refs/expandRef.ts instead
   * Expands a ref to its full name
   */
  static async expand({
    fs,
    gitdir,
    ref,
  }: {
    fs: FileSystemProvider
    gitdir: string
    ref: string
  }): Promise<string> {
    return expandRef({ fs, gitdir, ref })
  }

  /**
   * @deprecated Use expandRefAgainstMap() from git/refs/expandRef.ts instead
   * Expands a ref against a provided map (for remote refs)
   */
  static expandAgainstMap({ ref, map }: { ref: string; map: Map<string, string> }): string {
    return expandRefAgainstMap({ ref, map })
  }

  /**
   * @deprecated Use resolveRefAgainstMap() from git/refs/expandRef.ts instead
   * Resolves a ref against a provided map (for remote refs)
   */
  static resolveAgainstMap({
    ref,
    fullref = ref,
    depth,
    map,
  }: {
    ref: string
    fullref?: string
    depth?: number
    map: Map<string, string>
  }): { fullref: string; oid: string } {
    return resolveRefAgainstMap({ ref, fullref, depth, map })
  }

  /**
   * @deprecated Use updateRemoteRefs() from git/refs/updateRemoteRefs.ts instead
   * Updates remote refs based on refspecs
   */
  static async updateRemoteRefs({
    fs,
    gitdir,
    remote,
    refs,
    symrefs,
    tags = false,
    refspecs,
    prune = false,
    pruneTags = false,
  }: {
    fs: FileSystemProvider
    gitdir: string
    remote: string
    refs: Map<string, string>
    symrefs: Map<string, string>
    tags?: boolean
    refspecs?: string[]
    prune?: boolean
    pruneTags?: boolean
  }): Promise<{ pruned: string[] }> {
    return updateRemoteRefs({
      fs,
      gitdir,
      remote,
      refs,
      symrefs,
      tags,
      refspecs,
      prune,
      pruneTags,
    })
  }
}
