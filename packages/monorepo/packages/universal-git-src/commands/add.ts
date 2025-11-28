import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
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
  _skipBackendDelegation?: boolean // Internal flag to prevent circular calls
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
  _skipBackendDelegation = false,
}: AddOptions): Promise<void> {
  try {
    // If _skipBackendDelegation is true, we're being called from gitBackend.add
    // and should implement the logic directly instead of delegating
    if (_skipBackendDelegation) {
      // This path will be implemented when we refactor to use worktreeBackend directly
      // For now, this should not be reached
      throw new Error('Direct add implementation not yet available - use repo.add() or gitBackend.add()')
    }

    const { repo, gitdir: effectiveGitdir } = await normalizeCommandArgs({
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

    if (!filepath) {
      throw new MissingParameterError('filepath')
    }

    const worktreeBackend = repo?.worktreeBackend ?? _worktree ?? null
    if (!worktreeBackend) {
      throw new Error('Cannot add files in bare repository')
    }

    // Get gitBackend from repo if not provided directly
    const effectiveGitBackend = gitBackend ?? repo?.gitBackend
    if (!effectiveGitBackend) {
      throw new MissingParameterError('gitBackend (required for add operation)')
    }
    if (!worktreeBackend) {
      throw new MissingParameterError('worktreeBackend (required for add operation)')
    }

    await effectiveGitBackend.add(worktreeBackend, filepath, {
      force,
      parallel,
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'caller' in err) {
      ;(err as { caller: string }).caller = 'git.add'
    }
    throw err
  }
}


