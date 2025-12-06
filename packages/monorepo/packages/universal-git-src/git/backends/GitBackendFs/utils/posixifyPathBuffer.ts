import { UniversalBuffer } from './UniversalBuffer.ts'

export function posixifyPathBuffer(buffer: UniversalBuffer | Uint8Array): UniversalBuffer | Uint8Array {
  const bufferArray = buffer instanceof Uint8Array ? new Uint8Array(buffer) : UniversalBuffer.from(buffer)
  let idx: number
  while (~(idx = bufferArray.indexOf(92))) {
    bufferArray[idx] = 47
  }
  return bufferArray
}

