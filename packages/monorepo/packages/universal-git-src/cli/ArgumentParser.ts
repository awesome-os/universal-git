/**
 * Parses command-line arguments into structured format
 */
export class ArgumentParser {
  /**
   * Parses arguments array
   */
  static parse(args: string[]): {
    command: string | null
    flags: Record<string, unknown>
    positional: string[]
  } {
    if (args.length === 0) {
      return { command: null, flags: {}, positional: [] }
    }

    const command = args[0]
    const flags: Record<string, unknown> = {}
    const positional: string[] = []
    let i = 1

    while (i < args.length) {
      const arg = args[i]

      // Check for flags
      if (arg.startsWith('--')) {
        // Long flag: --flag or --flag=value
        const flagMatch = arg.match(/^--([^=]+)(?:=(.+))?$/)
        if (flagMatch) {
          const [, flagName, value] = flagMatch
          const normalizedName = this._normalizeFlagName(flagName)
          if (value !== undefined) {
            flags[normalizedName] = this._parseValue(value)
          } else {
            // Boolean flag
            flags[normalizedName] = true
          }
        }
        i++
      } else if (arg.startsWith('-')) {
        // Short flags: -a, -abc, or -f value
        const shortFlags = arg.slice(1)
        if (shortFlags.length === 1) {
          // Single flag, might have value
          const flagName = shortFlags
          if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            // Next arg is the value
            flags[flagName] = this._parseValue(args[i + 1])
            i += 2
          } else {
            // Boolean flag
            flags[flagName] = true
            i++
          }
        } else {
          // Multiple flags: -abc
          for (const flag of shortFlags) {
            flags[flag] = true
          }
          i++
        }
      } else {
        // Positional argument
        positional.push(arg)
        i++
      }
    }

    return { command, flags, positional }
  }

  /**
   * Normalizes flag names (kebab-case to camelCase)
   * @private
   */
  private static _normalizeFlagName(name: string): string {
    return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  }

  /**
   * Parses a value (handles booleans, numbers, etc.)
   * @private
   */
  private static _parseValue(value: string): unknown {
    // Try to parse as number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10)
    }
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value)
    }
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
    // Return as string
    return value
  }

  /**
   * Validates required flags
   */
  static validateRequired(flags: Record<string, unknown>, required: string[]): void {
    const missing = required.filter(flag => flags[flag] === undefined)
    if (missing.length > 0) {
      throw new Error(`Missing required flags: ${missing.join(', ')}`)
    }
  }

  /**
   * Validates required positional arguments
   */
  static validatePositional(positional: string[], minCount: number): void {
    if (positional.length < minCount) {
      throw new Error(`Expected at least ${minCount} positional arguments, got ${positional.length}`)
    }
  }
}

