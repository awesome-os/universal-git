import { BaseError } from './BaseError.ts'

export class AmbiguousError extends BaseError {
  static readonly code = 'AmbiguousError' as const

  constructor(
    nouns: 'oids' | 'refs',
    short: string,
    matches: string[],
    cause?: Error
  ) {
    super(
      `Found multiple ${nouns} matching "${short}" (${matches.join(
        ', '
      )}). Use a longer abbreviation length to disambiguate them.`,
      cause
    )
    this.code = this.name = AmbiguousError.code
    this.data = { nouns, short, matches }
  }
}

