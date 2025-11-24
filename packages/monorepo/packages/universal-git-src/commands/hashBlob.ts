import { hashObject } from "../git/objects/hashObject.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import type { ObjectFormat } from "../core-utils/ShaHasher.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

/**
 * The object returned has the following schema:
 */
export type HashBlobResult = {
  /** The SHA-1 or SHA-256 object id */
  oid: string
  /** The type of the object */
  type: 'blob'
  /** The wrapped git object (the thing that is hashed) */
  object: Uint8Array
  /** The format of the object */
  format: 'wrapped'
}

/**
 * Compute what the SHA-1 or SHA-256 object id of a file would be
 *
 * @param {object} args
 * @param {Uint8Array|string} args.object - The object to write. If `object` is a String then it will be converted to a Uint8Array using UTF-8 encoding.
 * @param {'sha1'|'sha256'} [args.objectFormat='sha1'] - Object format to use for hashing
 *
 * @returns {Promise<HashBlobResult>} Resolves successfully with the object id and the wrapped object Uint8Array.
 * @see HashBlobResult
 *
 * @example
 * let { oid, type, object, format } = await git.hashBlob({
 *   object: 'Hello world!',
 * })
 *
 * console.log('oid', oid)
 * console.log('type', type)
 * console.log('object', object)
 * console.log('format', format)
 *
 */
export async function hashBlob({
  object,
  objectFormat = 'sha1',
}: {
  object: Uint8Array | string
  objectFormat?: ObjectFormat
}): Promise<HashBlobResult> {
  try {
    assertParameter('object', object)

    // Convert object to buffer
    let processedObject: Uint8Array
    if (typeof object === 'string') {
      processedObject = UniversalBuffer.from(object, 'utf8')
    } else if (!(object instanceof Uint8Array)) {
      processedObject = new Uint8Array(object)
    } else {
      processedObject = object
    }

    const type = 'blob'
    const { oid, object: _object } = await hashObject({
      type,
      format: 'content',
      object: processedObject,
      objectFormat,
    })

    return { oid: oid || '', type, object: _object, format: 'wrapped' }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.hashBlob'
    throw err
  }
}

