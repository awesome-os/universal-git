/**
 * Object Format Detection
 * Detects whether a Git repository uses SHA-1 or SHA-256 object IDs
 */
import type { FileSystemFileHandle } from '@awesome-os/native-file-system-adapter-src';

export type ObjectFormat = 'sha1' | 'sha256';

/**
 * Detects the object format (SHA-1 or SHA-256) used by a Git repository
 * by reading the config file and checking for objectformat in [extensions] section
 * 
 * @param configHandle - File handle to the Git config file
 * @returns Promise resolving to 'sha1' or 'sha256'
 */
export async function detectObjectFormat(
  configHandle: FileSystemFileHandle
): Promise<ObjectFormat> {
  try {
    const file = await configHandle.getFile();
    const configContent = await file.text();
    
    // Check for objectformat = sha256 in [extensions] section
    const lines = configContent.split('\n');
    let inExtensions = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[extensions]') {
        inExtensions = true;
      } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inExtensions = false;
      } else if (inExtensions && trimmed.startsWith('objectformat')) {
        const match = trimmed.match(/objectformat\s*=\s*(\w+)/i);
        if (match && match[1].toLowerCase() === 'sha256') {
          return 'sha256';
        }
      }
    }
  } catch {
    // If we can't read config, default to SHA-1
  }
  
  return 'sha1'; // Default to SHA-1
}

/**
 * Gets the expected OID length for an object format
 * @param format - Object format ('sha1' or 'sha256')
 * @returns Expected OID length in characters
 */
export function getOidLength(format: ObjectFormat): number {
  return format === 'sha256' ? 64 : 40;
}

/**
 * Validates if an OID matches the expected format
 * @param oid - Object ID to validate
 * @param format - Object format ('sha1' or 'sha256')
 * @returns true if OID matches format, false otherwise
 */
export function validateOid(oid: string, format: ObjectFormat): boolean {
  const expectedLength = getOidLength(format);
  if (oid.length !== expectedLength) {
    return false;
  }
  // Check if it's a valid hex string
  return /^[0-9a-f]+$/i.test(oid);
}
