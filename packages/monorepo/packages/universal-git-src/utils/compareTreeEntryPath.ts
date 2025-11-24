import { compareStrings } from './compareStrings.ts'
import type { TreeEntry } from "../models/GitTree.ts"

export const compareTreeEntryPath = (a: TreeEntry, b: TreeEntry): number => {
  // Git sorts tree entries as if there is a trailing slash on directory names.
  return compareStrings(appendSlashIfDir(a), appendSlashIfDir(b))
}

const appendSlashIfDir = (entry: TreeEntry): string => {
  return entry.mode === '040000' ? entry.path + '/' : entry.path
}

