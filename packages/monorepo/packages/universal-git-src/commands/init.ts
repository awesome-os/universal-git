import { join } from "../utils/join.ts"
import { ConfigAccess } from "../utils/configAccess.ts"
import { writeSymbolicRef } from "../git/refs/writeRef.ts"
import { FilesystemBackend } from '../backends/index.ts'
import { assertParameter } from "../utils/assertParameter.ts"
import type { ObjectFormat } from "../utils/detectObjectFormat.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"
import type { GitBackend } from '../backends/index.ts'

/**
 * Initialize a new repository
 * 
 * @param objectFormat - Object format to use ('sha1' or 'sha256'), defaults to 'sha1'
 */
export async function init({
  fs: _fs,
  bare = false,
  dir,
  gitdir = bare ? dir : (dir ? join(dir, '.git') : undefined),
  defaultBranch = 'master',
  objectFormat = 'sha1',
  backend,
}: {
  fs: FileSystemProvider
  bare?: boolean
  dir?: string
  gitdir?: string
  defaultBranch?: string
  objectFormat?: ObjectFormat
  backend?: GitBackend
}): Promise<void> {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir!)
    if (!bare) {
      assertParameter('dir', dir)
    }

    const fs = _fs
    return await _init({
      fs,
      bare,
      dir,
      gitdir,
      defaultBranch,
      objectFormat,
      backend,
    })
  } catch (err) {
    ;(err as { caller?: string }).caller = 'git.init'
    throw err
  }
}

/**
 * Internal init implementation
 * @internal - Exported for use by other commands (e.g., clone)
 */
export async function _init({
  fs,
  bare = false,
  dir,
  gitdir = bare ? dir : (dir ? join(dir, '.git') : undefined),
  defaultBranch = 'master',
  objectFormat = 'sha1',
  backend,
}: {
  fs: FileSystemProvider
  bare?: boolean
  dir?: string
  gitdir?: string
  defaultBranch?: string
  objectFormat?: ObjectFormat
  backend?: GitBackend
}): Promise<void> {
  // Use backend if provided, otherwise create filesystem backend
  const resolvedGitdir = gitdir! // Asserted by assertParameter above
  const gitBackend = backend || new FilesystemBackend(fs, resolvedGitdir)

  // Check if already initialized
  if (await gitBackend.isInitialized()) {
    return
  }

  // Initialize backend structure
  await gitBackend.initialize()

  // Use ConfigAccess to set initial config values
  const configAccess = new ConfigAccess(fs, resolvedGitdir)
  
  // Set repository format version and object format
  if (objectFormat === 'sha256') {
    // SHA-256 requires repository format version 1 (for extensions)
    await configAccess.setConfigValue('core.repositoryformatversion', '1', 'local')
    await configAccess.setConfigValue('extensions.objectformat', 'sha256', 'local')
  } else {
    // SHA-1 uses repository format version 0
    await configAccess.setConfigValue('core.repositoryformatversion', '0', 'local')
  }
  
  await configAccess.setConfigValue('core.filemode', 'false', 'local')
  await configAccess.setConfigValue('core.bare', bare.toString(), 'local')
  if (!bare) {
    await configAccess.setConfigValue('core.logallrefupdates', 'true', 'local')
  }
  await configAccess.setConfigValue('core.symlinks', 'false', 'local')
  await configAccess.setConfigValue('core.ignorecase', 'true', 'local')

  // Use writeSymbolicRef to set HEAD (symbolic ref)
  await gitBackend.writeHEAD(`ref: refs/heads/${defaultBranch}`)
}

