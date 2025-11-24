import { StreamReader } from "../../utils/StreamReader.ts"
import { padHex } from "../../utils/padHex.ts"
import { UniversalBuffer } from "../../utils/UniversalBuffer.ts"

/**
 * pkt-line Format
 *
 * A pkt-line is a variable length binary string. The first four bytes
 * of the line, the pkt-len, indicates the total length of the line,
 * in hexadecimal. The pkt-len includes the 4 bytes used to contain
 * the length's hexadecimal representation.
 *
 * A pkt-line MAY contain binary data, so implementers MUST ensure
 * pkt-line parsing/formatting routines are 8-bit clean.
 *
 * A non-binary line SHOULD BE terminated by an LF, which if present
 * MUST be included in the total length. Receivers MUST treat pkt-lines
 * with non-binary data the same whether or not they contain the trailing
 * LF (stripping the LF if present, and not complaining when it is
 * missing).
 *
 * The maximum length of a pkt-line's data component is 65516 bytes.
 * Implementations MUST NOT send pkt-line whose length exceeds 65520
 * (65516 bytes of payload + 4 bytes of length data).
 *
 * Implementations SHOULD NOT send an empty pkt-line ("0004").
 *
 * A pkt-line with a length field of 0 ("0000"), called a flush-pkt,
 * is a special case and MUST be handled differently than an empty
 * pkt-line ("0004").
 */

/**
 * Encodes a payload into a pkt-line
 */
export const encode = (payload: UniversalBuffer | string | Uint8Array): UniversalBuffer => {
  let buffer: UniversalBuffer
  if (typeof payload === 'string') {
    buffer = UniversalBuffer.from(payload)
  } else if (!UniversalBuffer.isBuffer(payload)) {
    buffer = UniversalBuffer.from(payload)
  } else {
    buffer = payload
  }
  const length = buffer.length + 4
  const hexlength = padHex(4, length)
  return UniversalBuffer.concat([UniversalBuffer.from(hexlength, 'utf8'), buffer])
}

/**
 * Returns a flush-pkt (0000)
 */
export const flush = (): UniversalBuffer => {
  return UniversalBuffer.from('0000', 'utf8')
}

/**
 * Returns a delim-pkt (0001)
 */
export const delim = (): UniversalBuffer => {
  return UniversalBuffer.from('0001', 'utf8')
}

/**
 * Creates a decoder function for a stream
 */
export const decodeStream = (stream: AsyncIterable<UniversalBuffer> | ReadableStream): (() => Promise<UniversalBuffer | null | true>) => {
  const reader = new StreamReader(stream)
  return async function read(): Promise<UniversalBuffer | null | true> {
    try {
      const lengthBuffer = await reader.read(4)
      if (lengthBuffer == null) return true // EOF
      const length = parseInt(lengthBuffer.toString('utf8'), 16)
      if (length === 0) return null // flush-pkt
      if (length === 1) return null // delim-pkt
      const buffer = await reader.read(length - 4)
      if (buffer == null) return true // EOF
      return buffer
    } catch (err) {
      // Check if stream has an error property (for error handling)
      const streamWithError = stream as { error?: unknown }
      if ('error' in streamWithError) {
        streamWithError.error = err
      }
      return true // Error
    }
  }
}

