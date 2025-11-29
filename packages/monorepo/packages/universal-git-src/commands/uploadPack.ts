import { MissingParameterError } from "../errors/MissingParameterError.ts"
import { listRefs as listRefsDirect } from "../git/refs/listRefs.ts"
import { resolveRef } from "../git/refs/readRef.ts"
import { join } from "../utils/join.ts"
import { normalizeCommandArgs } from "../utils/commandHelpers.ts"
import { writeRefsAdResponse } from "../wire/writeRefsAdResponse.ts"
import { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"
import type { BaseCommandOptions } from "../types/commandOptions.ts"
import { NotFoundError } from "../errors/NotFoundError.ts"
import { setErrorCaller } from "../utils/errorHandler.ts"

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
    let repo: Repository
    let fs: FileSystemProvider
    let effectiveGitdir: string
    
    try {
      const normalized = await normalizeCommandArgs({
        repo: _repo,
        fs: _fs,
        dir,
        gitdir,
        cache,
        advertiseRefs,
      })
      repo = normalized.repo
      fs = normalized.fs
      effectiveGitdir = normalized.gitdir
      } catch (err: any) {
        // Ensure caller is set even for errors from normalizeCommandArgs
        throw setErrorCaller(err, 'git.uploadPack')
      }

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
      
      // Use backend's listRefs if available, otherwise fall back to direct filesystem function
      let keys: string[]
      try {
        if (repo.gitBackend) {
          keys = await repo.gitBackend.listRefs('refs')
        } else {
          keys = await listRefsDirect({
            fs,
            gitdir: effectiveGitdir,
            filepath: 'refs',
          })
        }
      } catch (err: any) {
        // Ensure caller is set for listRefs errors
        if (err && typeof err === 'object') {
          try {
            ;(err as { caller?: string }).caller = 'git.uploadPack'
          } catch {
            // If we can't set the property, wrap the error
          }
        }
        throw setErrorCaller(err, 'git.uploadPack')
      }
      
      keys = keys.map(ref => `refs/${ref}`)
      // Filter out .gitkeep and other non-ref files before processing
      keys = keys.filter(key => !key.endsWith('.gitkeep') && !key.includes('/.gitkeep'))
      const refs: Record<string, string> = {}
      keys.unshift('HEAD') // HEAD must be the first in the list
      for (const key of keys) {
        try {
          // Use backend's readRef if available, otherwise fall back to direct function
          if (repo.gitBackend) {
            const resolved = await repo.gitBackend.readRef(key)
            if (resolved) {
              refs[key] = resolved
            } else {
              // Skip refs that don't resolve (e.g., .gitkeep files)
              continue
            }
          } else {
            const resolved = await resolveRef({ fs, gitdir: effectiveGitdir, ref: key })
            if (resolved) {
              refs[key] = resolved
            } else {
              // Skip refs that don't resolve
              continue
            }
          }
        } catch (err: any) {
          // Skip invalid refs (e.g., .gitkeep files)
          // Only skip NotFoundError for non-HEAD refs
          if (key !== 'HEAD' && err && typeof err === 'object' && 'code' in err && (err as any).code === 'NotFoundError') {
            continue
          }
          // Ensure caller is set before re-throwing
          throw setErrorCaller(err, 'git.uploadPack')
        }
      }
      const symrefs: Record<string, string> = {}
      // Use backend's readRef for HEAD if available
      try {
        if (repo.gitBackend) {
          const headResolved = await repo.gitBackend.readRef('HEAD', 2)
          if (headResolved) {
            symrefs.HEAD = headResolved
          }
        } else {
          symrefs.HEAD = await resolveRef({
            fs,
            gitdir: effectiveGitdir,
            ref: 'HEAD',
            depth: 2,
          })
        }
      } catch (err: any) {
        // Ensure caller is set for HEAD readRef errors
        throw setErrorCaller(err, 'git.uploadPack')
      }
      return writeRefsAdResponse({
        capabilities,
        refs,
        symrefs,
      })
    }
  } catch (err: any) {
    // Ensure caller is set on all error types
    throw setErrorCaller(err, 'git.uploadPack')
  }
}

