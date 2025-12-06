/**
 * Git Side-Band Demuxing
 * 
 * Demultiplexes side-band encoded data from git-upload-pack responses.
 * Side-band '1' = packfile data
 * Side-band '2' = progress messages
 * Side-band '3' = error messages
 */
import { GitPktLine } from './GitPktLine.ts';

export interface SideBandResult {
  packetlines: AsyncIterableIterator<Uint8Array>;
  packfile: AsyncIterableIterator<Uint8Array>;
  progress: AsyncIterableIterator<Uint8Array>;
  finished: Promise<void>;
}

export class GitSideBand {
  /**
   * Demultiplexes side-band encoded stream
   */
  static demux(input: AsyncIterableIterator<Uint8Array>): SideBandResult {
    const read = GitPktLine.streamReader(input);
    
    const packetlinesQueue: Uint8Array[] = [];
    const packfileQueue: Uint8Array[] = [];
    const progressQueue: Uint8Array[] = [];
    
    let packetlinesResolve: (() => void) | null = null;
    let packfileResolve: (() => void) | null = null;
    let progressResolve: (() => void) | null = null;
    
    let packetlinesDone = false;
    let packfileDone = false;
    let progressDone = false;
    
    const finished = new Promise<void>((resolve) => {
      const checkDone = () => {
        if (packetlinesDone && packfileDone && progressDone) {
          resolve();
        }
      };
      packetlinesResolve = checkDone;
      packfileResolve = checkDone;
      progressResolve = checkDone;
    });

    // Process stream
    (async () => {
      try {
        while (true) {
          const line = await read();
          
          if (line === true) {
            // End of stream
            packetlinesDone = true;
            packfileDone = true;
            progressDone = true;
            if (packetlinesResolve) packetlinesResolve();
            break;
          }
          
          if (line === null) {
            // Flush packet - add to packetlines
            continue;
          }
          
          if (line.length === 0) {
            continue;
          }
          
          // First byte is the channel
          const channel = line[0];
          const payload = line.slice(1);
          
          switch (channel) {
            case 1: // Packfile data
              packfileQueue.push(payload);
              break;
            case 2: // Progress
              progressQueue.push(payload);
              break;
            case 3: // Error (treat as progress for now)
              progressQueue.push(payload);
              break;
            default:
              // Unknown channel - add to packetlines
              packetlinesQueue.push(line);
          }
          
          // Also add to packetlines for protocol parsing
          packetlinesQueue.push(line);
        }
      } catch (error) {
        packetlinesDone = true;
        packfileDone = true;
        progressDone = true;
        if (packetlinesResolve) packetlinesResolve();
      }
    })();

    // Create async iterators
    const createIterator = (
      queue: Uint8Array[],
      setDone: () => void
    ): AsyncIterableIterator<Uint8Array> => {
      return (async function* () {
        while (!queue.length || !packetlinesDone) {
          if (queue.length > 0) {
            yield queue.shift()!;
          } else {
            // Wait a bit
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        // Yield remaining items
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        setDone();
      })();
    };

    return {
      packetlines: createIterator(packetlinesQueue, () => {
        packetlinesDone = true;
        if (packetlinesResolve) packetlinesResolve();
      }),
      packfile: createIterator(packfileQueue, () => {
        packfileDone = true;
        if (packfileResolve) packfileResolve();
      }),
      progress: createIterator(progressQueue, () => {
        progressDone = true;
        if (progressResolve) progressResolve();
      }),
      finished,
    };
  }
}
