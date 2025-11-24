export const outdent = (str: string): string => {
  return str
    .split('\n')
    .map(x => x.replace(/^ /, ''))
    .join('\n')
}

