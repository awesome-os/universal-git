import { compareStrings } from './compareStrings.ts'

export const comparePath = (a: { path: string }, b: { path: string }): number => {
  // https://stackoverflow.com/a/40355107/2168416
  return compareStrings(a.path, b.path)
}

