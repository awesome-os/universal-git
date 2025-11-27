import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { MultipleGitError } from "../errors/MultipleGitError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { checkIgnored as checkIgnoredFile } from "../core-utils/filesystem/IgnoreManager.ts"
import { writeBlob } from "./writeBlob.ts"
import { createFileSystem } from "../utils/createFileSystem.ts"
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import { posixifyPathBuffer } from "../utils/posixifyPathBuffer.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Add a file to the git index (aka staging area)
 *
 * @param {object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string|string[]} args.filepath - The path to the file to add to the index
 * @param {object} [args.cache] - a [cache](cache.md) object
 * @param {boolean} [args.force=false] - add to index even if matches gitignore. Think `git add --force`
 * @param {boolean} [args.parallel=false] - process each input file in parallel. Parallel processing will result in more memory consumption but less process time
 *
 * @returns {Promise<void>} Resolves successfully once the git index has been updated
 *
 * @example
 * await fs.promises.writeFile('/tutorial/README.md', `# TEST`)
 * await git.add({ fs, dir: '/tutorial', filepath: 'README.md' })
 * console.log('done')
 *
 */
export type AddOptions = BaseCommandOptions & {
  filepath: string | string[]
  force?: boolean
  parallel?: boolean
}

export async function add({
  repo: _repo,
  fs: _fs,
  gitBackend,
  worktree: _worktree,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  cache = {},
  force = false,
  parallel = true,
}: AddOptions): Promise<void> {
  try {
    const { repo, fs, gitdir: effectiveGitdir, dir: effectiveDir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      gitBackend,
      worktree: _worktree,
      dir,
      gitdir,
      cache,
      filepath,
      force,
      parallel,
    })

    // add requires a working directory
    // If worktree backend is provided, dir should be derived from it using universal interface method
    // Otherwise, effectiveDir should be set
    let finalDir = effectiveDir
    if (!finalDir) {
      // Try to get dir from worktree backend if available using universal interface method
      const worktreeBackend = _worktree
      if (worktreeBackend && worktreeBackend.getDirectory) {
        finalDir = worktreeBackend.getDirectory() || null
      }
    }
    if (!finalDir) {
      throw new MissingParameterError('dir')
    }

    assertParameter('filepath', filepath)
    
    const worktree = repo.getWorktree()
    
    if (!worktree) {
      throw new Error('Cannot add files in bare repository')
    }
    
    // Read config
    // CRITICAL: Use repo.getConfig() instead of ConfigAccess for consistency
    const configService = await repo.getConfig()
    const autocrlf = ((await configService.get('core.autocrlf')) as string) || 'false'
    
    // Read index directly from .git/index file (single source of truth)
    const index = await repo.readIndexDirect()
    
    // Check for unmerged paths
    if (index.unmergedPaths.length > 0) {
      const { UnmergedPathsError } = await import('../errors/UnmergedPathsError.ts')
      throw new UnmergedPathsError(Array.from(index.unmergedPaths))
    }
    
    // Modify index
    await addToIndex({
      dir: finalDir,
      gitdir: effectiveGitdir,
      fs,
      repo,
      filepath,
      index,
      force,
      parallel,
      autocrlf,
    })
    
    // Write index directly to .git/index file (single source of truth)
    await repo.writeIndexDirect(index)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.add'
    throw err
  }
}

async function addToIndex({
  dir,
  gitdir,
  fs,
  repo,
  filepath,
  index,
  force,
  parallel,
  autocrlf,
}: {
  dir: string
  gitdir: string
  fs: ReturnType<typeof createFileSystem>
  repo: Repository
  filepath: string | string[]
  index: import('../git/index/GitIndex.ts').GitIndex
  force: boolean
  parallel: boolean
  autocrlf: string
}): Promise<void> {
  // TODO: Should ignore UNLESS it's already in the index.
  const filepaths = Array.isArray(filepath) ? filepath : [filepath]
  const promises = filepaths.map(async currentFilepath => {
    if (!force) {
      const ignored = await checkIgnoredFile({
        fs: fs as any,
        dir,
        gitdir,
        filepath: currentFilepath,
      })
      if (ignored) return
    }
    const stats = await fs.lstat(join(dir, currentFilepath))
    if (!stats) throw new NotFoundError(currentFilepath)

    if (stats.isDirectory()) {
      const children = await fs.readdir(join(dir, currentFilepath))
      if (!children) return
      if (parallel) {
        const promises = children.map(child =>
          addToIndex({
            dir,
            gitdir,
            fs,
            repo,
            filepath: join(currentFilepath, child),
            index,
            force,
            parallel,
            autocrlf,
          })
        )
        await Promise.all(promises)
      } else {
        for (const child of children) {
          await addToIndex({
            dir,
            gitdir,
            fs,
            repo,
            filepath: join(currentFilepath, child),
            index,
            force,
            parallel,
            autocrlf,
          })
        }
      }
    } else {
      let object = stats.isSymbolicLink()
        ? await fs.readlink(join(dir, currentFilepath)).then((buf) => buf ? posixifyPathBuffer(buf) : null)
        : await fs.read(join(dir, currentFilepath), { autocrlf })
      if (object === null || object === undefined) throw new NotFoundError(currentFilepath)
      
      // Apply LFS clean filter if needed (converts actual file content to pointer files)
      // Only apply to regular files (not symlinks)
      if (!stats.isSymbolicLink() && UniversalBuffer.isBuffer(object)) {
        try {
          const { applyCleanFilter } = await import('../git/lfs/filter.ts')
          const { FilesystemBackend } = await import('../backends/FilesystemBackend.ts')
          const backend = new FilesystemBackend(fs, gitdir)
          // Ensure object is UniversalBuffer (not BufferConstructor)
          // UniversalBuffer.isBuffer already checked above, so we know it's a UniversalBuffer
          const fileContent: UniversalBuffer = object as UniversalBuffer
          const filteredContent = await applyCleanFilter({
            fs,
            dir,
            gitdir,
            filepath: currentFilepath,
            fileContent,
            backend,
          })
          object = filteredContent
        } catch (err) {
          // If LFS filter fails, use original content
          // This allows the repo to work even if LFS is misconfigured
        }
      }
      
      // Write blob using writeBlob
      // Use repo parameter to ensure fs is available from checked-out worktree
      const objectBuffer = UniversalBuffer.from(object as string | Uint8Array)
      const oid = await writeBlob({ repo, fs: fs as any, gitdir, blob: objectBuffer })
      
      // Insert into index using GitIndex.insert() method
      index.insert({
        filepath: currentFilepath,
        oid,
        stats,
        stage: 0,
      })
    }
  })

  const settledPromises = await Promise.allSettled(promises)
  const rejectedPromises = settledPromises
    .filter((settle): settle is PromiseRejectedResult => settle.status === 'rejected')
    .map(settle => settle.reason)
  if (rejectedPromises.length > 1) {
    throw new MultipleGitError(rejectedPromises)
  }
  if (rejectedPromises.length === 1) {
    throw rejectedPromises[0]
  }

  // Return void as per the function signature
  return
}


