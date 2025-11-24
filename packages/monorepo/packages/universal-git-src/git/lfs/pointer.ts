import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Git LFS Pointer File Format
 * 
 * Git LFS stores large files outside the Git repository. Instead of storing
 * the actual file content in Git, it stores a "pointer file" that contains
 * metadata about the large file. The actual file content is stored in
 * `.git/lfs/objects/` and referenced by the pointer.
 * 
 * Pointer file format:
 * ```
 * version https://git-lfs.github.com/spec/v1
 * oid sha256:<hash>
 * size <size>
 * ```
 * 
 * The pointer file may also contain additional metadata (extensions) after
 * the required fields, separated by a blank line.
 */

export interface LFSPointer {
  /** LFS version (always "https://git-lfs.github.com/spec/v1") */
  version: string
  /** Object ID with hash algorithm (e.g., "sha256:abc123...") */
  oid: string
  /** File size in bytes */
  size: number
  /** Additional metadata (extensions) */
  extensions?: Record<string, string>
}

/**
 * Parses a Git LFS pointer file
 * 
 * @param content - The pointer file content (as string or Buffer)
 * @returns Parsed LFS pointer object
 * @throws Error if the pointer file is invalid
 */
export function parsePointer(content: string | UniversalBuffer): LFSPointer {
  const text = typeof content === 'string' ? content : content.toString('utf8')
  const lines = text.split('\n')
  
  const pointer: Partial<LFSPointer> = {}
  let inExtensions = false
  const extensions: Record<string, string> = {}
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Empty line marks the start of extensions (optional metadata)
    if (!line) {
      inExtensions = true
      continue
    }
    
    // Skip comments (lines starting with #)
    if (line.startsWith('#')) {
      continue
    }
    
    if (!inExtensions) {
      // Parse required fields
      if (line.startsWith('version ')) {
        pointer.version = line.substring(8).trim()
      } else if (line.startsWith('oid ')) {
        pointer.oid = line.substring(4).trim()
      } else if (line.startsWith('size ')) {
        const sizeStr = line.substring(5).trim()
        pointer.size = parseInt(sizeStr, 10)
        if (isNaN(pointer.size)) {
          throw new Error(`Invalid size in LFS pointer: ${sizeStr}`)
        }
      }
    } else {
      // Parse extensions (key: value format)
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim()
        const value = line.substring(colonIndex + 1).trim()
        extensions[key] = value
      }
    }
  }
  
  // Validate required fields
  if (!pointer.version) {
    throw new Error('Missing version in LFS pointer file')
  }
  if (!pointer.oid) {
    throw new Error('Missing oid in LFS pointer file')
  }
  if (pointer.size === undefined) {
    throw new Error('Missing size in LFS pointer file')
  }
  
  // Validate version
  if (pointer.version !== 'https://git-lfs.github.com/spec/v1') {
    throw new Error(`Unsupported LFS version: ${pointer.version}`)
  }
  
  // Validate oid format (should be "algorithm:hash")
  if (!pointer.oid.includes(':')) {
    throw new Error(`Invalid oid format: ${pointer.oid}`)
  }
  
  return {
    version: pointer.version,
    oid: pointer.oid,
    size: pointer.size,
    extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
  }
}

/**
 * Checks if a buffer contains a valid LFS pointer file
 * 
 * @param content - The content to check (as string or Buffer)
 * @returns true if the content is a valid LFS pointer file
 */
export function isPointer(content: string | UniversalBuffer): boolean {
  try {
    parsePointer(content)
    return true
  } catch {
    return false
  }
}

/**
 * Generates a Git LFS pointer file from file content
 * 
 * @param content - The file content (as Buffer)
 * @param hashAlgorithm - Hash algorithm to use (default: 'sha256')
 * @returns LFS pointer file content as string
 */
export async function generatePointer(
  content: UniversalBuffer,
  hashAlgorithm: 'sha256' | 'sha1' = 'sha256'
): Promise<string> {
  // Calculate hash
  let hash: string
  
  // Try Web Crypto API first (browser)
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    if (hashAlgorithm === 'sha256') {
      const hashBuffer = await crypto.subtle.digest('SHA-256', content)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      const hashBuffer = await crypto.subtle.digest('SHA-1', content)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
  } else {
    // Node.js crypto fallback
    try {
      const nodeCrypto = await import('node:crypto')
      if (hashAlgorithm === 'sha256') {
        hash = nodeCrypto.createHash('sha256').update(content).digest('hex')
      } else {
        hash = nodeCrypto.createHash('sha1').update(content).digest('hex')
      }
    } catch {
      // Fallback: use a simple hash (not cryptographically secure, but works)
      // This is a last resort for environments without crypto support
      throw new Error('Crypto API not available. Git LFS requires cryptographic hashing.')
    }
  }
  
  const size = content.length
  const oid = `${hashAlgorithm}:${hash}`
  
  return `version https://git-lfs.github.com/spec/v1
oid ${oid}
size ${size}
`
}

/**
 * Gets the LFS object path from an OID
 * 
 * LFS objects are stored in `.git/lfs/objects/` with a structure:
 * `objects/<first-two-chars>/<next-two-chars>/<rest-of-hash>`
 * 
 * @param oid - The object ID (e.g., "sha256:abc123...")
 * @returns The relative path within `.git/lfs/objects/`
 */
export function getLFSObjectPath(oid: string): string {
  // Extract hash from oid (format: "algorithm:hash")
  const hash = oid.includes(':') ? oid.split(':')[1] : oid
  
  if (hash.length < 4) {
    throw new Error(`Invalid OID hash length: ${oid}`)
  }
  
  // LFS stores objects as: objects/ab/cd/ef1234...
  const firstTwo = hash.substring(0, 2)
  const nextTwo = hash.substring(2, 4)
  const rest = hash.substring(4)
  
  return `${firstTwo}/${nextTwo}/${rest}`
}

/**
 * Extracts the hash from an OID
 * 
 * @param oid - The object ID (e.g., "sha256:abc123...")
 * @returns The hash part (e.g., "abc123...")
 */
export function extractHash(oid: string): string {
  return oid.includes(':') ? oid.split(':')[1] : oid
}

