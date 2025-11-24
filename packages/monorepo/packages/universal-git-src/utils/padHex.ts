export const padHex = (b: number, n: number): string => {
  const s = n.toString(16)
  return '0'.repeat(b - s.length) + s
}

