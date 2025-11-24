import { join } from '../../core-utils/GitPath.ts'
import { dirname } from '../../utils/dirname.ts'
import { getConfig } from '../config.ts'
import { createFileSystem } from '../../utils/createFileSystem.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'


/**
 * Formats timezone offset from minutes to +HHMM or -HHMM format
 * 
 * @param minutes - Timezone offset in minutes (e.g., -300 for UTC-5)
 * @returns Formatted timezone offset (e.g., '-0500')
 */
function formatTimezoneOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const absMinutes = Math.abs(minutes)
  const hours = Math.floor(absMinutes / 60)
  const remainingMinutes = absMinutes - hours * 60
  const strHours = String(hours).padStart(2, '0')
  const strMinutes = String(remainingMinutes).padStart(2, '0')
  return `${sign}${strHours}${strMinutes}`
}

/**
 * Checks if reflog is enabled for the repository
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param systemConfigPath - Optional path to system config
 * @param globalConfigPath - Optional path to global config
 * @returns `true` if reflog is enabled, `false` otherwise
 */
async function isReflogEnabled({
  fs,
  gitdir,
  systemConfigPath,
  globalConfigPath,
}: {
  fs: FileSystemProvider
  gitdir: string
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<boolean> {
  try {
    const logAllRefUpdates = await getConfig({
      fs,
      gitdir,
      path: 'core.logAllRefUpdates',
      systemConfigPath,
      globalConfigPath,
    })

    // If explicitly set to 'false', disable
    if (logAllRefUpdates === 'false' || logAllRefUpdates === false) {
      return false
    }

    // If explicitly set to 'always', enable
    if (logAllRefUpdates === 'always') {
      return true
    }

    // If explicitly set to 'true', enable
    if (logAllRefUpdates === 'true' || logAllRefUpdates === true) {
      return true
    }

    // Default behavior: check if repository is bare
    // Non-bare repos default to true, bare repos default to false
    const bare = await getConfig({
      fs,
      gitdir,
      path: 'core.bare',
      systemConfigPath,
      globalConfigPath,
    })

    const isBare = bare === 'true' || bare === true

    // Default: true for non-bare, false for bare
    return !isBare
  } catch {
    // If we can't read config, default to true (non-bare behavior)
    return true
  }
}

/**
 * Gets the file system path for a ref's reflog file.
 * 
 * @param gitdir - Path to .git directory
 * @param ref - Reference name
 * @returns Path to reflog file
 */
function getReflogPath(gitdir: string, ref: string): string {
  return join(gitdir, 'logs', ref)
}

/**
 * Formats a reflog entry line
 * 
 * Format: `<oldOid> <newOid> <author> <timestamp> <timezoneOffset>\t<message>\n`
 * 
 * @param oldOid - Previous OID (40-char hex)
 * @param newOid - New OID (40-char hex)
 * @param author - Author string (e.g., 'Name <email>')
 * @param timestamp - Unix timestamp in seconds
 * @param timezoneOffset - Timezone offset in +HHMM or -HHMM format
 * @param message - Reflog message
 * @returns Formatted reflog entry line
 */
function formatReflogEntry(
  oldOid: string,
  newOid: string,
  author: string,
  timestamp: number,
  timezoneOffset: string,
  message: string
): string {
  return `${oldOid} ${newOid} ${author} ${timestamp} ${timezoneOffset}\t${message}\n`
}

/**
 * Logs a ref update to the reflog if enabled.
 * 
 * This is the **primary API** for creating reflog entries. It checks the
 * `core.logAllRefUpdates` config setting and, if enabled, appends a reflog
 * entry for the ref update.
 * 
 * **Behavior**:
 * - Checks `core.logAllRefUpdates` config (defaults to `true` for non-bare repos)
 * - Returns early if reflog is disabled
 * - Returns early if `oldOid === newOid` (no actual change)
 * - Generates author, timestamp, and timezone if not provided
 * - Appends entry to reflog file (`.git/logs/<ref>`)
 * - Silently ignores errors (Git's behavior)
 * 
 * **Usage**:
 * ```typescript
 * await logRefUpdate({
 *   fs,
 *   gitdir,
 *   ref: 'refs/heads/main',
 *   oldOid: previousOid,
 *   newOid: newOid,
 *   message: 'commit: My commit message',
 * })
 * ```
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param ref - Reference name (e.g., 'refs/heads/main', 'HEAD', 'refs/remotes/origin/main')
 * @param oldOid - Previous OID (40-char hex). Use zero OID for new refs
 * @param newOid - New OID (40-char hex). Use zero OID for deletions
 * @param message - Descriptive reflog message (e.g., 'commit: My commit', 'reset: moving to HEAD~1')
 * @param author - Optional author string in format 'Name <email>'. Defaults to 'isomorphic-git <noreply@isomorphic-git.org>'
 * @param timestamp - Optional Unix timestamp in seconds. Defaults to `Math.floor(Date.now() / 1000)`
 * @param timezoneOffset - Optional timezone offset in format '+HHMM' or '-HHMM'. Defaults to current system timezone
 * @param systemConfigPath - Optional path to system Git config file
 * @param globalConfigPath - Optional path to global Git config file
 * 
 * @example
 * ```typescript
 * await logRefUpdate({
 *   fs,
 *   gitdir,
 *   ref: 'refs/heads/main',
 *   oldOid: '0000000000000000000000000000000000000000',
 *   newOid: 'abc123def4567890123456789012345678901234',
 *   message: 'commit: Initial commit',
 * })
 * ```
 */
export async function logRefUpdate({
  fs,
  gitdir,
  ref,
  oldOid,
  newOid,
  message,
  author,
  timestamp,
  timezoneOffset,
  systemConfigPath,
  globalConfigPath,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  oldOid: string
  newOid: string
  message: string
  author?: string
  timestamp?: number
  timezoneOffset?: string
  systemConfigPath?: string
  globalConfigPath?: string
}): Promise<void> {
  try {
    // Normalize filesystem client
    const normalizedFs = createFileSystem(fs)
    
    // Get correct gitdir for config check (main gitdir for worktrees)
    let configGitdir = gitdir
    try {
      const { isWorktreeGitdir, getMainGitdir } = await import('../refs/worktreeRefs.ts')
      if (isWorktreeGitdir(gitdir)) {
        configGitdir = await getMainGitdir({ fs: normalizedFs, worktreeGitdir: gitdir })
      }
    } catch {
      // If worktreeRefs module isn't available, use provided gitdir
    }
    
    // Check if reflog is enabled
    const enabled = await isReflogEnabled({
      fs: normalizedFs,
      gitdir: configGitdir,
      systemConfigPath,
      globalConfigPath,
    })

    if (!enabled) {
      return
    }

    // Return early if oldOid and newOid are the same (no change)
    if (oldOid === newOid) {
      return
    }

    // Generate defaults
    const defaultAuthor = author || 'isomorphic-git <noreply@isomorphic-git.org>'
    const defaultTimestamp = timestamp ?? Math.floor(Date.now() / 1000)
    const defaultTimezoneOffset =
      timezoneOffset ?? formatTimezoneOffset(new Date().getTimezoneOffset())

    // Format reflog entry
    const entry = formatReflogEntry(
      oldOid,
      newOid,
      defaultAuthor,
      defaultTimestamp,
      defaultTimezoneOffset,
      message
    )

    // Get correct gitdir for reflog (main gitdir for branch refs in worktrees)
    // NOTE: For test consistency, we use the gitdir as-is if it's explicitly provided
    // The worktree logic should only apply when gitdir is auto-detected
    let effectiveGitdir = gitdir
    if (ref !== 'HEAD' && ref !== 'refs/HEAD') {
      // For non-HEAD refs, check if we're in a worktree
      // Only apply worktree logic if gitdir looks like a worktree gitdir
      try {
        const { isWorktreeGitdir, getMainGitdir } = await import('../refs/worktreeRefs.ts')
        if (isWorktreeGitdir(gitdir)) {
          effectiveGitdir = await getMainGitdir({ fs, worktreeGitdir: gitdir })
        }
      } catch {
        // If worktreeRefs module isn't available, use provided gitdir
      }
    }
    
    // Get reflog file path
    const reflogPath = getReflogPath(effectiveGitdir, ref)

    // Ensure the logs directory exists first
    const logsDir = join(effectiveGitdir, 'logs')
    try {
      await normalizedFs.mkdir(logsDir, { recursive: true })
    } catch {
      // Directory might already exist, ignore
    }

    // Create parent directories if needed (for nested refs like refs/heads/main)
    const parentDir = dirname(reflogPath)
    try {
      await normalizedFs.mkdir(parentDir, { recursive: true })
    } catch {
      // Directory might already exist, ignore
    }

    // Append to reflog file (or create if doesn't exist)
    try {
      // Try to read existing content
      const existing = await normalizedFs.read(reflogPath)
      const existingContent = UniversalBuffer.isBuffer(existing)
        ? existing.toString('utf8')
        : typeof existing === 'string'
        ? existing
        : existing !== null && existing !== undefined
        ? new TextDecoder().decode(existing)
        : ''

      // Append new entry
      const newContent = existingContent + entry
      await normalizedFs.write(reflogPath, newContent)
    } catch {
      // File doesn't exist, create it with the new entry
      await normalizedFs.write(reflogPath, entry)
    }
  } catch {
    // Silently ignore all errors (Git's behavior)
    // Reflog is a convenience feature, not critical to the operation
  }
}

