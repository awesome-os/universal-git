export class BaseError extends Error {
  code: string = ''
  data: Record<string, unknown> = {}
  caller: string = ''
  cause?: Error

  constructor(message: string, cause?: Error) {
    super(message, { cause })
    // Setting this here allows TS to infer that all git errors have a `caller` property and
    // that its type is string.
    this.caller = ''
    this.cause = cause
  }

  toJSON(): {
    code: string
    data: Record<string, unknown>
    caller: string
    message: string
    stack?: string
    cause?: {
      message: string
      stack?: string
      name: string
    }
  } {
    // Error objects aren't normally serializable. So we do something about that.
    const result: {
      code: string
      data: Record<string, unknown>
      caller: string
      message: string
      stack?: string
      cause?: {
        message: string
        stack?: string
        name: string
      }
    } = {
      code: this.code,
      data: this.data,
      caller: this.caller,
      message: this.message,
      stack: this.stack,
    }
    if (this.cause) {
      result.cause = {
        message: this.cause.message,
        stack: this.cause.stack,
        name: this.cause.name,
      }
    }
    return result
  }

  fromJSON(json: {
    code: string
    data: Record<string, unknown>
    caller: string
    message: string
    stack?: string
    cause?: {
      message: string
      stack?: string
      name: string
    }
  }): BaseError {
    const cause = json.cause ? new Error(json.cause.message) : undefined
    if (cause && json.cause) {
      cause.name = json.cause.name
      cause.stack = json.cause.stack
    }
    const e = new BaseError(json.message, cause)
    e.code = json.code
    e.data = json.data
    e.caller = json.caller
    e.stack = json.stack
    return e
  }

  get isIsomorphicGitError(): boolean {
    return true
  }
}

