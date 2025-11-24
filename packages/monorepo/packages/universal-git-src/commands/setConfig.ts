import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { Repository } from "../core-utils/Repository.ts"
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { join } from "../utils/join.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Write an entry to the git config files.
 *
 * *Caveats:*
 * - Currently only the local `$GIT_DIR/config` file can be read or written. However support for the global `~/.gitconfig` and system `$(prefix)/etc/gitconfig` will be added in the future.
 * - The current parser does not support the more exotic features of the git-config file format such as `[include]` and `[includeIf]`.
 */
export async function setConfig({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = join(dir ? dir : "", '.git'),
  path,
  value,
  append = false,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  path: string
  value: string | boolean | number | undefined
  append?: boolean
  cache?: Record<string, unknown>
}): Promise<void> {
  try {
    const { repo } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir: gitdir || (dir ? join(dir, '.git') : undefined),
      cache,
      path,
      value,
      append,
    })

    assertParameter('path', path)
    const config = await repo.getConfig()
    
    if (append) {
      await config.append(path, value, 'local')
    } else {
      await config.set(path, value, 'local')
    }
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.setConfig'
    throw err
  }
}

