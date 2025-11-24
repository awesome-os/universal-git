/**
 * @param {Map} map
 */
export function fromEntries(map: Map<string, string>): Record<string, string> {
  const o: Record<string, string> = {}
  for (const [key, value] of map) {
    o[key] = value
  }
  return o
}

