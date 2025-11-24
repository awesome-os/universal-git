/*
If 'side-band' or 'side-band-64k' capabilities have been specified by
the client, the server will send the packfile data multiplexed.

Each packet starting with the packet-line length of the amount of data
that follows, followed by a single byte specifying the sideband the
following data is coming in on.

In 'side-band' mode, it will send up to 999 data bytes plus 1 control
code, for a total of up to 1000 bytes in a pkt-line.  In 'side-band-64k'
mode it will send up to 65519 data bytes plus 1 control code, for a
total of up to 65520 bytes in a pkt-line.

The sideband byte will be a '1', '2' or a '3'. Sideband '1' will contain
packfile data, sideband '2' will be used for progress information that the
client will generally print to stderr and sideband '3' is used for error
information.

If no 'side-band' capability was specified, the server will stream the
entire packfile without multiplexing.
*/
import { FIFO } from "../utils/FIFO.ts"

import { GitPktLine } from './GitPktLine.ts'

const SIDE_BAND_DEBUG_ENABLED =
  process.env.UNIVERSAL_GIT_DEBUG_SIDE_BAND === '1' ||
  process.env.ISOGIT_DEBUG_SIDE_BAND === '1' ||
  process.env.ISO_GIT_DEBUG_SIDE_BAND === '1'

const debugSideBand = (message: string, extra?: Record<string, unknown>): void => {
  if (!SIDE_BAND_DEBUG_ENABLED) return
  if (extra) {
    console.log(`[Git SideBand] ${message}`, extra)
  } else {
    console.log(`[Git SideBand] ${message}`)
  }
}

export class GitSideBand {
  static demux(input: AsyncIterableIterator<Uint8Array>): {
    packetlines: FIFO
    packfile: FIFO
    progress: FIFO
    finished: Promise<void>
  } {
    const read = GitPktLine.streamReader(input)
    // And now for the ridiculous side-band or side-band-64k protocol
    const packetlines = new FIFO()
    const packfile = new FIFO()
    const progress = new FIFO()
    // TODO: Use a proper through stream?
    let finishedResolver: (() => void) | null = null
    const finished = new Promise<void>((resolve) => {
      finishedResolver = resolve
    })
    let lineCount = 0
    let packBytes = 0
    const nextBit = async function (): Promise<void> {
      try {
        lineCount++
        debugSideBand('Waiting for next pkt-line', { lineCount })
        const line = await read()
        if (line === null) {
          debugSideBand('Received flush pkt-line (0000)', { lineCount })
          return nextBit()
        }
        // A made up convention to signal there's no more to read.
        if (line === true) {
          debugSideBand('Stream reader signaled completion', {
            lineCount,
            packBytes,
          })
          packetlines.end()
          progress.end()
          ;(input as any).error ? packfile.destroy((input as any).error) : packfile.end()
          if (finishedResolver) finishedResolver()
          return
        }
        if (!line || line.length === 0) {
          debugSideBand('Received empty pkt-line payload', { lineCount })
          return nextBit()
        }
        const channel = line[0]
        switch (channel) {
          case 1: {
            const payload = line.slice(1)
            packBytes += payload.length
            debugSideBand('Received pack data chunk', {
              lineCount,
              chunkBytes: payload.length,
              packBytes,
            })
            // pack data
            packfile.write(payload)
            break
          }
          case 2: {
            debugSideBand('Received progress chunk', {
              lineCount,
              bytes: line.length - 1,
              preview: line.slice(1, Math.min(line.length, 64)).toString('utf8'),
            })
            // progress message
            progress.write(line.slice(1))
            break
          }
          case 3: {
            // fatal error message just before stream aborts
            const error = line.slice(1)
            debugSideBand('Received fatal error chunk', {
              lineCount,
              bytes: error.length,
              message: error.toString('utf8'),
            })
            progress.write(error)
            packetlines.end()
            progress.end()
            packfile.destroy(new Error(error.toString('utf8')))
            if (finishedResolver) finishedResolver()
            return
          }
          default: {
            debugSideBand('Received control pkt-line', {
              lineCount,
              bytes: line.length,
              channel,
            })
            // Not part of the side-band-64k protocol
            packetlines.write(line)
          }
        }
        // Careful not to blow up the stack.
        // I think Promises in a tail-call position should be OK.
        nextBit()
      } catch (err) {
        debugSideBand('Sideband processing error', {
          lineCount,
          error: err instanceof Error ? err.message : String(err),
        })
        // Stream error - end all FIFOs
        packetlines.end()
        progress.end()
        packfile.destroy(err instanceof Error ? err : new Error(String(err)))
        if (finishedResolver) finishedResolver()
      }
    }
    nextBit()
    return {
      packetlines,
      packfile,
      progress,
      finished,
    }
  }
  // static mux ({
  //   protocol, // 'side-band' or 'side-band-64k'
  //   packetlines,
  //   packfile,
  //   progress,
  //   error
  // }) {
  //   const MAX_PACKET_LENGTH = protocol === 'side-band-64k' ? 999 : 65519
  //   let output = new PassThrough()
  //   packetlines.on('data', data => {
  //     if (data === null) {
  //       output.write(GitPktLine.flush())
  //     } else {
  //       output.write(GitPktLine.encode(data))
  //     }
  //   })
  //   let packfileWasEmpty = true
  //   let packfileEnded = false
  //   let progressEnded = false
  //   let errorEnded = false
  //   let goodbye = UniversalBuffer.concat([
  //     GitPktLine.encode(UniversalBuffer.from('010A', 'hex')),
  //     GitPktLine.flush()
  //   ])
  //   packfile
  //     .on('data', data => {
  //       packfileWasEmpty = false
  //       const buffers = splitBuffer(data, MAX_PACKET_LENGTH)
  //       for (const buffer of buffers) {
  //         output.write(
  //           GitPktLine.encode(UniversalBuffer.concat([UniversalBuffer.from('01', 'hex'), buffer]))
  //         )
  //       }
  //     })
  //     .on('end', () => {
  //       packfileEnded = true
  //       if (!packfileWasEmpty) output.write(goodbye)
  //       if (progressEnded && errorEnded) output.end()
  //     })
  //   progress
  //     .on('data', data => {
  //       const buffers = splitBuffer(data, MAX_PACKET_LENGTH)
  //       for (const buffer of buffers) {
  //         output.write(
  //           GitPktLine.encode(UniversalBuffer.concat([UniversalBuffer.from('02', 'hex'), buffer]))
  //         )
  //       }
  //     })
  //     .on('end', () => {
  //       progressEnded = true
  //       if (packfileEnded && errorEnded) output.end()
  //     })
  //   error
  //     .on('data', data => {
  //       const buffers = splitBuffer(data, MAX_PACKET_LENGTH)
  //       for (const buffer of buffers) {
  //         output.write(
  //           GitPktLine.encode(UniversalBuffer.concat([UniversalBuffer.from('03', 'hex'), buffer]))
  //         )
  //       }
  //     })
  //     .on('end', () => {
  //       errorEnded = true
  //       if (progressEnded && packfileEnded) output.end()
  //     })
  //   return output
  // }
}

