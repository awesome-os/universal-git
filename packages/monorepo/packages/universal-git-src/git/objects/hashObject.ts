import { GitObject } from "../../models/GitObject.ts"
import { hashObject as hashObjectInternal, shasum, shasum256, type ObjectFormat } from "../../core-utils/ShaHasher.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

/**
 * Compute the SHA-1 or SHA-256 hash of a git object
 * 
 * @param type - Object type ('blob', 'tree', 'commit', 'tag')
 * @param object - Object content
 * @param format - Format of the input object ('content', 'wrapped', or 'deflated')
 * @param oid - Optional OID (required if format is 'deflated')
 * @param objectFormat - Object format ('sha1' or 'sha256'), defaults to 'sha1'
 * @returns Promise resolving to the OID and the wrapped object buffer
 */
export async function hashObject({
  type,
  object,
  format = 'content',
  oid = undefined,
  objectFormat = 'sha1',
}: {
  type: string
  object: UniversalBuffer | Uint8Array
  format?: 'content' | 'wrapped' | 'deflated'
  oid?: string
  objectFormat?: ObjectFormat
}): Promise<{ oid: string; object: UniversalBuffer }> {
  let resultObject: UniversalBuffer
  let resultOid: string | undefined = oid
  if (format !== 'deflated') {
    if (format !== 'wrapped') {
      const objectBuffer = UniversalBuffer.from(object)
      const wrapped = GitObject.wrap({ type, object: objectBuffer })
      resultObject = UniversalBuffer.from(wrapped)
      // resultObject is now wrapped, so hash it directly (don't wrap again)
      resultOid = objectFormat === 'sha256'
        ? await shasum256(resultObject)
        : await shasum(resultObject)
    } else {
      resultObject = UniversalBuffer.from(object)
      // resultObject is already wrapped, so hash it directly (don't wrap again)
      resultOid = objectFormat === 'sha256'
        ? await shasum256(resultObject)
        : await shasum(resultObject)
    }
  } else {
    resultObject = UniversalBuffer.from(object)
  }
  if (!resultOid) {
    throw new Error('oid is required when format is deflated')
  }
  return { oid: resultOid, object: resultObject }
}

