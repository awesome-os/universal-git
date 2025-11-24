import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

/**
 * Read an entry from the git config files.
 *
 * *Caveats:*
 * - Currently only the local `$GIT_DIR/config` file can be read or written. However support for the global `~/.gitconfig` and system `$(prefix)/etc/gitconfig` will be added in the future.
 * - The current parser does not support the more exotic features of the git-config file format such as `[include]` and `[includeIf]`.
 */
export type GetConfigOptions = BaseCommandOptions & {
  path: string
}

export async function getConfig({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  path,
  cache = {},
}: GetConfigOptions): Promise<unknown> {
  try {
    const { repo } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      path,
    })

    assertParameter('path', path)
    const config = await repo.getConfig()
    const value = await config.get(path)
    return value
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.getConfig'
    throw err
  }
}

/**
 * Internal getConfig implementation
 * @internal - Exported for use by other commands
 */
export async function _getConfig({
  repo: _repo,
  fs: _fs,
  gitdir: _gitdir,
  path,
  cache: _cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  gitdir?: string
  path: string
  cache?: Record<string, unknown>
}): Promise<unknown> {
  // Use normalizeCommandArgs for consistency
  const { repo } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    gitdir: _gitdir,
    cache: _cache,
    path,
  })

  const config = await repo.getConfig()
  return config.get(path)
}

