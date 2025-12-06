import type { GitBackend } from '../git/backends/GitBackend.ts'

export type ObjectFormat = 'sha1' | 'sha256'

/**
 * Detects the object format (SHA-1 or SHA-256) used by a Git repository
 * Caches the result per gitdir to avoid repeated file reads
 * 
 * @param gitBackend - Optional Git backend (preferred over fs/gitdir)
 * @returns Promise resolving to 'sha1' or 'sha256'
 */
export async function detectObjectFormat(
  gitBackend?: GitBackend
): Promise<ObjectFormat>
{
  
  let format: ObjectFormat = 'sha1' // Default to SHA-1
  
  
    let configContent: string | null = null
    
    if (gitBackend) {
      // Use backend to read config
      const configBuffer = await gitBackend.readConfig()
      if (configBuffer.length > 0) {
        configContent = typeof configBuffer === 'string' ? configBuffer : (configBuffer as any).toString('utf8') || String(configBuffer)
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

