/**
 * Unified comparison utilities
 * Reduces redundancy across compare functions
 */

/**
 * Generic string comparison
 */
export const compareStrings = (a: string, b: string): number => {
  // https://stackoverflow.com/a/40355107/2168416
  return -(a < b) || +(a > b)
}

/**
 * Compare ref names (handles ^{} suffix)
 */
export const compareRefNames = (a: string, b: string): number => {
  const _a = a.replace(/\^\{\}$/, '')
  const _b = b.replace(/\^\{\}$/, '')
  const tmp = compareStrings(_a, _b)
  if (tmp === 0) {
    return a.endsWith('^{}') ? 1 : -1
  }
  return tmp
}

/**
 * Compare paths (delegates to compareStrings)
 */
export const comparePath = (a: { path: string }, b: { path: string }): number => {
  return compareStrings(a.path, b.path)
}

/**
 * Compare tree entry paths (handles directory trailing slashes)
 */
export const compareTreeEntryPath = (a: { path: string; mode: string }, b: { path: string; mode: string }): number => {
  const appendSlashIfDir = (entry: { path: string; mode: string }): string => {
    return entry.mode === '040000' ? entry.path + '/' : entry.path
  }
  return compareStrings(appendSlashIfDir(a), appendSlashIfDir(b))
}

/**
 * Compare commit ages by timestamp
 */
export const compareAge = (a: { committer: { timestamp: number } }, b: { committer: { timestamp: number } }): number => {
  return a.committer.timestamp - b.committer.timestamp
}

