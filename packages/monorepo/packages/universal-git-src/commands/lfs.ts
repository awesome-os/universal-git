/**
 * Git LFS Command
 * 
 * High-level API for Git LFS operations
 */

import { MissingParameterError } from '../errors/MissingParameterError.ts'
import { parsePointer, generatePointer, isPointer, getLFSObjectPath } from '../git/lfs/pointer.ts'
import { shouldTrackWithLFS, smudgeFilter, cleanFilter } from '../git/lfs/filter.ts'
import { getAttributes } from '../core-utils/filesystem/GitAttributesParser.ts'
import { normalizeCommandArgs } from '../utils/commandHelpers.ts'
import { Repository } from '../core-utils/Repository.ts'
import { join } from '../utils/join.ts'
import { assertParameter } from '../utils/assertParameter.ts'
import type { FileSystemProvider } from '../models/FileSystem.ts'

/**
 * Track files with Git LFS
 * 
 * Adds LFS tracking patterns to `.gitattributes` file.
 * 
 * @param args - Command arguments
 * @param args.fs - File system client
 * @param args.dir - Working directory
 * @param args.gitdir - Git directory (default: join(dir, '.git'))
 * @param args.patterns - File patterns to track (e.g., ['*.psd', '*.zip'])
 * @param args.cache - Cache object
 */
export async function lfsTrack({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  patterns,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  patterns: string[]
  cache?: Record<string, unknown>
}): Promise<void> {
  const { repo, fs, dir: effectiveDir, cache: effectiveCache } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    dir,
    gitdir,
    cache,
    patterns,
  })

  assertParameter('patterns', patterns)
  
  if (!effectiveDir) {
    throw new MissingParameterError('dir')
  }

  const gitattributesPath = join(effectiveDir, '.gitattributes')
  
  // Read existing .gitattributes file
  let existingContent = ''
  try {
    const content = await fs.read(gitattributesPath, 'utf8')
    existingContent = (content || '') as string
  } catch {
    // File doesn't exist, start with empty content
  }
  
  // Parse existing rules
  const lines = (existingContent || '').split('\n')
  const existingPatterns = new Set<string>()
  
  // Check which patterns already exist
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2 && parts[1] === 'filter=lfs') {
      existingPatterns.add(parts[0])
    }
  }

  // Add new patterns
  const newLines: string[] = []
  for (const pattern of patterns) {
    if (!existingPatterns.has(pattern)) {
      newLines.push(`${pattern} filter=lfs diff=lfs merge=lfs -text`)
    }
  }

  if (newLines.length > 0) {
    // Append new patterns to file
    const contentToAppend = existingContent.endsWith('\n') || existingContent === ''
      ? newLines.join('\n') + '\n'
      : '\n' + newLines.join('\n') + '\n'
    
    await fs.write(gitattributesPath, existingContent + contentToAppend, 'utf8')
  }
}

/**
 * Untrack files from Git LFS
 * 
 * Removes LFS tracking patterns from `.gitattributes` file.
 * 
 * @param args - Command arguments
 * @param args.fs - File system client
 * @param args.dir - Working directory
 * @param args.gitdir - Git directory (default: join(dir, '.git'))
 * @param args.patterns - File patterns to untrack
 * @param args.cache - Cache object
 */
export async function lfsUntrack({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  patterns,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  patterns: string[]
  cache?: Record<string, unknown>
}): Promise<void> {
  const { repo, fs, dir: effectiveDir, cache: effectiveCache } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    dir,
    gitdir,
    cache,
    patterns,
  })

  // dir is required for lfs operations
  if (!effectiveDir) {
    throw new Error('dir is required when repo is not provided')
  }

  assertParameter('patterns', patterns)

  const gitattributesPath = join(effectiveDir, '.gitattributes')
  
  // Read existing .gitattributes file
  let existingContent = ''
  try {
    const content = await fs.read(gitattributesPath, 'utf8')
    existingContent = (content || '') as string
  } catch {
    // File doesn't exist, nothing to do
    return
  }

  // Remove lines matching the patterns
  const lines = (existingContent || '').split('\n')
  const patternsToRemove = new Set(patterns)
  const newLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      newLines.push(line)
      continue
    }

    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2 && parts[1] === 'filter=lfs') {
      if (!patternsToRemove.has(parts[0])) {
        newLines.push(line)
      }
      // Otherwise, skip this line (remove it)
    } else {
      newLines.push(line)
    }
  }

  // Write updated content
  await fs.write(gitattributesPath, newLines.join('\n'), 'utf8')
}

/**
 * List files tracked by Git LFS
 * 
 * @param args - Command arguments
 * @param args.fs - File system client
 * @param args.dir - Working directory
 * @param args.gitdir - Git directory (default: join(dir, '.git'))
 * @param args.cache - Cache object
 * @returns Array of file paths tracked by LFS
 */
export async function lfsList({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  cache?: Record<string, unknown>
}): Promise<string[]> {
  const { repo, fs, dir: effectiveDir, cache: effectiveCache } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    dir,
    gitdir,
    cache,
  })

  // dir is required for lfs operations
  if (!effectiveDir) {
    throw new Error('dir is required when repo is not provided')
  }

  const { FilesystemBackend } = await import('../backends/FilesystemBackend.ts')
  const effectiveGitdir = await repo.getGitdir()
  if (!effectiveGitdir) throw new Error('gitdir is required')
  const backend = new FilesystemBackend(fs, effectiveGitdir)

  // Get all files from the index
  const { GitIndex } = await import('../git/index/GitIndex.ts')
  const { detectObjectFormat } = await import('../utils/detectObjectFormat.ts')
  const { UniversalBuffer } = await import('../utils/UniversalBuffer.ts')
  
  let indexBuffer: UniversalBuffer
  if (repo.gitBackend) {
    try {
      indexBuffer = await repo.gitBackend.readIndex()
    } catch {
      indexBuffer = UniversalBuffer.alloc(0)
    }
  } else {
    throw new Error('gitBackend is required')
  }
  
  let index: GitIndex
  if (indexBuffer.length === 0) {
    index = new GitIndex()
  } else {
    const objectFormat = await detectObjectFormat(fs, effectiveGitdir, repo.cache, repo.gitBackend)
    index = await GitIndex.fromBuffer(indexBuffer, objectFormat)
  }
  
  const lfsFiles: string[] = []

  for (const entry of index.entries) {
    const filepath = entry.path
    const shouldTrack = await shouldTrackWithLFS({ fs, dir: effectiveDir, filepath })
    
    if (shouldTrack) {
      lfsFiles.push(filepath)
    }
  }

  return lfsFiles
}

/**
 * Check if a file is tracked by Git LFS
 * 
 * @param args - Command arguments
 * @param args.fs - File system client
 * @param args.dir - Working directory
 * @param args.gitdir - Git directory (default: join(dir, '.git'))
 * @param args.filepath - Path to the file to check
 * @param args.cache - Cache object
 * @returns true if the file is tracked by LFS
 */
export async function lfsIsTracked({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  filepath,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  filepath: string
  cache?: Record<string, unknown>
}): Promise<boolean> {
  const { repo, fs, dir: effectiveDir, cache: effectiveCache } = await normalizeCommandArgs({
    repo: _repo,
    fs: _fs,
    dir,
    gitdir,
    cache,
    filepath,
  })

  // dir is required for lfs operations
  if (!effectiveDir) {
    throw new Error('dir is required when repo is not provided')
  }

  assertParameter('filepath', filepath)

  return await shouldTrackWithLFS({ fs, dir: effectiveDir, filepath })
}

/**
 * Unified LFS command
 * 
 * @param args - Command arguments
 */
export async function lfs({
  repo: _repo,
  fs: _fs,
  dir,
  gitdir = dir ? join(dir, '.git') : undefined,
  track,
  untrack,
  list,
  isTracked,
  filepath,
  cache = {},
}: {
  repo?: Repository
  fs?: FileSystemProvider
  dir?: string
  gitdir?: string
  track?: string[]
  untrack?: string[]
  list?: boolean
  isTracked?: boolean
  filepath?: string
  cache?: Record<string, unknown>
}): Promise<string[] | boolean | void> {
  if (track) {
    await lfsTrack({ repo: _repo, fs: _fs, dir, gitdir, patterns: track, cache })
    return
  }

  if (untrack) {
    await lfsUntrack({ repo: _repo, fs: _fs, dir, gitdir, patterns: untrack, cache })
    return
  }

  if (list) {
    return await lfsList({ repo: _repo, fs: _fs, dir, gitdir, cache })
  }

  if (isTracked && filepath) {
    return await lfsIsTracked({ repo: _repo, fs: _fs, dir, gitdir, filepath, cache })
  }

  throw new Error('Invalid LFS command: must specify track, untrack, list, or isTracked')
}

