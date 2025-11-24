import { MissingParameterError } from '../errors/MissingParameterError.ts'

export const assertParameter = (name: string, value: unknown): void => {
  if (value === undefined) {
    throw new MissingParameterError(name)
  }
}

