import ignore from 'ignore'

import { basename } from "../../utils/basename.ts"
import { dirname } from "../../utils/dirname.ts"
import { join } from "../../utils/join.ts"
import { createFileSystem } from '../../utils/createFileSystem.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Determines whether a given file is ignored based on `.gitignore` rules and exclusion files.
 * 
 * @param fs - File system client
 * @param dir - Working directory
 * @param gitdir - Path to .git directory
 * @param filepath - Path of the file to check (relative to dir)
 * @returns Promise resolving to true if the file is ignored, false otherwise
 */
export async function isIgnored({
  fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir?: string
  filepath: string
}): Promise<boolean> {
  const normalizedFs = createFileSystem(fs)
  // ALWAYS ignore ".git" folders.
  if (basename(filepath) === '.git') return true
  // '.' is not a valid gitignore entry, so '.' is never ignored
  if (filepath === '.') return false
  // Check and load exclusion rules from project exclude file (.git/info/exclude)
  let excludes = ''
  const excludesFile = join(gitdir, 'info', 'exclude')
  if (await normalizedFs.exists(excludesFile)) {
    const excludeContent = await normalizedFs.read(excludesFile, { encoding: 'utf8' })
    if (typeof excludeContent === 'string') {
      excludes = excludeContent
    }
  }
  // Find all the .gitignore files that could affect this file
  const pairs: Array<{ gitignore: string; filepath: string }> = [
    {
      gitignore: join(dir, '.gitignore'),
      filepath,
    },
  ]
  const pieces = filepath.split('/').filter(Boolean)
  for (let i = 1; i < pieces.length; i++) {
    const folder = pieces.slice(0, i).join('/')
    const file = pieces.slice(i).join('/')
    pairs.push({
      gitignore: join(dir, folder, '.gitignore'),
      filepath: file,
    })
  }
  let ignoredStatus = false
  let accumulatedIgnore = (ignore as any)().add(excludes)
  for (const p of pairs) {
    let file: string | undefined
    try {
      const content = await normalizedFs.read(p.gitignore, { encoding: 'utf8' })
      if (typeof content === 'string') {
        file = content
      }
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'NOENT') continue
    }
    if (!file) continue
    accumulatedIgnore.add(file)
    // If any parent directory of the original filepath is excluded, we are done.
    // "It is not possible to re-include a file if a parent directory of that file is excluded. Git doesn't list excluded directories for performance reasons, so any patterns on contained files have no effect, no matter where they are defined."
    // source: https://git-scm.com/docs/gitignore
    const originalPieces = filepath.split('/').filter(Boolean)
    for (let i = 1; i < originalPieces.length; i++) {
      const parentPath = originalPieces.slice(0, i).join('/')
      // Check both with and without trailing slash, as gitignore patterns may use either
      if (accumulatedIgnore.ignores(parentPath) || accumulatedIgnore.ignores(parentPath + '/')) {
        return true
      }
    }
    // If the file is currently ignored, test for UNignoring.
    if (ignoredStatus) {
      ignoredStatus = !(accumulatedIgnore as any).test(p.filepath).unignored
    } else {
      ignoredStatus = (accumulatedIgnore as any).test(p.filepath).ignored
    }
  }
  return ignoredStatus
}

