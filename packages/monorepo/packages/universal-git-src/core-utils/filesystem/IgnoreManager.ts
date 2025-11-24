import ignore from 'ignore'
import { basename } from "../../utils/basename.ts"
import { dirname } from "../../utils/dirname.ts"
import { join } from '../GitPath.ts'
import type { FileSystemProvider } from "../../models/FileSystem.ts"

/**
 * Loads gitignore rules from a file
 */
export const loadRules = async ({
  fs,
  fromFile,
}: {
  fs: FileSystemProvider
  fromFile: string
}): Promise<string[]> => {
  try {
    const content = await fs.read(fromFile, 'utf8')
    return (content as string).split('\n').filter(line => line.trim().length > 0)
  } catch (err) {
    if ((err as { code?: string }).code === 'NOENT') {
      return []
    }
    throw err
  }
}

/**
 * Checks if a filepath matches any of the ignore rules
 */
export const isIgnored = ({
  filepath,
  rules,
}: {
  filepath: string
  rules: string[]
}): boolean => {
  if (rules.length === 0) return false

  const ign = (ignore as any)().add(rules.join('\n'))
  return ign.test(filepath).ignored
}

/**
 * Determines whether a given file is ignored based on `.gitignore` rules and exclusion files
 */
export const checkIgnored = async ({
  fs,
  dir,
  gitdir,
  filepath,
}: {
  fs: FileSystemProvider
  dir: string
  gitdir?: string
  filepath: string
}): Promise<boolean> => {
  // ALWAYS ignore ".git" folders.
  if (basename(filepath) === '.git') return true
  // '.' is not a valid gitignore entry, so '.' is never ignored
  if (filepath === '.') return false

  // Check and load exclusion rules from project exclude file (.git/info/exclude)
  let excludes = ''
  if (gitdir) {
    const excludesFile = join(gitdir, 'info', 'exclude')
    if (await fs.exists(excludesFile)) {
      excludes = (await fs.read(excludesFile, 'utf8')) as string
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
  for (const p of pairs) {
    let file: string
    try {
      file = (await fs.read(p.gitignore, 'utf8')) as string
    } catch (err) {
      if ((err as { code?: string }).code === 'NOENT') continue
      throw err
    }
    const ign = (ignore as any)().add(excludes)
    ign.add(file)
    // If the parent directory is excluded, we are done.
    // "It is not possible to re-include a file if a parent directory of that file is excluded. Git doesn't list excluded directories for performance reasons, so any patterns on contained files have no effect, no matter where they are defined."
    // source: https://git-scm.com/docs/gitignore
    const parentdir = dirname(p.filepath)
    if (parentdir !== '.' && ign.ignores(parentdir)) return true
    // If the file is currently ignored, test for UNignoring.
    if (ignoredStatus) {
      ignoredStatus = !ign.test(p.filepath).unignored
    } else {
      ignoredStatus = ign.test(p.filepath).ignored
    }
  }
  return ignoredStatus
}

/**
 * Namespace export for IgnoreManager
 */
export const IgnoreManager = {
  loadRules,
  isIgnored,
  checkIgnored,
}

