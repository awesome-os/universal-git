import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { listRefs } from "../git/refs/listRefs.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { join } from "../utils/join.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { writeRefsAdResponse } from "../wire/writeRefsAdResponse.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"

export type UploadPackOptions = BaseCommandOptions & {
  advertiseRefs?: boolean
}

export async function uploadPack({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  advertiseRefs = false,
  cache = {},
}: UploadPackOptions): Promise<UniversalBuffer[] | undefined> {
  try {
    const { repo, fs, gitdir: effectiveGitdir } = await normalizeCommandArgs({
      repo: _repo,
      fs: _fs,
      dir,
      gitdir,
      cache,
      advertiseRefs,
    })

    if (advertiseRefs) {
      // Send a refs advertisement
      const capabilities = [
        'thin-pack',
        'side-band',
        'side-band-64k',
        'shallow',
        'deepen-since',
        'deepen-not',
        'allow-tip-sha1-in-want',
        'allow-reachable-sha1-in-want',
      ]
      let keys = await listRefs({
        fs,
        gitdir: effectiveGitdir,
        filepath: 'refs',
      })
      keys = keys.map(ref => `refs/${ref}`)
      const refs: Record<string, string> = {}
      keys.unshift('HEAD') // HEAD must be the first in the list
      for (const key of keys) {
        refs[key] = await resolveRef({ fs, gitdir: effectiveGitdir, ref: key })
      }
      const symrefs: Record<string, string> = {}
      symrefs.HEAD = await resolveRef({
        fs,
        gitdir: effectiveGitdir,
        ref: 'HEAD',
        depth: 2,
      })
      return writeRefsAdResponse({
        capabilities,
        refs,
        symrefs,
      })
    }
  } catch (err: any) {
    err.caller = 'git.uploadPack'
    throw err
  }
}

