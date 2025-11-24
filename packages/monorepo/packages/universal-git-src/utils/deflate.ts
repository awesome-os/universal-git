/* eslint-env node, browser */
import { deflate as pakoDeflate } from './pako-stream.ts'
import { UniversalBuffer } from './UniversalBuffer.ts'

export async function deflate(buffer: UniversalBuffer | Uint8Array): Promise<Uint8Array> {
  return pakoDeflate(buffer)
}

