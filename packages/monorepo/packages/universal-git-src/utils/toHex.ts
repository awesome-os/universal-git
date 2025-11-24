import { UniversalBuffer } from './UniversalBuffer.ts'

export const toHex = (buffer: UniversalBuffer | Uint8Array | ArrayBuffer): string => {
  const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer)
  let hex = ''
  for (const byte of uint8Array) {
    if (byte < 16) hex += '0'
    hex += byte.toString(16)
  }
  return hex
}

