/**
 * Reads the Git index directly from .git/index file
 * 
 * This is a stateless helper function that performs only I/O and parsing.
 * Caching is handled by the Repository class, which is the sole authority
 * for in-memory index state.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param objectFormat - Object format ('sha1' or 'sha256'), will detect if not provided
 * @returns The parsed GitIndex object
 */
import { GitIndex } from './GitIndex.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { join } from '../../core-utils/GitPath.ts'
import { detectObjectFormat, type ObjectFormat } from '../../utils/detectObjectFormat.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

export async function readIndex({
  fs,
  gitdir,
  objectFormat,
}: {
  fs: FileSystemProvider
  gitdir: string
  objectFormat?: ObjectFormat
}): Promise<GitIndex> {
  const normalizedFs = createFileSystem(fs)
  const indexPath = join(gitdir, 'index')
  
  try {
    // Try to read the file - this will throw ENOENT if it doesn't exist
    const data = await normalizedFs.read(indexPath)
    
    // If data is null/undefined, treat as missing file
    if (data === null || data === undefined) {
      return new GitIndex()
    }
    
    // Convert to Buffer if it's not already
    // Handle both Buffer, Uint8Array, and string types
    const buffer = UniversalBuffer.isBuffer(data) 
      ? data 
      : typeof data === 'string' 
        ? UniversalBuffer.from(data)  // Use default encoding (utf8)
        : UniversalBuffer.from(data as Uint8Array)
    
    // Detect object format if not provided
    const format = objectFormat || await detectObjectFormat(fs, gitdir)
    
    // If file exists but buffer is empty, this is corrupted
    // A valid index file should never be empty - it should either not exist or have content
    // Let GitIndex.from() throw the appropriate error for empty files
    if (buffer.length === 0) {
      // Empty buffer - let GitIndex.from() throw "Index file is empty (.git/index)"
      return await GitIndex.from(buffer, format)
    }
    
    // Check if magic bytes are invalid (corrupted/invalid index)
    // A valid index file must start with 'DIRC' magic bytes
    if (buffer.length >= 4) {
      const magic = buffer.toString('utf8', 0, 4)
      if (magic !== 'DIRC') {
        // Invalid magic bytes - check if first 4 bytes are zeros (common corruption pattern)
        const magicBytes = buffer.slice(0, 4)
        const isMagicZeros = magicBytes.every(byte => byte === 0)
        if (isMagicZeros) {
          // Magic bytes are zeros - file is corrupted/empty, return empty index
          // This handles the case where the file was written as all zeros or truncated
          // but has some content (not completely empty)
          return new GitIndex()
        }
        // Otherwise, let GitIndex.from() throw the appropriate error with the actual magic bytes
      }
    }
    
    // Parse the index file
    return await GitIndex.from(buffer, format)
  } catch (err) {
    // Check if the error is about file not existing (ENOENT)
    // In that case, return empty index (file doesn't exist = no index = empty index)
    if ((err as any).code === 'ENOENT' || (err as any).errno === -2) {
      // Index doesn't exist - return empty index (valid state)
      return new GitIndex()
    }
    // All other errors (empty file, wrong magic, wrong checksum) should be re-thrown
    // These indicate corrupted index files that should error
    throw err
  }
}

