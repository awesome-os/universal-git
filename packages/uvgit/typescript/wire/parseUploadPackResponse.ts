/**
 * Parse Git Upload Pack Response
 * Parses the response from git-upload-pack service
 */
import { GitPktLine } from './GitPktLine.ts';
import { GitSideBand } from './GitSideBand.ts';

export interface UploadPackResponse {
  shallows: string[];
  unshallows: string[];
  acks: Array<{ oid: string; status?: string }>;
  nak: boolean;
  packfile: AsyncIterableIterator<Uint8Array>;
  progress: AsyncIterableIterator<Uint8Array>;
  finished: Promise<void>;
}

/**
 * Parses git-upload-pack response
 */
export async function parseUploadPackResponse(
  stream: AsyncIterableIterator<Uint8Array>,
  protocolVersion: 1 | 2 = 1
): Promise<UploadPackResponse> {
  const { packetlines, packfile, progress, finished } = GitSideBand.demux(stream);

  const shallows: string[] = [];
  const unshallows: string[] = [];
  const acks: Array<{ oid: string; status?: string }> = [];
  let nak = false;
  let done = false;
  let inShallowInfo = false;
  let inUnshallowInfo = false;

  const read = GitPktLine.streamReader(packetlines);

  return new Promise<UploadPackResponse>((resolve) => {
    (async () => {
      try {
        while (!done) {
          const line = await read();
          
          if (line === true) {
            done = true;
            break;
          }
          
          if (line === null) {
            continue;
          }

          const lineStr = new TextDecoder().decode(line).trim();

          if (protocolVersion === 2) {
            if (lineStr === 'shallow-info') {
              inShallowInfo = true;
              inUnshallowInfo = false;
              continue;
            } else if (lineStr === 'unshallow-info') {
              inUnshallowInfo = true;
              inShallowInfo = false;
              continue;
            } else if (lineStr === '') {
              inShallowInfo = false;
              inUnshallowInfo = false;
              continue;
            } else if (inShallowInfo && /^[0-9a-f]{40}$/i.test(lineStr)) {
              shallows.push(lineStr);
              continue;
            } else if (inUnshallowInfo && /^[0-9a-f]{40}$/i.test(lineStr)) {
              unshallows.push(lineStr);
              continue;
            } else if (lineStr.startsWith('shallow ')) {
              const oid = lineStr.slice(8).trim();
              if (/^[0-9a-f]{40}$/i.test(oid)) {
                shallows.push(oid);
              }
              continue;
            } else if (lineStr.startsWith('unshallow ')) {
              const oid = lineStr.slice(10).trim();
              if (/^[0-9a-f]{40}$/i.test(oid)) {
                unshallows.push(oid);
              }
              continue;
            } else if (lineStr.startsWith('ack ')) {
              const parts = lineStr.split(' ');
              const oid = parts[1];
              const status = parts[2];
              if (oid && /^[0-9a-f]{40}$/i.test(oid)) {
                acks.push({ oid, status });
              }
              continue;
            } else if (lineStr === 'nak') {
              nak = true;
              done = true;
              break;
            } else if (lineStr === 'packfile') {
              // Packfile follows
              done = true;
              break;
            }
          } else {
            // Protocol v1
            if (lineStr.startsWith('shallow ')) {
              const oid = lineStr.slice(8).trim();
              if (/^[0-9a-f]{40}$/i.test(oid)) {
                shallows.push(oid);
              }
            } else if (lineStr.startsWith('unshallow ')) {
              const oid = lineStr.slice(10).trim();
              if (/^[0-9a-f]{40}$/i.test(oid)) {
                unshallows.push(oid);
              }
            } else if (lineStr.startsWith('ack ')) {
              const parts = lineStr.split(' ');
              const oid = parts[1];
              const status = parts[2];
              if (oid && /^[0-9a-f]{40}$/i.test(oid)) {
                acks.push({ oid, status });
                if (status === 'continue' || status === 'common') {
                  // Continue processing
                } else {
                  done = true;
                  break;
                }
              }
            } else if (lineStr === 'nak') {
              nak = true;
              done = true;
              break;
            }
          }
        }
      } catch (error) {
        // Error handling
      }

      resolve({
        shallows,
        unshallows,
        acks,
        nak,
        packfile,
        progress,
        finished,
      });
    })();
  });
}
