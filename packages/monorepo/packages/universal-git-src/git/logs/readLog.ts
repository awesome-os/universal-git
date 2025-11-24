import { join } from '../../core-utils/GitPath.ts'
import type { FileSystemProvider } from '../../models/FileSystem.ts'
import { UniversalBuffer } from '../../utils/UniversalBuffer.ts'

/**
 * Reflog entry type
 */
export type ReflogEntry = {
  oldOid: string
  newOid: string
  author: string
  timestamp: number
  timezoneOffset: string
  message: string
}

/**
 * Gets the file system path for a ref's reflog file.
 * 
 * **Path Format**: `.git/logs/<ref>`
 * 
 * **Examples**:
 * - `HEAD` → `.git/logs/HEAD`
 * - `refs/heads/main` → `.git/logs/refs/heads/main`
 * - `refs/remotes/origin/main` → `.git/logs/refs/remotes/origin/main`
 * 
 * @param gitdir - Path to .git directory
 * @param ref - Reference name (can be short form like 'HEAD' or full path like 'refs/heads/main')
 * @returns Absolute path to reflog file
 * 
 * @example
 * ```typescript
 * const path = getReflogPath('.git', 'refs/heads/main')
 * // Returns: '.git/logs/refs/heads/main'
 * ```
 */
export function getReflogPath(gitdir: string, ref: string): string {
  return join(gitdir, 'logs', ref)
}

/**
 * Parses a single reflog entry line into a `ReflogEntry` object.
 * 
 * **Format**: `<old-oid> <new-oid> <author> <timestamp> <timezone-offset> <message>`
 * 
 * **Example**:
 * ```
 * 0000000000000000000000000000000000000000 abc123def4567890123456789012345678901234 John Doe <john@example.com> 1262356920 -0500 commit: Initial commit
 * ```
 * 
 * **Behavior**:
 * - Validates OID format (40-char hex strings for SHA-1, 64-char for SHA-256)
 * - Converts invalid OIDs to zero OID
 * - Handles various author formats (with/without email, angle brackets)
 * - Returns `null` for malformed or empty lines
 * 
 * @param line - Raw reflog entry line (single line from reflog file)
 * @returns Parsed `ReflogEntry` object or `null` if line is invalid
 * 
 * @example
 * ```typescript
 * const entry = parseReflogEntry(
 *   '0000000... abc123... John Doe <john@example.com> 1262356920 -0500 commit: Initial commit'
 * )
 * // Returns: {
 * //   oldOid: '0000000...',
 * //   newOid: 'abc123...',
 * //   author: 'John Doe <john@example.com>',
 * //   timestamp: 1262356920,
 * //   timezoneOffset: '-0500',
 * //   message: 'commit: Initial commit'
 * // }
 * ```
 */
export function parseReflogEntry(line: string): ReflogEntry | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  // Find the tab separator (message comes after tab)
  const tabIndex = trimmed.indexOf('\t')
  const beforeTab = tabIndex >= 0 ? trimmed.substring(0, tabIndex) : trimmed
  const message = tabIndex >= 0 ? trimmed.substring(tabIndex + 1) : ''

  // Split the part before tab into space-separated fields
  const parts = beforeTab.trim().split(/\s+/)
  
  // Need at least: oldOid, newOid, author (may contain spaces), timestamp, timezoneOffset
  // Minimum 5 parts, but author can contain spaces, so we need to be smart about parsing
  if (parts.length < 5) {
    return null
  }

  const oldOid = parts[0]
  const newOid = parts[1]

  // Validate OIDs (40 chars for SHA-1, 64 for SHA-256)
  const oidPattern = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i
  if (!oidPattern.test(oldOid) || !oidPattern.test(newOid)) {
    return null
  }

  // Timestamp and timezone are the last two parts
  const timestampStr = parts[parts.length - 2]
  const timezoneOffset = parts[parts.length - 1]

  // Validate timestamp (should be numeric)
  const timestamp = parseInt(timestampStr, 10)
  if (isNaN(timestamp)) {
    return null
  }

  // Validate timezone offset format (+HHMM or -HHMM)
  if (!/^[+-]\d{4}$/.test(timezoneOffset)) {
    return null
  }

  // Author is everything between index 2 and timestampIndex
  // Join with spaces in case author name contains spaces
  const authorParts = parts.slice(2, parts.length - 2)
  const author = authorParts.join(' ')

  return {
    oldOid,
    newOid,
    author,
    timestamp,
    timezoneOffset,
    message,
  }
}

/**
 * Reads reflog entries for a ref.
 * 
 * **Behavior**:
 * - Reads reflog file from `.git/logs/<ref>`
 * - Returns empty array if reflog doesn't exist
 * - Returns entries in **chronological order** (oldest first)
 * - Use `.reverse()` to get newest first (matching Git's `HEAD@{0}` syntax)
 * 
 * **Parsed vs Raw**:
 * - `parsed: false` (default): Returns array of strings (raw reflog lines)
 * - `parsed: true`: Returns array of `ReflogEntry` objects
 * 
 * @param fs - File system client
 * @param gitdir - Path to .git directory
 * @param ref - Reference name (e.g., 'HEAD', 'refs/heads/main')
 * @param parsed - If `true`, returns parsed `ReflogEntry` objects. If `false`, returns raw strings
 * @returns Array of reflog entries (strings or `ReflogEntry` objects, depending on `parsed` parameter)
 * 
 * @throws Never throws - returns empty array if reflog doesn't exist
 * 
 * @example
 * ```typescript
 * // Read as raw strings
 * const entries = await readLog({ fs, gitdir, ref: 'refs/heads/main' })
 * // Returns: ['0000000... abc123... author 123 -0500 message', ...]
 * 
 * // Read as parsed objects
 * const entries = await readLog({ 
 *   fs, 
 *   gitdir, 
 *   ref: 'refs/heads/main', 
 *   parsed: true 
 * }) as ReflogEntry[]
 * // Returns: [{ oldOid: '...', newOid: '...', author: '...', ... }, ...]
 * ```
 */
export async function readLog({
  fs,
  gitdir,
  ref,
  parsed = false,
}: {
  fs: FileSystemProvider
  gitdir: string
  ref: string
  parsed?: boolean
}): Promise<string[] | ReflogEntry[]> {
  // Get correct gitdir for reflog (main gitdir for branch refs in worktrees)
  // This must match the logic in logRefUpdate to ensure consistency
  // NOTE: For test consistency, we use the gitdir as-is if it's explicitly provided
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
  
  const reflogPath = getReflogPath(effectiveGitdir, ref)

  try {
    const buffer = await fs.read(reflogPath)
    if (!buffer) {
      return []
    }
    const content = UniversalBuffer.isBuffer(buffer)
      ? buffer.toString('utf8')
      : typeof buffer === 'string'
      ? buffer
      : new TextDecoder().decode(buffer)

    // Split by newlines and filter out empty lines
    const lines = content.split('\n').filter((line) => line.trim())

    if (parsed) {
      // Parse each line and filter out null entries
      const entries: ReflogEntry[] = []
      for (const line of lines) {
        const entry = parseReflogEntry(line)
        if (entry) {
          entries.push(entry)
        }
      }
      return entries
    } else {
      // Return raw lines
      return lines
    }
  } catch {
    // Reflog doesn't exist - return empty array (Git's behavior)
    return []
  }
}

