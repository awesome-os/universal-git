import { GitPktLine } from './GitPktLine.js'; // Assumed to be Web Streams / Uint8Array compatible

// Helper function: Splits a Uint8Array into smaller chunks.
// This is used for side-band messages that need to be split if they exceed MAX_PAYLOAD_LENGTH.
function splitBuffer(buffer, maxLength) {
  const chunks = [];
  let offset = 0;
  while (offset < buffer.length) {
    const end = Math.min(offset + maxLength, buffer.length);
    chunks.push(buffer.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export class GitSideBand {
  /**
   * Demultiplexes a Git side-band stream into three separate ReadableStreams.
   *
   * The input stream is expected to yield Uint8Array packets as defined by Git's pkt-line
   * and side-band protocols.
   *
   * @param {ReadableStream<Uint8Array>} input The incoming stream of raw pkt-line data.
   * @returns {{
   *   packetlines: ReadableStream<Uint8Array>,
   *   packfile: ReadableStream<Uint8Array>,
   *   progress: ReadableStream<Uint8Array>
   * }} An object containing three ReadableStream instances:
   *   - `packetlines`: For regular pkt-lines that are not part of the side-band multiplexing.
   *   - `packfile`: For the actual packfile data (side-band '1').
   *   - `progress`: For progress/error messages (side-band '2' and '3').
   */
  static demux(input) {
    let packetlinesController;
    let packfileController;
    let progressController;

    // Create the three output ReadableStreams.
    const packetlines = new ReadableStream({
      start(controller) {
        packetlinesController = controller;
      },
      // You could add a `cancel` method here to handle downstream cancellation
      // if it should affect the upstream `input` stream.
    });
    const packfile = new ReadableStream({
      start(controller) {
        packfileController = controller;
      },
    });
    const progress = new ReadableStream({
      start(controller) {
        progressController = controller;
      },
    });

    let streamsTerminated = false; // Flag to ensure controllers are only closed/errored once

    /**
     * Closes all output streams.
     */
    const closeAllStreams = () => {
      if (streamsTerminated) return;
      streamsTerminated = true;
      packetlinesController.close();
      packfileController.close();
      progressController.close();
    };

    /**
     * Aborts all output streams with a given error.
     * @param {Error} error The error to propagate.
     */
    const errorAllStreams = (error) => {
      if (streamsTerminated) return;
      streamsTerminated = true;
      packetlinesController.error(error);
      packfileController.error(error);
      progressController.error(error);
    };

    // `GitPktLine.streamReader` is assumed to be a function that takes a ReadableStream
    // and returns an async iterator or an async function that reads a single pkt-line.
    // It should yield Uint8Array for data, `null` for flush packets, and `true` for end of stream.
    const pktLineReadFn = GitPktLine.streamReader(input);

    // Asynchronously processes the input stream and dispatches data to the appropriate output streams.
    const processStream = async () => {
      try {
        while (true) {
          if (streamsTerminated) break; // Stop if a fatal error or explicit close occurred

          const line = await pktLineReadFn();

          // `true` signals the end of the input stream.
          if (line === true) {
            closeAllStreams();
            break; // Exit the loop
          }
          // `null` signals a flush packet, which is ignored in side-band demuxing.
          if (line === null) {
            continue; // Read next line
          }

          // Ensure `line` is a Uint8Array as expected for byte-level operations.
          if (!(line instanceof Uint8Array)) {
            throw new TypeError('Expected Uint8Array from GitPktLine.streamReader');
          }

          // Examine the first byte to determine the side-band channel.
          switch (line[0]) {
            case 1: { // Side-band '1': Packfile data
              packfileController.enqueue(line.slice(1));
              break;
            }
            case 2: { // Side-band '2': Progress information
              progressController.enqueue(line.slice(1));
              break;
            }
            case 3: { // Side-band '3': Fatal error information
              const errorBuffer = line.slice(1);
              const errorMessage = new TextDecoder().decode(errorBuffer); // Convert Uint8Array to string
              progressController.enqueue(errorBuffer); // Send error message to progress stream before aborting
              errorAllStreams(new Error(errorMessage)); // Abort all streams due to fatal error
              break; // Exit the loop as streams are aborted
            }
            default: { // Not a recognized side-band byte, treat as a regular packet-line
              packetlinesController.enqueue(line);
            }
          }
        }
      } catch (e) {
        // If an error occurs during reading from the input stream or during processing,
        // propagate this error to all output streams.
        errorAllStreams(e);
      }
    };

    // Start the asynchronous processing in the background.
    processStream();

    return {
      packetlines,
      packfile,
      progress,
    };
  }

  /**
   * Multiplexes multiple Git-related streams into a single side-band enabled Git pkt-line stream.
   *
   * @param {{
   *   protocol: 'side-band' | 'side-band-64k',
   *   packetlines: ReadableStream<Uint8Array & { type: 'flush' }>,
   *   packfile: ReadableStream<Uint8Array>,
   *   progress: ReadableStream<Uint8Array>,
   *   error: ReadableStream<Uint8Array>
   * }} options
   *   - `protocol`: 'side-band' or 'side-band-64k' to determine chunk size.
   *   - `packetlines`: Stream of regular pkt-line payloads. A special `{ type: 'flush' }`
   *                    object can be enqueued to represent a Git flush packet.
   *   - `packfile`: Stream of raw packfile data.
   *   - `progress`: Stream of progress messages.
   *   - `error`: Stream of error messages (distinctly tagged as side-band 3).
   * @returns {ReadableStream<Uint8Array>} A single stream of multiplexed pkt-lines.
   */
  static mux({
    protocol,
    packetlines,
    packfile,
    progress,
    error
  }) {
    // Determine the maximum payload length for side-band chunks.
    // This is the number of data bytes *after* the 1-byte side-band code.
    const MAX_PAYLOAD_LENGTH = protocol === 'side-band-64k' ? 65519 : 999;

    // A special "goodbye" packet for the packfile stream, indicating its end.
    // This is a side-band '1' (packfile) message containing a single LF (0x0A) byte.
    const PACKFILE_GOODBYE = GitPktLine.encode(new Uint8Array([0x01, 0x0A]));

    let packfileWasEmpty = true; // Flag to track if the packfile stream ever received data.

    // Counter to track the number of active input streams.
    // The output stream closes only when all input streams have processed and ended.
    let activeInputStreams = 4; // packetlines, packfile, progress, error

    // Create the output ReadableStream.
    const outputStream = new ReadableStream({
      async start(controller) {
        // Function to enqueue a packet-line.
        // `controller.enqueue` adds the chunk to the internal queue.
        // Backpressure is implicitly managed by the consumer pulling data.
        const enqueuePktLine = (pktLineBuffer) => {
          controller.enqueue(pktLineBuffer);
        };

        // Function to decrement the active stream count and close the output stream if all are done.
        const signalStreamEnd = () => {
          activeInputStreams--;
          if (activeInputStreams === 0) {
            controller.close();
          }
        };

        // Function to propagate errors from any input stream to the output stream.
        const signalStreamError = (err) => {
          // Only error the controller if it hasn't been closed or errored already.
          // `controller.desiredSize` being undefined or <= 0 can be an indicator of a closed/errored state.
          if (controller.desiredSize === undefined || Number(controller.desiredSize) > 0) {
            controller.error(err);
          }
          // Other `process...` loops will naturally stop/error when trying to read or enqueue.
        };

        // Acquire readers for each input stream.
        const packetlinesReader = packetlines.getReader();
        const packfileReader = packfile.getReader();
        const progressReader = progress.getReader();
        const errorReader = error.getReader();

        // Process the `packetlines` stream: regular pkt-lines or flush signals.
        const processPacketlines = async () => {
          try {
            while (true) {
              const { value, done } = await packetlinesReader.read();
              if (done) break;

              if (value && typeof value === 'object' && value.type === 'flush') {
                enqueuePktLine(GitPktLine.flush());
              } else if (value instanceof Uint8Array) {
                enqueuePktLine(GitPktLine.encode(value));
              } else {
                throw new TypeError('packetlines stream yielded unexpected value type.');
              }
            }
          } catch (e) {
            signalStreamError(e);
          } finally {
            packetlinesReader.releaseLock();
            signalStreamEnd();
          }
        };

        // Process side-band streams: packfile, progress, or error data.
        const processSideBandStream = async (reader, sideBandCode) => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              if (sideBandCode === 1) { // Special handling for packfile to track if it had content.
                packfileWasEmpty = false;
              }

              if (!(value instanceof Uint8Array)) {
                throw new TypeError(`Stream (side-band ${sideBandCode}) yielded unexpected value type.`);
              }

              const chunks = splitBuffer(value, MAX_PAYLOAD_LENGTH);
              const sideBandPrefix = new Uint8Array([sideBandCode]); // e.g., [0x01], [0x02], [0x03]

              for (const chunk of chunks) {
                // Concatenate the side-band prefix byte with the data chunk.
                const prefixedChunk = new Uint8Array(sideBandPrefix.length + chunk.length);
                prefixedChunk.set(sideBandPrefix, 0);
                prefixedChunk.set(chunk, sideBandPrefix.length);
                enqueuePktLine(GitPktLine.encode(prefixedChunk));
              }
            }
          } catch (e) {
            signalStreamError(e);
          } finally {
            reader.releaseLock();
            if (sideBandCode === 1 && !packfileWasEmpty) {
              // Send the packfile goodbye message if the packfile stream was not empty.
              enqueuePktLine(PACKFILE_GOODBYE);
            }
            signalStreamEnd();
          }
        };

        // Launch all stream processing concurrently.
        // `Promise.all` here helps manage the overall lifecycle and propagate any unhandled errors.
        Promise.all([
          processPacketlines(),
          processSideBandStream(packfileReader, 1),
          processSideBandStream(progressReader, 2),
          processSideBandStream(errorReader, 3)
        ]).catch(e => {
          // This catch block handles any unhandled rejections from the individual async functions.
          // In most cases, `signalStreamError` will have already been called from within.
          signalStreamError(e);
        });
      }
    });

    return outputStream;
  }
}
