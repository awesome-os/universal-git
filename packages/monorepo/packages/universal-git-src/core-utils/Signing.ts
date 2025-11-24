import { normalizeNewlines } from "../utils/normalizeNewlines.ts"
import { indent } from "../utils/indent.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

// ============================================================================
// SIGNING TYPES
// ============================================================================

/**
 * Signing parameters
 */
export type SignParams = {
  payload: string // Plaintext message
  secretKey: string // ASCII armor encoded PGP key (can contain multiple keys)
}

/**
 * Signing callback
 */
export type SignCallback = (args: SignParams) => { signature: string } | Promise<{ signature: string }>

type VerifyCallback = (params: { payload: string; signature: string }) => Promise<{ valid: boolean; signer?: string; error?: string }>

type VerificationResult = {
  valid: boolean
  signer?: string
  error?: string
}

/**
 * Signs a commit or tag object
 */
export const sign = async ({
  content,
  signer,
  secretKey,
}: {
  content: UniversalBuffer | string
  signer: SignCallback
  secretKey?: string
}): Promise<UniversalBuffer> => {
  const payload = typeof content === 'string' ? content : content.toString('utf8')

  let { signature } = await signer({ payload, secretKey: secretKey ?? '' })
  signature = normalizeNewlines(signature)

  return UniversalBuffer.from(signature, 'utf8')
}

/**
 * Signs a commit object with GPG signature
 */
export const signCommit = async ({
  headers,
  message,
  signer,
  secretKey,
}: {
  headers: string
  message: string
  signer: SignCallback
  secretKey?: string
}): Promise<string> => {
  const payload = headers + '\n' + message
  const { signature } = await signer({ payload, secretKey: secretKey ?? '' })
  const normalizedSignature = normalizeNewlines(signature)
  const signedCommit = headers + '\n' + 'gpgsig' + indent(normalizedSignature) + '\n' + message
  return signedCommit
}

/**
 * Signs a tag object with GPG signature
 */
export const signTag = async ({
  payload,
  signer,
  secretKey,
}: {
  payload: string
  signer: SignCallback
  secretKey?: string
}): Promise<string> => {
  const { signature } = await signer({ payload, secretKey: secretKey ?? '' })
  const normalizedSignature = normalizeNewlines(signature)
  // payload already ends with '\n' (from payload() function), so just append signature
  // This matches GitAnnotatedTag.sign() which does payload + signature
  const signedTag = payload + normalizedSignature
  return signedTag
}

/**
 * Extracts the GPG signature from a commit or tag object
 */
export const extractSignature = (content: string): string | undefined => {
  const beginMarker = '-----BEGIN PGP SIGNATURE-----'
  const endMarker = '-----END PGP SIGNATURE-----'

  const beginIndex = content.indexOf(beginMarker)
  if (beginIndex === -1) return undefined

  const endIndex = content.indexOf(endMarker)
  if (endIndex === -1) return undefined

  return content.slice(beginIndex, endIndex + endMarker.length)
}

/**
 * Removes the GPG signature from a commit or tag object
 */
export const removeSignature = (content: string): string => {
  const normalized = normalizeNewlines(content)
  const gpgsigMarker = '\ngpgsig'
  const beginMarker = '-----BEGIN PGP SIGNATURE-----'

  // For commits, look for gpgsig header
  if (normalized.indexOf(gpgsigMarker) !== -1) {
    const headers = normalized.slice(0, normalized.indexOf(gpgsigMarker))
    const afterSignature = normalized.slice(
      normalized.indexOf('-----END PGP SIGNATURE-----\n') +
        '-----END PGP SIGNATURE-----\n'.length
    )
    return normalizeNewlines(headers + '\n' + afterSignature)
  }

  // For tags, look for PGP signature directly
  if (normalized.indexOf(beginMarker) !== -1) {
    return normalized.slice(0, normalized.lastIndexOf('\n' + beginMarker))
  }

  return normalized
}

/**
 * Verifies a signed object
 */
export const verify = async ({
  objectContent,
  verifier,
}: {
  objectContent: UniversalBuffer | string
  verifier: VerifyCallback
}): Promise<VerificationResult> => {
  const content = typeof objectContent === 'string' ? objectContent : objectContent.toString('utf8')

  const signature = extractSignature(content)
  if (!signature) {
    return {
      valid: false,
      error: 'No signature found',
    }
  }

  const payload = removeSignature(content)

  try {
    const result = await verifier({ payload, signature })
    return {
      valid: result.valid || false,
      signer: result.signer,
      error: result.error,
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

