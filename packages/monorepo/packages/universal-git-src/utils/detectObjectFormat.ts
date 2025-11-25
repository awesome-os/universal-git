import type { FileSystemProvider } from '../models/FileSystem.ts'
import type { GitBackend } from '../backends/GitBackend.ts'
import { join } from './join.ts'
import { createFileSystem } from './createFileSystem.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'

export type ObjectFormat = 'sha1' | 'sha256'

const ObjectFormatCache = Symbol('ObjectFormatCache')

/**
 * Detects the object format (SHA-1 or SHA-256) used by a Git repository
 * Caches the result per gitdir to avoid repeated file reads
 * 
 * @overload
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param cache - Optional cache object to store the result
 * @returns Promise resolving to 'sha1' or 'sha256'
 * 
 * @overload
 * @param fs - File system client (optional if gitBackend is provided)
 * @param gitdir - Path to .git directory (optional if gitBackend is provided)
 * @param cache - Optional cache object to store the result
 * @param gitBackend - Optional Git backend (preferred over fs/gitdir)
 * @returns Promise resolving to 'sha1' or 'sha256'
 */
export async function detectObjectFormat(
  fs: FileSystemProvider,
  gitdir: string,
  cache?: Record<string | symbol, unknown>,
  gitBackend?: GitBackend
): Promise<ObjectFormat>
export async function detectObjectFormat(
  fs: FileSystemProvider | undefined,
  gitdir: string | undefined,
  cache?: Record<string | symbol, unknown>,
  gitBackend?: GitBackend
): Promise<ObjectFormat> {
  // OPTIMIZATION: Cache object format per gitdir to avoid repeated file reads
  // This is called thousands of times during merge operations
  const cacheKey = gitdir || (gitBackend ? 'backend' : 'unknown')
  if (cache) {
    if (!cache[ObjectFormatCache]) {
      cache[ObjectFormatCache] = new Map<string, ObjectFormat>()
    }
    const formatCache = cache[ObjectFormatCache] as Map<string, ObjectFormat>
    const cached = formatCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }
  
  let format: ObjectFormat = 'sha1' // Default to SHA-1
  
  try {
    let configContent: string | null = null
    
    if (gitBackend) {
      // Use backend to read config
      const configBuffer = await gitBackend.readConfig()
      if (configBuffer.length > 0) {
        configContent = configBuffer.toString('utf8')
      }
    } else if (fs && gitdir) {
      // Fallback to fs-based read
      const normalizedFs = createFileSystem(fs)
      const configPath = join(gitdir, 'config')
      const content = await normalizedFs.read(configPath, 'utf8')
      configContent = typeof content === 'string' ? content : null
    } else {
      // No way to read config, default to SHA-1
      return 'sha1'
    }
    
    if (configContent) {
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
    formatCache.set(cacheKey, format)
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

