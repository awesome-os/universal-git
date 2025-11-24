import { GitObject } from "../models/GitObject.ts"
import { shasum } from './shasum.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'

export const hashObject = async ({
  gitdir,
  type,
  object,
}: {
  gitdir?: string
  type: string
  object: UniversalBuffer | Uint8Array
}): Promise<string> => {
  return shasum(GitObject.wrap({ type, object }))
}

