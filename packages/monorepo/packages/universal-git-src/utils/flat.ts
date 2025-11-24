// TODO: Should I just polyfill Array.flat?
export const flat =
  typeof Array.prototype.flat === 'undefined'
    ? <T>(entries: T[][]): T[] => entries.reduce((acc, x) => acc.concat(x), [])
    : <T>(entries: T[][]): T[] => entries.flat()

