/* eslint-env node, browser */
/* global CompressionStream */
import pako from 'pako'
import { UniversalBuffer } from './UniversalBuffer.ts'

let supportsCompressionStream: boolean | null = null

export async function deflate(buffer: UniversalBuffer | Uint8Array): Promise<Uint8Array> {
  if (supportsCompressionStream === null) {
    supportsCompressionStream = testCompressionStream()
  }
  return supportsCompressionStream
    ? browserDeflate(buffer)
    : pako.deflate(buffer)
}

async function browserDeflate(buffer: UniversalBuffer | Uint8Array): Promise<Uint8Array> {
  const cs = new (globalThis as any).CompressionStream('deflate')
  let bufferArray: Uint8Array
  if (buffer instanceof Uint8Array) {
    bufferArray = buffer
  } else {
    const buf = buffer as UniversalBuffer
    bufferArray = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  const c = new Blob([bufferArray as any]).stream().pipeThrough(cs)
  return new Uint8Array(await new Response(c).arrayBuffer())
}

function testCompressionStream(): boolean {
  try {
    const cs = new (globalThis as any).CompressionStream('deflate')
    cs.writable.close()
    // Test if `Blob.stream` is present. React Native does not have the `stream` method
    const stream = new Blob([]).stream()
    stream.cancel()
    return true
  } catch (_) {
    return false
  }
}

