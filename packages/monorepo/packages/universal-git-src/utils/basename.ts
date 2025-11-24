export const basename = (path: string): string => {
  const last = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (last > -1) {
    return path.slice(last + 1)
  }
  return path
}

