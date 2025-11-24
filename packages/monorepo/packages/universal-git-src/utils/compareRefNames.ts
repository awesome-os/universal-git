export function compareRefNames(a: string, b: string): number {
  // https://stackoverflow.com/a/40355107/2168416
  const _a = a.replace(/\^\{\}$/, '')
  const _b = b.replace(/\^\{\}$/, '')
  const tmp = -(_a < _b ? 1 : 0) || +(_a > _b ? 1 : 0)
  if (tmp === 0) {
    return a.endsWith('^{}') ? 1 : -1
  }
  return tmp
}

