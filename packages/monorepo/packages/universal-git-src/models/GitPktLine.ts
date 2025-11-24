/**
pkt-line Format
---------------

Much (but not all) of the payload is described around pkt-lines.

A pkt-line is a variable length binary string.  The first four bytes
of the line, the pkt-len, indicates the total length of the line,
in hexadecimal.  The pkt-len includes the 4 bytes used to contain
the length's hexadecimal representation.

A pkt-line MAY contain binary data, so implementers MUST ensure
pkt-line parsing/formatting routines are 8-bit clean.

A non-binary line SHOULD BE terminated by an LF, which if present
MUST be included in the total length. Receivers MUST treat pkt-lines
with non-binary data the same whether or not they contain the trailing
LF (stripping the LF if present, and not complaining when it is
missing).

The maximum length of a pkt-line's data component is 65516 bytes.
Implementations MUST NOT send pkt-line whose length exceeds 65520
(65516 bytes of payload + 4 bytes of length data).

Implementations SHOULD NOT send an empty pkt-line ("0004").

A pkt-line with a length field of 0 ("0000"), called a flush-pkt,
is a special case and MUST be handled differently than an empty
pkt-line ("0004").

----
  pkt-line     =  data-pkt / flush-pkt

  data-pkt     =  pkt-len pkt-payload
  pkt-len      =  4*(HEXDIG)
  pkt-payload  =  (pkt-len - 4)*(OCTET)

  flush-pkt    = "0000"
----

Examples (as C-style strings):

----
  pkt-line          actual value
  ---------------------------------
  "0006a\n"         "a\n"
  "0005a"           "a"
  "000bfoobar\n"    "foobar\n"
  "0004"            ""
----
*/
import { StreamReader } from "../utils/StreamReader.ts"
import { padHex } from "../utils/padHex.ts"
import { UniversalBuffer } from "../utils/UniversalBuffer.ts"

const PKT_DEBUG_ENABLED =
  process.env.UNIVERSAL_GIT_DEBUG_PKT_LINE === '1' ||
  process.env.ISOGIT_DEBUG_PKT_LINE === '1' ||
  process.env.ISO_GIT_DEBUG_PKT_LINE === '1'

const debugPkt = (message: string, extra?: Record<string, unknown>): void => {
  if (!PKT_DEBUG_ENABLED) return
  if (extra) {
    console.log(`[Git PktLine] ${message}`, extra)
  } else {
    console.log(`[Git PktLine] ${message}`)
  }
}

// I'm really using this more as a namespace.
// There's not a lot of "state" in a pkt-line

export class GitPktLine {
  static flush(): UniversalBuffer {
    return UniversalBuffer.from('0000', 'utf8')
  }

  static delim(): UniversalBuffer {
    return UniversalBuffer.from('0001', 'utf8')
  }

  static encode(line: string | UniversalBuffer | Uint8Array): UniversalBuffer {
    if (typeof line === 'string') {
      line = UniversalBuffer.from(line)
    } else if (line instanceof Uint8Array && !(line instanceof UniversalBuffer)) {
      line = UniversalBuffer.from(line)
    }
    const length = line.length + 4
    const hexlength = padHex(4, length)
    return UniversalBuffer.concat([UniversalBuffer.from(hexlength, 'utf8'), line])
  }

  static streamReader(stream: AsyncIterableIterator<Uint8Array>): () => Promise<UniversalBuffer | null | true> {
    const reader = new StreamReader(stream)
    return async function read(): Promise<UniversalBuffer | null | true> {
      try {
        const lengthBuffer = await reader.read(4)
        if (lengthBuffer == null) {
          debugPkt('StreamReader returned null length buffer (EOF)')
          return true
        }
        const length = parseInt(lengthBuffer.toString('utf8'), 16)
        debugPkt('Parsed pkt-line length', { length })
        if (length === 0) return null
        if (length === 1) return null // delim packets
        const buffer = await reader.read(length - 4)
        if (buffer == null) {
          debugPkt('StreamReader returned null payload buffer (EOF mid-packet)', {
            expected: length - 4,
          })
          return true
        }
        debugPkt('Read pkt-line payload', { payloadBytes: UniversalBuffer.length })
        return buffer
      } catch (err) {
        ;(stream as any).error = err
        debugPkt('Pkt-line reader caught error', {
          message: err instanceof Error ? err.message : String(err),
        })
        return true
      }
    }
  }
}

