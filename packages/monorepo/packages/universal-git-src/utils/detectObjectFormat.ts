import type { FileSystemProvider } from '../models/FileSystem.ts'
import { join } from './join.ts'
import { createFileSystem } from './createFileSystem.ts'

export type ObjectFormat = 'sha1' | 'sha256'

const ObjectFormatCache = Symbol('ObjectFormatCache')

/**
 * Detects the object format (SHA-1 or SHA-256) used by a Git repository
 * Caches the result per gitdir to avoid repeated file reads
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param cache - Optional cache object to store the result
 * @returns Promise resolving to 'sha1' or 'sha256'
 */
export async function detectObjectFormat(
  fs: FileSystemProvider,
  gitdir: string,
  cache?: Record<string | symbol, unknown>
): Promise<ObjectFormat> {
  // OPTIMIZATION: Cache object format per gitdir to avoid repeated file reads
  // This is called thousands of times during merge operations
  if (cache) {
    if (!cache[ObjectFormatCache]) {
      cache[ObjectFormatCache] = new Map<string, ObjectFormat>()
    }
    const formatCache = cache[ObjectFormatCache] as Map<string, ObjectFormat>
    const cached = formatCache.get(gitdir)
    if (cached) {
      return cached
    }
  }
  
  const normalizedFs = createFileSystem(fs)
  const configPath = join(gitdir, 'config')
  
  let format: ObjectFormat = 'sha1' // Default to SHA-1
  
  try {
    const configContent = await normalizedFs.read(configPath, 'utf8')
    if (typeof configContent === 'string') {
      // Check for objectformat = sha256 in [extensions] section
      const lines = configContent.split('\n')
      let inExtensions = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '[extensions]') {
          inExtensions = true
        } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          inExtensions = false
        } else if (inExtensions && trimmed.startsWith('objectformat')) {
          const match = trimmed.match(/objectformat\s*=\s*(\w+)/i)
          if (match && match[1].toLowerCase() === 'sha256') {
            format = 'sha256'
            break
          }
        }
      }
    }
  } catch {
    // Config file doesn't exist or can't be read, default to SHA-1
  }
  
  // Cache the result
  if (cache) {
    const formatCache = cache[ObjectFormatCache] as Map<string, ObjectFormat>
    formatCache.set(gitdir, format)
  }
  
  return format
}

/**
 * Gets the expected OID length for an object format
 * @param format - Object format ('sha1' or 'sha256')
 * @returns Expected OID length in characters
 */
export function getOidLength(format: ObjectFormat): number {
  return format === 'sha256' ? 64 : 40
}

/**
 * Validates if an OID matches the expected format
 * @param oid - Object ID to validate
 * @param format - Object format ('sha1' or 'sha256')
 * @returns true if OID matches format, false otherwise
 */
export function validateOid(oid: string, format: ObjectFormat): boolean {
  const expectedLength = getOidLength(format)
  if (oid.length !== expectedLength) {
    return false
  }
  // Check if it's a valid hex string
  return /^[0-9a-f]+$/i.test(oid)
}

