import { setConfig } from './setConfig.ts'
import type { Repository } from "../core-utils/Repository.ts"
import type { FileSystemProvider } from "../models/FileSystem.ts"

/**
 * Delete an entry from the git config files.
 * This is a convenience wrapper around setConfig with value: undefined.
 */
export async function deleteConfig({
  repo,
  fs,
  dir,
  gitdir,
  path,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  path: string
  cache?: Record<string, unknown>
}): Promise<void> {
  return setConfig({
    repo,
    fs,
    dir,
    gitdir,
    path,
    value: undefined,
    cache,
  })
}

