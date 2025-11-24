import { BaseError } from './BaseError.ts'

export class NoRefspecError extends BaseError {
  static readonly code = 'NoRefspecError' as const

  constructor(remote: string, cause?: Error) {
    super(
      `Could not find a fetch refspec for remote "${remote}". Make sure the config file has an entry like the following:
[remote "${remote}"]
\tfetch = +refs/heads/*:refs/remotes/origin/*
`,
      cause
    )
    this.code = this.name = NoRefspecError.code
    this.data = { remote }
  }
}

