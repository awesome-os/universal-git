import { normalize } from "../../core-utils/GitPath.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"
import type { GitBackendFs } from './GitBackendFs.ts'

/**
 * UpdateIndex operation for GitBackendFs
 */

export async function updateIndex(
  this: GitBackendFs,
  worktreeBackend: import('../../git/worktree/GitWorktreeBackend.ts').GitWorktreeBackend,
  filepath: string,
  options?: {
    oid?: string
    mode?: number
    add?: boolean
    remove?: boolean
    force?: boolean
  }
): Promise<string | void> {
  const { InvalidFilepathError } = await import('../../errors/InvalidFilepathError.ts')
  const { NotFoundError } = await import('../../errors/NotFoundError.ts')
  const { GitIndex } = await import('../../git/index/GitIndex.ts')
  const { writeObject } = await import('../../git/objects/writeObject.ts')
  const { normalizeStats } = await import('../../utils/normalizeStats.ts')
  
  // Normalize filepath
  const normalizedFilepath = normalize(filepath)
  
  // Read index directly using backend
  let indexBuffer: UniversalBuffer
  try {
    indexBuffer = await this.readIndex()
  } catch {
    indexBuffer = UniversalBuffer.alloc(0)
  }

  // Parse index
  let index: InstanceType<typeof GitIndex>
  const objectFormat = await this.getObjectFormat({})
  if (indexBuffer.length === 0) {
    index = new GitIndex(null, undefined, 2)
  } else {
    index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
  }

  if (options?.remove) {
    if (!options.force) {
      // Check if the file is still present in the working directory
      const stat = await worktreeBackend.lstat(normalizedFilepath)
      if (stat) {
        if (stat.isDirectory()) {
          throw new InvalidFilepathError('directory')
        }
        // Do nothing if we don't force and the file still exists in the workdir
        return
      }
    }

    // Directories are not allowed, so we make sure the provided filepath exists in the index
    if (index.has({ filepath: normalizedFilepath })) {
      index.delete({ filepath: normalizedFilepath })
      const updatedIndexBuffer = await index.toBuffer(objectFormat)
      await this.writeIndex(updatedIndexBuffer)
    }
    return
  }

  // Test if it is a file and exists on disk if `remove` is not provided, only if no oid is provided
  let fileStats: any

  if (!options?.oid) {
    const stat = await worktreeBackend.lstat(normalizedFilepath)
    if (!stat) {
      throw new NotFoundError(`file at "${normalizedFilepath}" on disk and "remove" not set`)
    }
    if (stat.isDirectory()) {
      throw new InvalidFilepathError('directory')
    }
    fileStats = stat
  }

  if (!options?.add && !index.has({ filepath: normalizedFilepath })) {
    // If the index does not contain the filepath yet and `add` is not set, we should throw
    throw new NotFoundError(`file at "${normalizedFilepath}" in index and "add" not set`)
  }

  let stats: any
  let oid: string | undefined = options?.oid

  if (!oid) {
    stats = fileStats

    // Read file content from worktreeBackend
    let content: Uint8Array | string | null = null
    if (stats.isSymbolicLink()) {
      content = await worktreeBackend.readlink(normalizedFilepath)
    } else {
      content = await worktreeBackend.read(normalizedFilepath)
    }

    // Convert string to UniversalBuffer if needed, skip if null
    if (content) {
      const objectBuffer = typeof content === 'string' 
        ? UniversalBuffer.from(content, 'utf8')
        : UniversalBuffer.isBuffer(content) 
          ? content 
          : UniversalBuffer.from(content)
      
      oid = await writeObject({
        fs: this.getFs(),
        gitdir: this.getGitdir(),
        type: 'blob',
        format: 'content',
        object: objectBuffer,
      })
    }
  } else {
    // By default we use 0 for the stats of the index file
    stats = {
      ctime: new Date(0),
      mtime: new Date(0),
      dev: 0,
      ino: 0,
      mode: options?.mode || 0o100644,
      uid: 0,
      gid: 0,
      size: 0,
    }
  }

  // Ensure oid is defined before inserting
  if (!oid) {
    throw new Error('oid is required for index.insert')
  }

  // Convert stat to the format expected by GitIndex
  const normalizedStats = normalizeStats(stats)

  index.insert({
    filepath: normalizedFilepath,
    oid,
    stats: normalizedStats,
  })

  // Write index back using backend
  const updatedIndexBuffer = await index.toBuffer(objectFormat)
  await this.writeIndex(updatedIndexBuffer)
  return oid
}

