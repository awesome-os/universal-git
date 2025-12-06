export const normalizeNewlines = (str: string): string => {
  // remove all <CR>
  let normalized = str.replace(/\r/g, '')
  // no extra newlines up front
  normalized = normalized.replace(/^\n+/, '')
  // and a single newline at the end
  normalized = normalized.replace(/\n+$/, '') + '\n'
  return normalized
}

