import { RefManager } from "../core-utils/refs/RefManager.ts"
import { readObject } from "../git/objects/readObject.ts"
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { parse as parseTree } from "../core-utils/parsers/Tree.ts"
import { parse as parseTag } from "../core-utils/parsers/Tag.ts"
import { parse as parseBlob } from "../core-utils/parsers/Blob.ts"
import { resolveFilepath } from "../utils/resolveFilepath.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { Repository } from "../core-utils/Repository.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithRefOptions } from "../types/commandOptions.ts"

// ============================================================================
// SHOW TYPES
// ============================================================================

/**
 * Show operation result
 */
export type ShowResult = {
  oid: string
  type: 'commit' | 'tree' | 'blob' | 'tag'
  object: unknown
  filepath?: string
}

/**
 * Show various types of objects (commits, trees, blobs, tags)
 * Similar to `git show`, displays the object in a human-readable format
 */
export type ShowOptions = CommandWithRefOptions & {
  filepath?: string
}

export async function show({
  fs: _fs,
  dir,
  gitdir: _gitdir,
  ref = 'HEAD',
  filepath,
  cache: _cache,
  repo: _repo,
}: ShowOptions): Promise<ShowResult> {
  try {
    const { repo, fs, gitdir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir: _gitdir,
      cache: _cache,
      ref,
      filepath,
    })

    assertParameter('ref', ref)

    // Resolve ref to OID
    let oid: string
    try {
      oid = await RefManager.resolve({ fs, gitdir, ref })
    } catch (err) {
      // If ref resolution fails, try treating it as an OID directly
      if (ref.length === 40 && /^[0-9a-f]{40}$/i.test(ref)) {
        oid = ref
      } else {
        throw err
      }
    }

    // If filepath is provided, resolve it to a blob
    if (filepath !== undefined) {
      const blobOid = await resolveFilepath({ fs, cache: effectiveCache, gitdir, oid, filepath })
      const blobResult = await readObject({ fs, cache: effectiveCache, gitdir, oid: blobOid, format: 'content' })
      const blob = parseBlob(blobResult.object)
      
      return {
        oid: blobOid,
        type: 'blob',
        object: blob,
        filepath,
      }
    }

    // Read the object
    const result = await readObject({ fs, cache: effectiveCache, gitdir, oid, format: 'content' })

    // Parse based on type
    switch (result.type) {
      case 'commit': {
        const commit = parseCommit(result.object)
        return {
          oid: result.oid || oid,
          type: 'commit',
          object: commit,
        }
      }
      case 'tree': {
        const tree = parseTree(result.object)
        return {
          oid: result.oid || oid,
          type: 'tree',
          object: tree,
        }
      }
      case 'blob': {
        const blob = parseBlob(result.object)
        return {
          oid: result.oid || oid,
          type: 'blob',
          object: blob,
        }
      }
      case 'tag': {
        const tag = parseTag(result.object)
        return {
          oid: result.oid || oid,
          type: 'tag',
          object: tag,
        }
      }
      default:
        throw new Error(`Unknown object type: ${result.type}`)
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.show'
    throw err
  }
}

