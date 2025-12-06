// Like Object.assign but ignore properties with undefined values
// ref: https://stackoverflow.com/q/39513815
export const assignDefined = <T extends Record<string, unknown>>(
  target: T,
  ...sources: Array<Partial<T> | undefined | null>
): T => {
  for (const source of sources) {
    if (source) {
      for (const key of Object.keys(source)) {
        const val = source[key]
        if (val !== undefined) {
          (target as any)[key] = val
        }
      }
    }
  }
  return target
}

