import type { FileSystemProvider } from '../../../../models/FileSystem.ts'
import type { GitBackend } from '../../GitBackend.ts'
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
 * @param gitBackend - Git backend (preferred)
 * @returns Promise resolving to 'sha1' or 'sha256'
 * 
 * @overload
 * @param fs - File system client (legacy)
 * @param gitdir - Path to .git directory (legacy)
 * @returns Promise resolving to 'sha1' or 'sha256'
 */
export async function detectObjectFormat(
  gitBackend: GitBackend
): Promise<ObjectFormat>
export async function detectObjectFormat(
  fs: FileSystemProvider,
  gitdir: string
): Promise<ObjectFormat>
export async function detectObjectFormat(
  gitBackendOrFs?: GitBackend | FileSystemProvider,
  gitdir?: string
): Promise<ObjectFormat> {
  let format: ObjectFormat = 'sha1' // Default to SHA-1
  let configContent: string | null = null
  
  // Check if first argument is a GitBackend
  if (gitBackendOrFs && typeof gitBackendOrFs === 'object' && 'readConfig' in gitBackendOrFs) {
    // New API: use gitBackend
    const gitBackend = gitBackendOrFs as GitBackend
    if (typeof gitBackend.readConfig === 'function') {
      try {
        const configResult = await gitBackend.readConfig()
        // Handle both string and UniversalBuffer return types
        if (typeof configResult === 'string') {
          configContent = configResult.length > 0 ? configResult : null
        } else if (configResult && typeof configResult === 'object' && 'length' in configResult) {
          // UniversalBuffer or similar buffer-like object
          const buffer = configResult as any
          if (buffer.length > 0) {
            if (typeof buffer.toString === 'function') {
              try {
                configContent = buffer.toString('utf8')
              } catch {
                configContent = String(buffer)
              }
            } else {
              configContent = String(buffer)
            }
          }
        }
      } catch {
        // Config doesn't exist or can't be read - use default format
        configContent = null
      }
    }
  } else if (gitBackendOrFs && gitdir) {
    // Legacy API: use fs/gitdir
    const fs = gitBackendOrFs as FileSystemProvider
    const normalizedFs = createFileSystem(fs)
    try {
      const configPath = join(gitdir, 'config')
      const configData = await normalizedFs.read(configPath, 'utf8')
      configContent = typeof configData === 'string' ? configData : null
    } catch {
      // Config doesn't exist or can't be read - use default format
      configContent = null
    }
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

