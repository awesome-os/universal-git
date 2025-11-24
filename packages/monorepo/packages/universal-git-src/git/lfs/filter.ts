/**
 * Git LFS Filter Implementation
 * 
 * Git LFS uses filters to automatically convert between pointer files
 * (stored in Git) and actual file content (stored in LFS).
 * 
 * - **Smudge filter**: Converts pointer files to actual file content when
 *   checking out files (pointer -> actual file)
 * - **Clean filter**: Converts actual file content to pointer files when
 *   staging files (actual file -> pointer)
 */

import { parsePointer, isPointer, generatePointer, getLFSObjectPath, extractHash } from './pointer.ts'
import { getAttributes } from '../../core-utils/filesystem/GitAttributesParser.ts'
import { join } from '../../utils/join.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import type { GitBackend } from '../../backends/GitBackend.ts'

/**
 * Checks if a file should be tracked by LFS based on gitattributes
 * 
 * @param fs - File system client
 * @param dir - Working directory
 * @param filepath - Path to the file (relative to dir)
 * @returns true if the file should be tracked by LFS
 */
export async function shouldTrackWithLFS({
  fs,
  dir,
  filepath,
}: {
  fs: FileSystemProvider
  dir: string
  filepath: string
}): Promise<boolean> {
  const attributes = await getAttributes({ fs, dir, filepath })
  
  // Check if file has filter=lfs attribute
  const filter = attributes.filter
  if (filter === 'lfs' || filter === true) {
    return true
  }
  
  // Check if file has diff=lfs attribute
  const diff = attributes.diff
  if (diff === 'lfs' || diff === true) {
    return true
  }
  
  // Check if file has merge=lfs attribute
  const merge = attributes.merge
  if (merge === 'lfs' || merge === true) {
    return true
  }
  
  return false
}

/**
 * LFS Smudge Filter
 * 
 * Converts an LFS pointer file (from Git) to actual file content (for working directory).
 * Downloads the actual file from LFS storage if needed.
 * 
 * @param pointerContent - The pointer file content (as Buffer)
 * @param backend - Git backend for accessing LFS storage
 * @returns The actual file content (as Buffer)
 */
export async function smudgeFilter(
  pointerContent: UniversalBuffer,
  backend: GitBackend
): Promise<UniversalBuffer> {
  // Parse the pointer file
  const pointer = parsePointer(pointerContent)
  
  // Get the LFS object path
  const objectPath = getLFSObjectPath(pointer.oid)
  
  // Read the actual file from LFS storage
  const actualContent = await backend.readLFSFile(objectPath)
  
  if (!actualContent) {
    throw new Error(`LFS object not found: ${pointer.oid} (path: ${objectPath})`)
  }
  
  // Verify the size matches
  if (actualContent.length !== pointer.size) {
    throw new Error(
      `LFS object size mismatch: expected ${pointer.size} bytes, got ${actualContent.length} bytes`
    )
  }
  
  return actualContent
}

/**
 * LFS Clean Filter
 * 
 * Converts actual file content (from working directory) to an LFS pointer file (for Git).
 * Stores the actual file in LFS storage.
 * 
 * @param fileContent - The actual file content (as Buffer)
 * @param backend - Git backend for storing LFS files
 * @param hashAlgorithm - Hash algorithm to use (default: 'sha256')
 * @returns The pointer file content (as Buffer)
 */
export async function cleanFilter(
  fileContent: UniversalBuffer,
  backend: GitBackend,
  hashAlgorithm: 'sha256' | 'sha1' = 'sha256'
): Promise<UniversalBuffer> {
  // Generate the pointer file
  const pointerText = await generatePointer(fileContent, hashAlgorithm)
  const pointer = parsePointer(pointerText)
  
  // Get the LFS object path
  const objectPath = getLFSObjectPath(pointer.oid)
  
  // Store the actual file in LFS storage
  await backend.writeLFSFile(objectPath, fileContent)
  
  // Return the pointer file content
  return UniversalBuffer.from(pointerText, 'utf8')
}

/**
 * Applies LFS smudge filter to a file during checkout
 * 
 * This is called when checking out files from Git. If the file is an LFS pointer,
 * it downloads the actual file content from LFS storage.
 * 
 * @param fs - File system client
 * @param dir - Working directory
 * @param gitdir - Git directory
 * @param filepath - Path to the file (relative to dir)
 * @param blobContent - The blob content from Git (may be a pointer file)
 * @param backend - Git backend for accessing LFS storage
 * @returns The file content to write to working directory
 */
export async function applySmudgeFilter({
  fs,
  dir,
  gitdir,
  filepath,
  blobContent,
  backend,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  filepath: string
  blobContent: UniversalBuffer
  backend: GitBackend
}): Promise<UniversalBuffer> {
  // Check if the blob is an LFS pointer
  if (!isPointer(blobContent)) {
    // Not an LFS file, return as-is
    return blobContent
  }
  
  // Check if file should be tracked with LFS (based on gitattributes)
  const shouldTrack = await shouldTrackWithLFS({ fs, dir, filepath })
  if (!shouldTrack) {
    // File has LFS pointer but gitattributes says not to track with LFS
    // This can happen if gitattributes changed. Return pointer as-is.
    return blobContent
  }
  
  // Apply smudge filter: convert pointer to actual file
  try {
    return await smudgeFilter(blobContent, backend)
  } catch (error) {
    // If LFS object is not found, return pointer file as fallback
    // This allows the repository to work even if LFS objects aren't downloaded
    console.warn(`LFS smudge filter failed for ${filepath}:`, error)
    return blobContent
  }
}

/**
 * Applies LFS clean filter to a file during staging
 * 
 * This is called when staging files. If the file should be tracked with LFS,
 * it converts the actual file content to a pointer file and stores the actual
 * file in LFS storage.
 * 
 * @param fs - File system client
 * @param dir - Working directory
 * @param gitdir - Git directory
 * @param filepath - Path to the file (relative to dir)
 * @param fileContent - The actual file content from working directory
 * @param backend - Git backend for storing LFS files
 * @param hashAlgorithm - Hash algorithm to use (default: 'sha256')
 * @returns The content to store in Git (pointer file if LFS-tracked, original content otherwise)
 */
export async function applyCleanFilter({
  fs,
  dir,
  gitdir,
  filepath,
  fileContent,
  backend,
  hashAlgorithm = 'sha256',
}: {
  fs: FileSystemProvider
  dir: string
  gitdir: string
  filepath: string
  fileContent: UniversalBuffer
  backend: GitBackend
  hashAlgorithm?: 'sha256' | 'sha1'
}): Promise<UniversalBuffer> {
  // Check if file should be tracked with LFS (based on gitattributes)
  const shouldTrack = await shouldTrackWithLFS({ fs, dir, filepath })
  if (!shouldTrack) {
    // Not tracked with LFS, return as-is
    return fileContent
  }
  
  // Apply clean filter: convert actual file to pointer
  return await cleanFilter(fileContent, backend, hashAlgorithm)
}

