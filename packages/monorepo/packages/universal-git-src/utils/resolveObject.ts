import { ObjectTypeError } from '../errors/ObjectTypeError.ts'
import { NotFoundError } from '../errors/NotFoundError.ts'
import { readObject } from "../git/objects/readObject.ts"
import { parse as parseTag } from "../core-utils/parsers/Tag.ts"
import { parse as parseCommit } from "../core-utils/parsers/Commit.ts"
import { parse as parseTree } from "../core-utils/parsers/Tree.ts"
import { parse as parseBlob } from "../core-utils/parsers/Blob.ts"
import { GitTree } from "../models/GitTree.ts"
import { UniversalBuffer } from './UniversalBuffer.ts'
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { TagObject } from "../models/GitAnnotatedTag.ts"
import type { CommitObject } from "../models/GitCommit.ts"

import type { GitBackend } from '../backends/GitBackend.ts'

/**
 * Generic object resolver that handles tag peeling and type checking
 * Reduces redundancy across resolveBlob, resolveCommit, resolveTree
 */
export async function resolveObject<T>(
  {
    fs,
    cache,
    gitdir,
    gitBackend,
    oid,
    expectedType,
    parser,
    emptyTreeOid,
    objectFormat,
  }: {
    fs?: FileSystemProvider
    cache: Record<string, unknown>
    gitdir?: string
    gitBackend?: GitBackend
    oid: string
    expectedType: 'blob' | 'commit' | 'tree'
    parser: (object: UniversalBuffer) => T
    emptyTreeOid?: string
    objectFormat?: 'sha1' | 'sha256'
  }
): Promise<{ oid: string; object: T }> {
  // Handle empty tree special case
  if (expectedType === 'tree' && oid === (emptyTreeOid || '4b825dc642cb6eb9a060e54bf8d69288fbee4904')) {
    // Empty tree is represented as an empty array
    const emptyTreeBuffer = UniversalBuffer.from('tree 0\x00')
    return { oid, object: parser(emptyTreeBuffer) }
  }

  // Detect object format for reading if not provided
  let formatToUse = objectFormat
  if (!formatToUse) {
    if (gitBackend) {
      formatToUse = await gitBackend.getObjectFormat(cache)
    } else if (fs && gitdir) {
      const { detectObjectFormat } = await import('./detectObjectFormat.ts')
      formatToUse = await detectObjectFormat(fs, gitdir)
    } else {
      formatToUse = 'sha1'
    }
  }
  
  let result: any
  try {
    if (gitBackend) {
      result = await gitBackend.readObject(oid, 'content', cache)
    } else if (fs && gitdir) {
      result = await readObject({ fs, cache, gitdir, oid, format: 'content', objectFormat: formatToUse })
    } else {
      throw new Error('Either gitBackend or fs+gitdir must be provided')
    }
  } catch (error) {
    // If we're looking for a tree and it doesn't exist, fall back to empty tree
    // This handles cases where tree objects are missing from the repository
    // BUT: Only do this for the known empty tree OID, not for arbitrary missing trees
    // Arbitrary missing trees indicate a repository integrity issue and should throw
    if (expectedType === 'tree' && error instanceof NotFoundError) {
      // Only fall back to empty tree if the requested OID is the empty tree OID
      // Otherwise, this is a real error - the tree should exist
      if (oid === (emptyTreeOid || '4b825dc642cb6eb9a060e54bf8d69288fbee4904')) {
        const emptyTreeBuffer = UniversalBuffer.from('tree 0\x00')
        return { oid, object: parser(emptyTreeBuffer) }
      }
      // For any other missing tree, this is a real error - don't silently fall back
      throw error
    }
    throw error
  }

  // Handle tag peeling
  if (result.type === 'tag') {
    const tag = parseTag(result.object) as TagObject
      return resolveObject({
        fs,
        cache,
        gitdir,
        gitBackend,
        oid: tag.object,
        expectedType,
        parser,
        emptyTreeOid,
        objectFormat: formatToUse,
      })
  }

  // Handle commit -> tree resolution
  if (expectedType === 'tree' && result.type === 'commit') {
    const commit = parseCommit(result.object) as CommitObject
    const treeOid = commit.tree || '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
    try {
      return await resolveObject({
        fs,
        cache,
        gitdir,
        gitBackend,
        oid: treeOid,
        expectedType,
        parser,
        emptyTreeOid,
        objectFormat: formatToUse,
      })
    } catch (error) {
      // If the commit's tree doesn't exist, fall back to empty tree
      // This can happen in repositories where objects weren't fully written
      if (error instanceof NotFoundError && treeOid !== (emptyTreeOid || '4b825dc642cb6eb9a060e54bf8d69288fbee4904')) {
        const emptyTreeBuffer = UniversalBuffer.from('tree 0\x00')
        return { oid: emptyTreeOid || '4b825dc642cb6eb9a060e54bf8d69288fbee4904', object: parser(emptyTreeBuffer) }
      }
      throw error
    }
  }

  // Type check
  if (result.type !== expectedType) {
    throw new ObjectTypeError(oid, result.type, expectedType)
  }

  return { oid, object: parser(result.object) }
}

