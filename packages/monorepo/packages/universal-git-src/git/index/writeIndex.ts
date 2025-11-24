/**
 * Writes the Git index directly to .git/index file
 * 
 * This is a stateless helper function that performs only I/O and serialization.
 * Caching is handled by the Repository class, which is the sole authority
 * for in-memory index state.
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param index - The GitIndex object to write
 * @param objectFormat - Object format ('sha1' or 'sha256'), will detect if not provided
 */
import { GitIndex } from './GitIndex.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import { join } from '../../core-utils/GitPath.ts'
import { normalize } from '../../core-utils/GitPath.ts'
import { detectObjectFormat, type ObjectFormat } from '../../utils/detectObjectFormat.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'

export async function writeIndex({
  fs,
  gitdir,
  index,
  objectFormat,
}: {
  fs: FileSystemProvider
  gitdir: string
  index: GitIndex
  objectFormat?: ObjectFormat
}): Promise<void> {
  const normalizedFs = createFileSystem(fs)
  const indexPath = join(gitdir, 'index')
  
  // Detect object format if not provided
  const format = objectFormat || await detectObjectFormat(fs, gitdir)
  const buffer = await index.toBuffer(format)
  await normalizedFs.write(indexPath, buffer)
  
  // Ensure write is flushed to disk
  if (normalizedFs.sync) {
    await normalizedFs.sync(indexPath)
  }
  
  // Record the mutation in StateMutationStream
  const { getStateMutationStream } = await import('../../core-utils/StateMutationStream.ts')
  const mutationStream = getStateMutationStream()
  const normalizedGitdir = normalize(gitdir)
  mutationStream.record({
    type: 'index-write',
    gitdir: normalizedGitdir,
    data: { entryCount: index.entriesMap.size },
  })
}

