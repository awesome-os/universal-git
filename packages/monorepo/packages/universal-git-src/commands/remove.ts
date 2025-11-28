import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { createFileSystem } from "../utils/createFileSystem.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithFilepathOptions } from "../types/commandOptions.ts"

/**
 * Remove a file from the git index (aka staging area)
 *
 * Note that this does NOT delete the file in the working directory.
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system client
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.filepath - The path to the file to remove from the index
 * @param {object} [args.cache] - a [cache](cache.md) object
 *
 * @returns {Promise<void>} Resolves successfully once the git index has been updated
 *
 * @example
 * await git.remove({ fs, dir: '/tutorial', filepath: 'README.md' })
 * console.log('done')
 *
 */
export async function remove({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir: _gitdir,
  filepath,
  cache = {},
}: CommandWithFilepathOptions): Promise<void> {
  try {
    const { repo, dir: effectiveDir, cache: effectiveCache } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir: _gitdir,
      cache,
      filepath,
    })

    assertParameter('filepath', filepath)

    // Use gitBackend.readIndex() directly
    if (!repo.gitBackend) {
      throw new MissingParameterError('gitBackend (required for remove operation)')
    }
    const { GitIndex } = await import('../git/index/GitIndex.ts')
    const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
    const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
    
    let indexBuffer: UniversalBuffer
    try {
      indexBuffer = await repo.gitBackend.readIndex()
    } catch {
      indexBuffer = UniversalBuffer.alloc(0)
    }
    
    let index: GitIndex
    if (indexBuffer.length === 0) {
      const gitdir = await repo.getGitdir()
      const objectFormat = await detectObjectFormat(repo.fs || undefined, gitdir, repo.cache, repo.gitBackend)
      index = new GitIndex(null, undefined, 2)
    } else {
      const gitdir = await repo.getGitdir()
      const objectFormat = await detectObjectFormat(repo.fs || undefined, gitdir, repo.cache, repo.gitBackend)
      index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
    }
    
    index.delete({ filepath })
    await repo.writeIndexDirect(index)
    // Note: effectiveDir and effectiveCache are available but not needed here
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.remove'
    throw err
  }
}

