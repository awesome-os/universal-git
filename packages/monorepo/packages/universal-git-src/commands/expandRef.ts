import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { parsePackedRefs } from "../git/refs/packedRefs.ts"
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { createFileSystem } from '../utils/createFileSystem.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import { join } from "../utils/join.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { CommandWithRefOptions } from "../types/commandOptions.ts"

// @see https://git-scm.com/docs/git-rev-parse.html#_specifying_revisions
const refpaths = (ref: string): string[] => [
  `${ref}`,
  `refs/${ref}`,
  `refs/tags/${ref}`,
  `refs/heads/${ref}`,
  `refs/remotes/${ref}`,
  `refs/remotes/${ref}/HEAD`,
]

/**
 * Expand an abbreviated ref to its full name
 *
 * @param {Object} args
 * @param {FileSystemProvider} args.fs - a file system implementation
 * @param {string} [args.dir] - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} args.ref - The ref to expand (like "v1.0.0")
 *
 * @returns {Promise<string>} Resolves successfully with a full ref name ("refs/tags/v1.0.0")
 *
 * @example
 * let fullRef = await git.expandRef({ fs, dir: '/tutorial', ref: 'main'})
 * console.log(fullRef)
 *
 */
export async function expandRef({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  ref,
  cache = {},
}: CommandWithRefOptions): Promise<string> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      ref,
    })

    assertParameter('ref', ref)
    
    // Is it a complete and valid SHA?
    if (ref.length === 40 && /[0-9a-f]{40}/.test(ref)) {
      return ref
    }
    
    // Read packed refs
    let packedMap = new Map<string, string>()
    try {
      const packedRefsPath = join(effectiveGitdir, 'packed-refs')
      const content = await fs.read(packedRefsPath, 'utf8')
      if (typeof content === 'string') {
        packedMap = parsePackedRefs(content)
      }
    } catch {
      // packed-refs doesn't exist, that's okay
    }
    
    // Look in all the proper paths, in this order
    const allpaths = refpaths(ref)
    for (const refPath of allpaths) {
      try {
        const exists = await fs.exists(join(effectiveGitdir, refPath))
        if (exists) return refPath
      } catch {
        // Continue to next path
      }
      if (packedMap.has(refPath)) return refPath
    }
    
    // Do we give up?
    throw new NotFoundError(ref)
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.expandRef'
    throw err
  }
}

