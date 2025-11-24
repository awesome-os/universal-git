import type { Author } from './GitCommit.ts'

export class GitRefStash {
  // constructor removed

  static get timezoneOffsetForRefLogEntry(): string {
    const offsetMinutes = new Date().getTimezoneOffset()
    const offsetHours = Math.abs(Math.floor(offsetMinutes / 60))
    const offsetMinutesFormatted = Math.abs(offsetMinutes % 60)
      .toString()
      .padStart(2, '0')
    const sign = offsetMinutes > 0 ? '-' : '+'
    return `${sign}${offsetHours
      .toString()
      .padStart(2, '0')}${offsetMinutesFormatted}`
  }

  static createStashReflogEntry(
    author: Author,
    stashCommit: string,
    message: string
  ): string {
    const nameNoSpace = author.name.replace(/\s/g, '')
    const z40 = '0000000000000000000000000000000000000000' // hard code for now, works with `git stash list`
    const timestamp = Math.floor(Date.now() / 1000)
    const timezoneOffset = GitRefStash.timezoneOffsetForRefLogEntry
    return `${z40} ${stashCommit} ${nameNoSpace} ${author.email} ${timestamp} ${timezoneOffset}\t${message}\n`
  }

  static getStashReflogEntry(
    reflogString: string,
    parsed = false
  ): string[] | Array<Record<string, unknown>> {
    // Split by newlines and filter out empty lines
    const reflogLines = reflogString.split('\n').filter(l => l.trim())
    
    // If no valid lines, return empty array
    if (reflogLines.length === 0) {
      return []
    }
    
    // Filter out invalid reflog lines - valid format: "oldoid newoid name email timestamp timezone\tmessage"
    // A valid line should have at least 6 space-separated fields before the tab (if present)
    const validLines = reflogLines.filter(line => {
      // Check if line has the basic structure of a reflog entry
      // Should have at least: oldoid (40 chars) + space + newoid (40 chars) + space + name + ...
      const tabIndex = line.indexOf('\t')
      const beforeTab = tabIndex >= 0 ? line.substring(0, tabIndex) : line
      const parts = beforeTab.trim().split(/\s+/)
      // Should have at least 6 parts: oldoid, newoid, name, email, timestamp, timezone
      // And oldoid/newoid should be 40 characters (SHA-1) or 64 characters (SHA-256)
      if (parts.length >= 6) {
        const oldoid = parts[0]
        const newoid = parts[1]
        // Check if OIDs look valid (40 or 64 hex characters)
        const isValidOid = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(oldoid) && /^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(newoid)
        return isValidOid
      }
      return false
    })
    
    // If no valid lines after filtering, return empty array
    if (validLines.length === 0) {
      return []
    }
    
    // Reflog entries are stored newest-first in the file, so no need to reverse
    // Map entries with index (stash@{0} is most recent, which is the first line)
    // Filter out any duplicate entries (same commit OID) to ensure we only count unique stashes
    const seenCommits = new Set<string>()
    const uniqueLines = validLines.filter(line => {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        const commitOid = parts[1] // newoid is the stash commit OID
        if (seenCommits.has(commitOid)) {
          return false // Duplicate commit, skip it
        }
        seenCommits.add(commitOid)
        return true
      }
      return false
    })
    
    const entries = uniqueLines
      .map((line, idx) => {
        if (parsed) {
          // Parse the reflog line format: "oldoid newoid name email timestamp timezone\tmessage"
          const parts = line.split('\t')
          const message = parts.length > 1 ? parts[1] : ''
          return `stash@{${idx}}: ${message}`
        }
        return line
      })
    return entries as string[] | Array<Record<string, unknown>>
  }
}

